import assert from "node:assert/strict";
import {
  requiresResponsesApi,
  chatCompletionsToResponsesBody,
  responsesToChatCompletionsResponse,
  translateResponsesEventToOpenAiChunk
} from "../server/translator.mjs";

console.log("=== Running Protocol Translator Tests ===");

// 1. Verify requiresResponsesApi logic
assert.equal(requiresResponsesApi("muse-spark-1.3-contributor"), true);
assert.equal(requiresResponsesApi("opencode-unlocked-muse-spark-1.3-contributor"), true);
assert.equal(requiresResponsesApi("gpt-5.6-luna"), true);
assert.equal(requiresResponsesApi("space-bunny"), false);
assert.equal(requiresResponsesApi("deepseek-v4-flash"), false);

// 2. Chat Completions -> Responses payload conversion
const openAiReq = {
  model: "opencode-unlocked-muse-spark-1.3-contributor",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello world" }
  ],
  stream: true,
  temperature: 0.5,
  max_tokens: 1000
};

const responsesPayload = chatCompletionsToResponsesBody(openAiReq);
assert.equal(responsesPayload.model, "muse-spark-1.3-contributor");
assert.equal(responsesPayload.stream, true);
assert.equal(responsesPayload.temperature, 0.5);
assert.equal(responsesPayload.max_output_tokens, 1000);
assert.equal(responsesPayload.input.length, 2);
assert.equal(responsesPayload.input[0].role, "system");
assert.equal(responsesPayload.input[1].content, "Hello world");

// 3. Responses API non-streaming JSON -> Chat Completions JSON
const rawResponsesResp = {
  id: "resp_1234567890",
  model: "muse-spark-1.3-contributor",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello from Responses API!" }]
    }
  ],
  stop_reason: "stop",
  usage: {
    input_tokens: 15,
    output_tokens: 8
  }
};

const chatResp = responsesToChatCompletionsResponse(rawResponsesResp, "muse-spark-1.3-contributor");
assert.equal(chatResp.id, "chatcmpl_1234567890");
assert.equal(chatResp.choices[0].message.content, "Hello from Responses API!");
assert.equal(chatResp.choices[0].finish_reason, "stop");
assert.equal(chatResp.usage.prompt_tokens, 15);
assert.equal(chatResp.usage.completion_tokens, 8);
assert.equal(chatResp.usage.total_tokens, 23);

// 4. SSE translation
const state = { id: "", model: "muse-spark-1.3-contributor" };
const textChunkRaw = `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello "}\n\n`;
const textChunkOpenAi = translateResponsesEventToOpenAiChunk(textChunkRaw, state);
assert.ok(textChunkOpenAi.startsWith("data: "));
const parsedChunk = JSON.parse(textChunkOpenAi.replace("data: ", "").trim());
assert.equal(parsedChunk.choices[0].delta.content, "Hello ");

const doneChunk = translateResponsesEventToOpenAiChunk("data: [DONE]\n\n", state);
assert.equal(doneChunk, "data: [DONE]\n\n");

console.log("✔ All Protocol Translator Tests Passed!");
