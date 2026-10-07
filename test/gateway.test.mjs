import assert from "node:assert/strict";
import { createGatewayServer } from "../server/gateway.mjs";
import { getApiKey } from "../server/config.mjs";

console.log("=== Running Gateway Integration Tests ===");

const TEST_PORT = 8799;
const server = createGatewayServer();

server.listen(TEST_PORT, "127.0.0.1", async () => {
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const apiKey = getApiKey();

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, "ok");
    console.log("✔ Health check passed");

    // 2. Models list
    const modelsRes = await fetch(`${baseUrl}/v1/models`);
    assert.equal(modelsRes.status, 200);
    const modelsData = await modelsRes.json();
    assert.ok(Array.isArray(modelsData.data));
    assert.ok(modelsData.data.length > 0);
    console.log(`✔ Models list passed (${modelsData.data.length} models)`);

    if (apiKey) {
      // 3. Test space-bunny non-streaming
      console.log("Testing space-bunny non-streaming...");
      const spaceRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "space-bunny",
          messages: [{ role: "user", content: "Reply with exactly 'OK-SPACE'" }],
          stream: false,
          max_tokens: 20
        })
      });
      assert.equal(spaceRes.status, 200, "space-bunny should return 200");
      const spaceData = await spaceRes.json();
      assert.ok(spaceData.choices?.[0]?.message?.content);
      console.log(`✔ space-bunny non-streaming passed: "${spaceData.choices[0].message.content.trim()}"`);

      // 4. Test muse-spark-1.3-contributor non-streaming (Responses API translation)
      console.log("Testing muse-spark-1.3-contributor non-streaming (translated to /responses)...");
      const museRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "muse-spark-1.3-contributor",
          messages: [{ role: "user", content: "Reply with exactly 'OK-MUSE'" }],
          stream: false,
          max_tokens: 1000
        })
      });
      assert.equal(museRes.status, 200, "muse-spark-1.3-contributor should return 200");
      const museData = await museRes.json();
      assert.ok(museData.choices?.[0]?.message?.content);
      console.log(`✔ muse-spark-1.3-contributor non-streaming passed: "${museData.choices[0].message.content.trim()}"`);

      // 5. Test muse-spark-1.3-contributor streaming (SSE translation)
      console.log("Testing muse-spark-1.3-contributor streaming (translated to SSE)...");
      const streamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "muse-spark-1.3-contributor",
          messages: [{ role: "user", content: "Reply with 'PING'" }],
          stream: true,
          max_tokens: 1000
        })
      });
      assert.equal(streamRes.status, 200, "Streaming should return 200");
      const streamText = await streamRes.text();
      assert.ok(streamText.includes("data: "), "Stream must contain SSE data blocks");
      assert.ok(streamText.includes("[DONE]"), "Stream must conclude with [DONE]");
      console.log("✔ muse-spark-1.3-contributor streaming passed");
    } else {
      console.log("⚠ Skipping live API requests (no key configured)");
    }

    console.log("✔ All Gateway Integration Tests Passed!");
  } catch (err) {
    console.error("❌ Gateway integration test failed:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
