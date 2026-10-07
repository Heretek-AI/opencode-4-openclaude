import crypto from "node:crypto";

const ID_LENGTH = 26;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
let counter = 0;

/**
 * OpenCode v2 descending identifier generator.
 * Produces a time-ordered sortable 26-character identifier.
 * First 12 characters: hex-encoded bitwise-inverted timestamp (48 bits).
 * Remaining 14 characters: cryptographically random base62 characters.
 */
export function generateDescendingIdentifier(timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const value = ~current; // Descending sort order
  const timeHex = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("");

  const randomBytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH - 12));
  const randomChars = Array.from(randomBytes, (b) => BASE62_CHARS[b % 62]).join("");

  return timeHex + randomChars;
}

/**
 * Generates an authentic OpenCode v2 Session ID.
 * Format: "ses_" + 26 chars = exactly 30 characters.
 * Matches packages/schema/src/session-id.ts exactly.
 */
export function generateSessionId() {
  return `ses_${generateDescendingIdentifier()}`;
}

/**
 * Validates whether a given string matches the authentic OpenCode v2 Session ID format.
 */
export function isValidSessionId(id) {
  if (typeof id !== "string" || id.length !== 30) return false;
  return /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(id);
}

/**
 * Session Affinity Cache
 * Maps client conversation IDs (or IP/caller hashes) to persistent OpenCode session IDs
 * to ensure prompt-cache affinity across turns.
 */
class SessionAffinityManager {
  constructor(ttlMs = 4 * 60 * 60 * 1000) { // 4 hours default TTL
    this.sessions = new Map();
    this.ttlMs = ttlMs;
  }

  getOrCreate(clientIdentifier) {
    const key = clientIdentifier || "default";
    const now = Date.now();
    const existing = this.sessions.get(key);

    if (existing && now - existing.timestamp < this.ttlMs) {
      existing.timestamp = now; // Slide TTL window
      return existing.sessionId;
    }

    const sessionId = generateSessionId();
    this.sessions.set(key, { sessionId, timestamp: now });
    return sessionId;
  }

  set(clientIdentifier, sessionId) {
    const key = clientIdentifier || "default";
    this.sessions.set(key, { sessionId, timestamp: Date.now() });
  }

  clear() {
    this.sessions.clear();
  }
}

export const sessionAffinity = new SessionAffinityManager();
