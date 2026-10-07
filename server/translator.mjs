/**
 * Protocol Translation Layer
 * 
 * OpenCode Go hosts models across two primary OpenAI API protocols:
 * 1. Standard Chat Completions (/chat/completions): space-bunny, deepseek-v4-flash, glm-5.3, etc.
 * 2. Responses API (/responses): muse-spark-1.3-contributor, gpt-5.6-luna, gpt-5.*, grok-*
 * 
 * OpenClaude sends standard /v1/chat/completions.
 * This module transparently adapts requests and streaming responses for models requiring /responses.
 */

// Models that strictly mandate the OpenAI Responses API protocol (/responses)
const RESPONSES_API_MODELS = new Set([
  "muse-spark-1.3-contributor",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-nano",
  "grok-4.5",
  "grok-build-0.1",
]);

/**
 * Checks whether a given model requires the /responses endpoint.
 */
export function requiresResponsesApi(modelName) {
  if (!modelName) return false;
  const normalized = modelName.toLowerCase().replace(/^(opencode-unlocked-|opencode-go-)/, "");
  if (RESPONSES_API_MODELS.has(normalized)) return true;
  // Prefix matching for gpt-5.* family if newer variants appear
  if (normalized.startsWith("gpt-5") || normalized.startsWith("muse-spark")) return true;
  return false;
}

/**
 * Translates an OpenAI Chat Completions request body into an OpenAI Responses API body.
 */
export function chatCompletionsToResponsesBody(body) {
  const { messages, input, model, stream, temperature, max_tokens, max_output_tokens, tools, tool_choice, stop } = body;

  const rawMessages = Array.isArray(input) ? input : Array.isArray(messages) ? messages : [];

  // Map messages to Responses API input format
  const formattedInput = rawMessages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;

    // Direct Responses API items pass through
    if (!msg.role && msg.type) return msg;

    // Standard Chat Completion messages
    const role = msg.role;
    const content = msg.content;

    if (role === "system" || role === "developer") {
      return {
        role: "system",
        content: typeof content === "string" ? content : (Array.isArray(content) ? content.map(c => c.text || "").join("") : "")
      };
    }

    if (role === "user") {
      if (typeof content === "string") {
        return { role: "user", content };
      }
      if (Array.isArray(content)) {
        return {
          role: "user",
          content: content.map((part) => {
            if (part.type === "text" || part.type === "input_text") {
              return { type: "text", text: part.text || "" };
            }
            if (part.type === "image_url") {
              return { type: "image_url", image_url: part.image_url };
            }
            return part;
          })
        };
      }
      return { role: "user", content: String(content || "") };
    }

    if (role === "assistant") {
      const out = { role: "assistant" };
      if (typeof content === "string") out.content = content;
      if (Array.isArray(msg.tool_calls)) out.tool_calls = msg.tool_calls;
      return out;
    }

    if (role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.tool_call_id,
        content: typeof content === "string" ? content : JSON.stringify(content || "")
      };
    }

    return msg;
  });

  const responsesPayload = {
    model: model.replace(/^(opencode-unlocked-|opencode-go-)/, ""),
    input: formattedInput,
    stream: !!stream,
  };

  if (typeof temperature === "number") responsesPayload.temperature = temperature;
  if (typeof max_output_tokens === "number") responsesPayload.max_output_tokens = max_output_tokens;
  else if (typeof max_tokens === "number") responsesPayload.max_output_tokens = max_tokens;

  // Translate reasoning_effort (OpenAI Chat Completions) to reasoning: { effort, summary } (Responses API)
  const incomingEffort = body.reasoning_effort || (typeof body.reasoning === "object" ? body.reasoning?.effort : undefined);
  if (incomingEffort !== "none") {
    const incomingSummary = typeof body.reasoning === "object" && body.reasoning?.summary ? body.reasoning.summary : "detailed";
    const reasoningObj = {
      summary: incomingSummary
    };
    if (incomingEffort && incomingEffort !== "auto") {
      reasoningObj.effort = incomingEffort;
    }
    responsesPayload.reasoning = reasoningObj;
  }

  if (Array.isArray(tools)) {
    responsesPayload.tools = tools.map((t) => {
      if (t.type === "function" && t.function) {
        return {
          type: "function",
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
          ...(t.function.strict !== undefined ? { strict: t.function.strict } : {})
        };
      }
      return t;
    });
  }

  if (tool_choice) {
    if (tool_choice === "auto" || tool_choice === "required" || tool_choice === "none") {
      responsesPayload.tool_choice = tool_choice;
    } else if (typeof tool_choice === "object" && tool_choice.type === "function" && tool_choice.function?.name) {
      responsesPayload.tool_choice = { type: "function", name: tool_choice.function.name };
    } else {
      responsesPayload.tool_choice = tool_choice;
    }
  }

  if (stop) responsesPayload.stop = stop;

  return responsesPayload;
}

