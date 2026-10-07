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
    console.log(`  Usage: ${JSON.stringify(spaceJson.usage)}`);
    assert.ok(spaceReply && /yellow/i.test(spaceReply), "Space Bunny should correctly reply with yellow");

    console.log("\n==================================================");
    console.log("✔ LIVE VERIFICATION PASSED FOR BOTH MODELS!");
    console.log("==================================================");
  } catch (err) {
    console.error("\n❌ Live model verification failed:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
