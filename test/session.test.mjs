import assert from "node:assert/strict";
import { generateDescendingIdentifier, generateSessionId, isValidSessionId, sessionAffinity } from "../server/session.mjs";

console.log("=== Running Session Tests ===");

// 1. Validate session ID length and regex
const id1 = generateSessionId();
console.log(`Generated Session ID: ${id1}`);
assert.equal(id1.length, 30, "Session ID must be exactly 30 characters");
assert.equal(id1.startsWith("ses_"), true, "Session ID must start with 'ses_'");
assert.equal(isValidSessionId(id1), true, "isValidSessionId must return true for generated ID");

// 2. Validate descending time property
const now = Date.now();
const earlierId = generateDescendingIdentifier(now - 100000);
const laterId = generateDescendingIdentifier(now);
assert.ok(
  earlierId > laterId,
  "Earlier timestamp must have greater string value in descending sort order"
);

// 3. Validate affinity manager
const clientA = "conv-123";
const sidA1 = sessionAffinity.getOrCreate(clientA);
const sidA2 = sessionAffinity.getOrCreate(clientA);
assert.equal(sidA1, sidA2, "Same client identifier must receive identical session ID");

const clientB = "conv-456";
const sidB = sessionAffinity.getOrCreate(clientB);
assert.notEqual(sidA1, sidB, "Different clients must receive distinct session IDs");

console.log("✔ All Session Tests Passed!");