/**
 * Translates a non-streaming Responses API JSON response to an OpenAI Chat Completions response.
 */
export function responsesToChatCompletionsResponse(responsesData, requestedModel) {
  if (!responsesData || typeof responsesData !== "object") return responsesData;

  const id = responsesData.id?.replace(/^resp_/, "chatcmpl_") || `chatcmpl_${Math.random().toString(36).slice(2)}`;
  const model = responsesData.model || requestedModel;

  let textContent = "";
  let reasoningContent = "";
  const toolCalls = [];

  const output = Array.isArray(responsesData.output) ? responsesData.output : [];
  for (const item of output) {
    if (item.type === "reasoning") {
      if (Array.isArray(item.summary)) {
        const parts = item.summary.map(s => s.text || s.content || (typeof s === "string" ? s : "")).filter(Boolean);
        if (parts.length > 0) {
          reasoningContent = parts.join("\n\n");
        }
      } else if (typeof item.summary === "string") {
        reasoningContent = item.summary;
      } else if (typeof item.content === "string") {
        reasoningContent = item.content;
      }
    } else if (item.type === "message") {
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
            textContent += part.text;
          }
        }
      } else if (typeof item.content === "string") {
        textContent += item.content;
      }
    } else if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id,
        type: "function",
        function: {
          name: item.name,
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || {})
        }
      });
    }
  }

  const stopReason = responsesData.stop_reason;
  let finishReason = "stop";
  if (stopReason === "tool_call" || stopReason === "tool_calls" || toolCalls.length > 0) finishReason = "tool_calls";
  else if (stopReason === "max_output_tokens" || stopReason === "length") finishReason = "length";
  else if (stopReason === "content_filter") finishReason = "content_filter";

  const message = {
    role: "assistant",
    content: textContent || (toolCalls.length ? null : ""),
    ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const usage = responsesData.usage ? {
    prompt_tokens: responsesData.usage.input_tokens || 0,
    completion_tokens: responsesData.usage.output_tokens || 0,
    total_tokens: (responsesData.usage.input_tokens || 0) + (responsesData.usage.output_tokens || 0),
    ...(responsesData.usage.input_tokens_details?.cached_tokens ? {
      prompt_tokens_details: { cached_tokens: responsesData.usage.input_tokens_details.cached_tokens }
    } : {})
  } : undefined;

  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason
      }
    ],
    ...(usage ? { usage } : {})
  };
}

/**
 * Transforms an SSE event line or block from Responses API format
 * into OpenAI chat.completion.chunk SSE format.
 */
