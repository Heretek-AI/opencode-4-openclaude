import assert from "node:assert/strict";
import { createGatewayServer } from "../server/gateway.mjs";
import { getApiKey } from "../server/config.mjs";

console.log("==================================================");
console.log("   Opencode Unlocked: Live Models Verification    ");
console.log("==================================================");

const apiKey = getApiKey();
if (!apiKey) {
  console.error("❌ No API key available for live test.");
  process.exit(1);
}

const server = createGatewayServer();
const TEST_PORT = 8797;

server.listen(TEST_PORT, "127.0.0.1", async () => {
  const baseUrl = `http://127.0.0.1:${TEST_PORT}/v1`;

  try {
    // 1. Verify Default Model: Muse Spark 1.3 Contributor
    console.log("\n[1/2] Verifying Target Default Model: Muse Spark 1.3 Contributor...");
    const musePrompt = "What is 7 * 8? Reply with only the number.";
    const museStart = Date.now();

    const museRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "muse-spark-1.3-contributor",
        messages: [{ role: "user", content: musePrompt }],
        stream: false
      })
    });

    assert.equal(museRes.status, 200, `Muse Spark HTTP status should be 200 (was ${museRes.status})`);
    const museJson = await museRes.json();
    const museReply = museJson.choices?.[0]?.message?.content?.trim();
    const museDuration = ((Date.now() - museStart) / 1000).toFixed(2);
    console.log(`✔ Muse Spark 1.3 Contributor responded in ${museDuration}s:`);
    console.log(`  Output: "${museReply}"`);
    console.log(`  Usage: ${JSON.stringify(museJson.usage)}`);
    assert.ok(museReply && museReply.includes("56"), "Muse Spark should correctly calculate 7 * 8 = 56");

    // 2. Verify Alternative Model: Space Bunny
    console.log("\n[2/2] Verifying Target Model: Space Bunny...");
    const spacePrompt = "What color is a ripe banana? Reply in one word.";
    const spaceStart = Date.now();

    const spaceRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "space-bunny",
        messages: [{ role: "user", content: spacePrompt }],
        stream: false
      })
    });

    assert.equal(spaceRes.status, 200, `Space Bunny HTTP status should be 200 (was ${spaceRes.status})`);
    const spaceJson = await spaceRes.json();
    const spaceReply = spaceJson.choices?.[0]?.message?.content?.trim();
    const spaceDuration = ((Date.now() - spaceStart) / 1000).toFixed(2);
    console.log(`✔ Space Bunny responded in ${spaceDuration}s:`);
    console.log(`  Output: "${spaceReply}"`);
    assert.ok(spaceReply && /yellow/i.test(spaceReply), "Space Bunny should correctly reply with yellow");

    // 3. Verify Reasoning Effort with Muse Spark 1.3 Contributor
    console.log("\n[3/3] Verifying Configurable Reasoning Effort: Muse Spark 1.3 with reasoning_effort='high'...");
    const effortStart = Date.now();
    const effortRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "muse-spark-1.3-contributor",
        messages: [{ role: "user", content: "Is 97 prime? Reply yes or no only." }],
        reasoning_effort: "high",
        stream: false
      })
    });

    assert.equal(effortRes.status, 200, `Muse Spark with reasoning_effort should be 200 (was ${effortRes.status})`);
    const effortJson = await effortRes.json();
    const effortReply = effortJson.choices?.[0]?.message?.content?.trim();
    const effortReasoning = effortJson.choices?.[0]?.message?.reasoning_content;
    const effortDuration = ((Date.now() - effortStart) / 1000).toFixed(2);
    console.log(`✔ Muse Spark with reasoning_effort='high' responded in ${effortDuration}s:`);
    console.log(`  Reasoning: "${effortReasoning ? effortReasoning.slice(0, 80) + '...' : '(none)'}"`);
    console.log(`  Output: "${effortReply}"`);
    assert.ok(effortReply && /yes/i.test(effortReply), "Muse Spark should answer yes for prime 97");
    assert.ok(effortReasoning && effortReasoning.length > 0, "Non-streaming message should include reasoning_content");

    // 4. Verify Live Streaming Reasoning Tokens with Muse Spark 1.3 Contributor
    console.log("\n[4/4] Verifying Live Streaming Reasoning Chunks (Muse Spark 1.3)...");
    const streamStart = Date.now();
    const streamRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "muse-spark-1.3-contributor",
        messages: [{ role: "user", content: "Which is bigger: 9.11 or 9.9?" }],
        reasoning_effort: "high",
        stream: true
      })
    });

    assert.equal(streamRes.status, 200);
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let streamBuf = "";
    let reasoningTokens = "";
    let contentTokens = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamBuf += decoder.decode(value, { stream: true });
      const parts = streamBuf.split("\n\n");
      streamBuf = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.reasoning_content) {
                reasoningTokens += delta.reasoning_content;
              }
              if (delta?.content) {
                contentTokens += delta.content;
              }
            } catch {}
          }
        }
      }
    }

    const streamDuration = ((Date.now() - streamStart) / 1000).toFixed(2);
    console.log(`✔ Stream completed in ${streamDuration}s:`);
    console.log(`  Streamed Reasoning: "${reasoningTokens.slice(0, 100)}..." (${reasoningTokens.length} chars)`);
    console.log(`  Streamed Content:   "${contentTokens.slice(0, 100)}..." (${contentTokens.length} chars)`);
    assert.ok(reasoningTokens.length > 0, "Should receive streaming reasoning_content tokens");
    assert.ok(contentTokens.length > 0, "Should receive streaming content tokens");

    console.log("\n==================================================");
    console.log("✔ LIVE VERIFICATION PASSED FOR ALL MODELS & REASONING!");
    console.log("==================================================");
  } catch (err) {
    console.error("\n❌ Live model verification failed:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
