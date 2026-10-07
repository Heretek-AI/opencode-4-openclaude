import http from "node:http";
import crypto from "node:crypto";
import { CONFIG, getApiKey } from "./config.mjs";
import { sessionAffinity, generateSessionId } from "./session.mjs";
import { catalog } from "./catalog.mjs";
import { usageTracker } from "./usage.mjs";
import {
  requiresResponsesApi,
  chatCompletionsToResponsesBody,
  responsesToChatCompletionsResponse,
  translateResponsesEventToOpenAiChunk
} from "./translator.mjs";

function sendJson(res, statusCode, data) {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(jsonStr),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": "*"
  });
  res.end(jsonStr);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB protection
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

export function createGatewayServer() {
  const server = http.createServer(async (req, res) => {
    // Enable CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400"
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    // Health Check
    if (pathname === "/health" || pathname === "/") {
      const apiKey = getApiKey();
      sendJson(res, 200, {
        status: "ok",
        name: "Opencode Unlocked Gateway",
        version: CONFIG.VERSION,
        hasKey: !!apiKey,
        defaultModel: CONFIG.DEFAULT_MODEL
      });
      return;
    }

    // Status / Quota
    if (pathname === "/status") {
      const apiKey = getApiKey();
      const upstreamUsage = await usageTracker.getUpstreamUsage();
      sendJson(res, 200, {
        status: "ok",
        keyConfigured: !!apiKey,
        defaultModel: CONFIG.DEFAULT_MODEL,
        stats: usageTracker.getStatus(),
        upstreamUsage
      });
      return;
    }

    // Models List (/v1/models and /models)
    if (req.method === "GET" && (pathname === "/v1/models" || pathname === "/models")) {
      try {
        const models = await catalog.getModels();
        sendJson(res, 200, {
          object: "list",
          data: models
        });
      } catch (err) {
        sendJson(res, 500, { error: { message: err.message, type: "internal_error" } });
      }
      return;
    }

    // Chat Completions (/v1/chat/completions and /chat/completions)
    if (req.method === "POST" && (pathname === "/v1/chat/completions" || pathname === "/chat/completions")) {
      await handleChatCompletions(req, res);
      return;
    }

    // Direct Responses endpoint (/v1/responses and /responses)
    if (req.method === "POST" && (pathname === "/v1/responses" || pathname === "/responses")) {
      await handleDirectResponses(req, res);
      return;
    }

    sendJson(res, 404, {
      error: {
        message: `Endpoint not found: ${req.method} ${pathname}`,
        type: "invalid_request_error"
      }
    });
  });

  return server;
}