export function translateResponsesEventToOpenAiChunk(eventString, state = { id: "", model: "" }) {
  if (!eventString || typeof eventString !== "string") return null;

  const lines = eventString.split("\n");
  let eventType = "";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataStr = line.slice(5).trim();
    }
  }

  if (!dataStr) return null;
  if (dataStr === "[DONE]") return "data: [DONE]\n\n";

  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return null;
  }

  const respObj = data.response || {};
  const id = respObj.id || data.id || state.id || `chatcmpl_${Math.random().toString(36).slice(2)}`;
  const model = respObj.model || data.model || state.model || "opencode-unlocked";

  state.id = id;
  state.model = model;

  const baseChunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: []
  };

  // Reasoning Summary / Reasoning Text Delta
  if (
    eventType === "response.reasoning_summary_text.delta" ||
    eventType === "response.reasoning_text.delta" ||
    data.type === "response.reasoning_summary_text.delta" ||
    data.type === "response.reasoning_text.delta"
  ) {
    let reasoningText = data.delta ?? data.text ?? data.reasoning_delta ?? "";
    if (reasoningText) {
      state.hasEmittedReasoning = true;
      if (typeof data.summary_index === "number") {
        if (state.lastSummaryIndex !== undefined && state.lastSummaryIndex !== data.summary_index) {
          reasoningText = "\n\n" + reasoningText;
        }
        state.lastSummaryIndex = data.summary_index;
      }
      baseChunk.choices.push({
        index: 0,
        delta: { reasoning_content: reasoningText },
        finish_reason: null
      });
      return `data: ${JSON.stringify(baseChunk)}\n\n`;
    }
  }

  // Text Delta
  if (
    eventType === "response.output_text.delta" ||
    eventType === "response.text.delta" ||
    data.type === "response.output_text.delta"
  ) {
    const text = data.delta ?? data.text ?? data.output_text_delta ?? "";
    if (text) {
      baseChunk.choices.push({
        index: 0,
        delta: { content: text },
        finish_reason: null
      });
      return `data: ${JSON.stringify(baseChunk)}\n\n`;
    }
  }

  // Function Call Added
  if (
    (eventType === "response.output_item.added" || data.type === "response.output_item.added") &&
    data.item?.type === "function_call"
  ) {
    baseChunk.choices.push({
      index: 0,
      delta: {
        tool_calls: [
          {
            index: 0,
            id: data.item.id || data.item.call_id,
            type: "function",
            function: {
              name: data.item.name || "",
              arguments: ""
            }
          }
        ]
      },
      finish_reason: null
    });
    return `data: ${JSON.stringify(baseChunk)}\n\n`;
  }

  // Function Call Arguments Delta
  if (
    eventType === "response.function_call_arguments.delta" ||
    data.type === "response.function_call_arguments.delta"
  ) {
    const argsDelta = data.delta ?? data.arguments_delta ?? "";
    if (argsDelta) {
      baseChunk.choices.push({
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                arguments: argsDelta
              }
            }
          ]
        },
        finish_reason: null
      });
      return `data: ${JSON.stringify(baseChunk)}\n\n`;
    }
  }

  // Response Completed
  if (eventType === "response.completed" || data.type === "response.completed") {
    const sr = respObj.stop_reason ?? data.stop_reason;
    let fr = "stop";
    if (sr === "tool_call" || sr === "tool_calls") fr = "tool_calls";
    else if (sr === "max_output_tokens" || sr === "length") fr = "length";
    else if (sr === "content_filter") fr = "content_filter";

    baseChunk.choices.push({
      index: 0,
      delta: {},
      finish_reason: fr
    });

    const u = respObj.usage ?? data.response?.usage ?? data.usage;
    if (u) {
      baseChunk.usage = {
        prompt_tokens: u.input_tokens || 0,
        completion_tokens: u.output_tokens || 0,
        total_tokens: (u.input_tokens || 0) + (u.output_tokens || 0),
        ...(u.input_tokens_details?.cached_tokens ? {
          prompt_tokens_details: { cached_tokens: u.input_tokens_details.cached_tokens }
        } : {})
      };
      state.usage = baseChunk.usage;
    }

    return `data: ${JSON.stringify(baseChunk)}\n\n`;
  }

  return null;
}
