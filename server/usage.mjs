import { CONFIG, getApiKey } from "./config.mjs";
import { generateSessionId } from "./session.mjs";
import crypto from "node:crypto";

class UsageTracker {
  constructor() {
    this.sessionRequests = 0;
    this.sessionTokens = { input: 0, output: 0, total: 0 };
    this.lastChecked = 0;
    this.cachedUpstreamUsage = null;
  }

  recordUsage(usage) {
    if (!usage) return;
    this.sessionRequests++;
    this.sessionTokens.input += usage.prompt_tokens || usage.input_tokens || 0;
    this.sessionTokens.output += usage.completion_tokens || usage.output_tokens || 0;
    this.sessionTokens.total += usage.total_tokens || 0;
  }

  async getUpstreamUsage() {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const now = Date.now();
    if (this.cachedUpstreamUsage && now - this.lastChecked < 60000) {
      return this.cachedUpstreamUsage;
    }

    const sessionId = generateSessionId();
    try {
      const resp = await fetch(`${CONFIG.UPSTREAM_BASE_URL}/usage`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": CONFIG.USER_AGENT,
          "x-opencode-client": CONFIG.CLIENT,
          "x-opencode-session": sessionId,
          "x-opencode-request": crypto.randomUUID()
        }
      });

      if (resp.ok) {
        this.cachedUpstreamUsage = await resp.json();
        this.lastChecked = now;
        return this.cachedUpstreamUsage;
      }
    } catch {
      // Endpoint may not be implemented upstream or require workspace ID
    }

    return null;
  }

  getStatus() {
    return {
      sessionRequests: this.sessionRequests,
      sessionTokens: this.sessionTokens,
      upstream: this.cachedUpstreamUsage
    };
  }
}

export const usageTracker = new UsageTracker();