async function handleChatCompletions(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { error: { message: err.message, type: "invalid_request_error" } });
    return;
  }

  // Resolve API Key
  let apiKey = getApiKey();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const passedKey = authHeader.slice(7).trim();
    if (passedKey.startsWith("oc_sk_")) {
      apiKey = passedKey;
    }
  }

  if (!apiKey) {
    sendJson(res, 401, {
      error: {
        message: "No OpenCode API key configured. Provide OPENCODE_UNLOCKED_API_KEY, GO_KEY, or run `opencode-unlocked key <key>`.",
        type: "authentication_error"
      }
    });
    return;
  }

  const rawModel = body.model || CONFIG.DEFAULT_MODEL;
  const normalizedModel = catalog.normalizeModelId(rawModel);
  body.model = normalizedModel;

  // Derive Session ID with Affinity
  const clientIdentifier =
    req.headers["x-session-id"] ||
    req.headers["x-opencode-session"] ||
    req.headers["x-conversation-id"] ||
    req.socket.remoteAddress ||
    "default";
  const sessionId = sessionAffinity.getOrCreate(clientIdentifier);
  const requestId = crypto.randomUUID();

  const useResponses = requiresResponsesApi(normalizedModel);
  const isStream = !!body.stream;

  const harnessHeaders = {
    "Authorization": `Bearer ${apiKey}`,
    "User-Agent": CONFIG.USER_AGENT,
    "x-opencode-client": CONFIG.CLIENT,
    "x-opencode-project": CONFIG.PROJECT,
    "x-opencode-session": sessionId,
    "x-opencode-session-id": sessionId,
    "x-session-affinity": sessionId,
    "X-Session-Id": sessionId,
    "x-opencode-request": requestId,
    "Content-Type": "application/json",
    "Accept": isStream ? "text/event-stream" : "application/json"
  };

  try {
    if (useResponses) {
      // Protocol Translation: ChatCompletions -> Responses API
      const responsesPayload = chatCompletionsToResponsesBody(body);
      const upstreamResp = await fetch(`${CONFIG.UPSTREAM_BASE_URL}/responses`, {
        method: "POST",
        headers: harnessHeaders,
        body: JSON.stringify(responsesPayload)
      });

      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text();
        let parsedErr;
        try {
          parsedErr = JSON.parse(errorText);
        } catch {
          parsedErr = { error: { message: errorText, type: "upstream_error" } };
        }
        sendJson(res, upstreamResp.status, parsedErr);
        return;
      }

      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*"
        });

        const state = { id: "", model: normalizedModel };
        const reader = upstreamResp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const block of parts) {
            const trimmed = block.trim();
            if (!trimmed) continue;
            const convertedChunk = translateResponsesEventToOpenAiChunk(trimmed, state);
            if (convertedChunk) {
              res.write(convertedChunk);
            }
          }
        }

        if (buffer.trim()) {
          const convertedChunk = translateResponsesEventToOpenAiChunk(buffer.trim(), state);
          if (convertedChunk) res.write(convertedChunk);
        }

        res.write("data: [DONE]\n\n");
        res.end();
        usageTracker.recordUsage(state.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
      } else {
        const responseData = await upstreamResp.json();
        const chatCompletionData = responsesToChatCompletionsResponse(responseData, normalizedModel);
        usageTracker.recordUsage(chatCompletionData.usage);
        sendJson(res, 200, chatCompletionData);
      }
    } else {
      // Standard Chat Completions Pass-Through
      const upstreamResp = await fetch(`${CONFIG.UPSTREAM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: harnessHeaders,
        body: JSON.stringify(body)
      });

      if (!upstreamResp.ok) {
        const errorText = await upstreamResp.text();
        let parsedErr;
        try {
          parsedErr = JSON.parse(errorText);
        } catch {
          parsedErr = { error: { message: errorText, type: "upstream_error" } };
        }
        sendJson(res, upstreamResp.status, parsedErr);
        return;
      }

      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*"
        });

        const reader = upstreamResp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
        usageTracker.recordUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
      } else {
        const json = await upstreamResp.json();
        usageTracker.recordUsage(json.usage);
        sendJson(res, 200, json);
      }
    }
  } catch (err) {
    console.error("[Opencode Unlocked] Upstream relay error:", err);
    sendJson(res, 502, {
      error: {
        message: `Gateway relay error: ${err.message}`,
        type: "bad_gateway"
      }
    });
  }
}

async function handleDirectResponses(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { error: { message: err.message, type: "invalid_request_error" } });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    sendJson(res, 401, { error: { message: "No OpenCode API key configured.", type: "authentication_error" } });
    return;
  }

  const rawModel = body.model || CONFIG.DEFAULT_MODEL;
  body.model = catalog.normalizeModelId(rawModel);

  const sessionId = generateSessionId();
  const isStream = !!body.stream;

  const harnessHeaders = {
    "Authorization": `Bearer ${apiKey}`,
    "User-Agent": CONFIG.USER_AGENT,
    "x-opencode-client": CONFIG.CLIENT,
    "x-opencode-project": CONFIG.PROJECT,
    "x-opencode-session": sessionId,
    "x-opencode-session-id": sessionId,
    "x-session-affinity": sessionId,
    "X-Session-Id": sessionId,
    "x-opencode-request": crypto.randomUUID(),
    "Content-Type": "application/json",
    "Accept": isStream ? "text/event-stream" : "application/json"
  };

  try {
    const upstreamResp = await fetch(`${CONFIG.UPSTREAM_BASE_URL}/responses`, {
      method: "POST",
      headers: harnessHeaders,
      body: JSON.stringify(body)
    });

    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text();
      let json;
      try { json = JSON.parse(errText); } catch { json = { error: { message: errText } }; }
      sendJson(res, upstreamResp.status, json);
      return;
    }

    if (isStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      const reader = upstreamResp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      const json = await upstreamResp.json();
      sendJson(res, 200, json);
    }
  } catch (err) {
    sendJson(res, 502, { error: { message: err.message, type: "bad_gateway" } });
  }
}

// CLI Execution entrypoint
if (process.argv[1] && process.argv[1].endsWith("gateway.mjs")) {
  const server = createGatewayServer();
  server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`[Opencode Unlocked] Bridge Gateway running on http://${CONFIG.HOST}:${CONFIG.PORT}`);
    console.log(`[Opencode Unlocked] Default model: ${CONFIG.DEFAULT_MODEL}`);
    console.log(`[Opencode Unlocked] API key resolved: ${!!getApiKey()}`);
  });

  const shutdown = () => {
    console.log("\n[Opencode Unlocked] Shutting down gateway...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
