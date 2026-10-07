import { CONFIG, getApiKey } from "./config.mjs";
import { generateSessionId } from "./session.mjs";
import crypto from "node:crypto";

class ModelCatalog {
  constructor() {
    this.models = [];
    this.lastFetched = 0;
    this.ttlMs = 15 * 60 * 1000; // 15 minutes cache
  }

  /**
   * Normalizes model ID by stripping any plugin or harness prefixes.
   */
  normalizeModelId(modelId) {
    if (!modelId || modelId === "default" || modelId === "auto") {
      return CONFIG.DEFAULT_MODEL;
    }
    return modelId
      .replace(/^opencode-unlocked-/, "")
      .replace(/^opencode-go-/, "")
      .trim();
  }

  /**
   * Fetches models dynamically from upstream OpenCode Go /models endpoint.
   */
  async getModels(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.models.length > 0 && now - this.lastFetched < this.ttlMs) {
      return this.models;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      // Return static fallback if no key is configured yet
      return this.getFallbackModels();
    }

    const sessionId = generateSessionId();
    const requestId = crypto.randomUUID();

    try {
      const resp = await fetch(`${CONFIG.UPSTREAM_BASE_URL}/models`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": CONFIG.USER_AGENT,
          "x-opencode-client": CONFIG.CLIENT,
          "x-opencode-project": CONFIG.PROJECT,
          "x-opencode-session": sessionId,
          "x-opencode-session-id": sessionId,
          "x-session-affinity": sessionId,
          "X-Session-Id": sessionId,
          "x-opencode-request": requestId,
          "Accept": "application/json"
        }
      });

      if (!resp.ok) {
        console.error(`[Opencode Unlocked] Failed to fetch upstream models: ${resp.status}`);
        return this.models.length > 0 ? this.models : this.getFallbackModels();
      }

      const data = await resp.json();
      const rawList = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);

      this.models = rawList.map((m) => {
        const id = typeof m === "string" ? m : m.id;
        const name = typeof m === "string" ? m : (m.name || m.id);
        return {
          id,
          object: "model",
          created: 1700000000,
          owned_by: "opencode",
          name,
          is_default: id === CONFIG.DEFAULT_MODEL
        };
      });

      // Ensure default model is in the catalog
      if (!this.models.some((m) => m.id === CONFIG.DEFAULT_MODEL)) {
        this.models.unshift({
          id: CONFIG.DEFAULT_MODEL,
          object: "model",
          created: 1700000000,
          owned_by: "opencode",
          name: "Muse Spark 1.3 Contributor",
          is_default: true
        });
      }

      this.lastFetched = now;
      return this.models;
    } catch (err) {
      console.error(`[Opencode Unlocked] Error fetching models: ${err.message}`);
      return this.models.length > 0 ? this.models : this.getFallbackModels();
    }
  }

  getFallbackModels() {
    return [
      { id: "muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor", is_default: true },
      { id: "space-bunny", name: "Space Bunny", is_default: false },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", is_default: false },
      { id: "glm-5.3", name: "GLM 5.3", is_default: false },
      { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", is_default: false },
      { id: "kimi-k2.5", name: "Kimi K2.5", is_default: false },
      { id: "minimax-01", name: "MiniMax 01", is_default: false },
      { id: "qwen3.5-max", name: "Qwen 3.5 Max", is_default: false }
    ].map(m => ({ ...m, object: "model", created: 1700000000, owned_by: "opencode" }));
  }
}

export const catalog = new ModelCatalog();
