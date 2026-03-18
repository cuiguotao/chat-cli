import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  buildChatCompletionsUrl,
  createTemporaryChatCompletion,
  extractTextContent
} from "./openai-chat.js";

test("buildChatCompletionsUrl appends the OpenAI path", () => {
  assert.equal(
    buildChatCompletionsUrl("https://example.com/v1"),
    "https://example.com/v1/chat/completions"
  );
});

test("extractTextContent supports string and array content", () => {
  assert.equal(extractTextContent(" hello "), "hello");
  assert.equal(
    extractTextContent([
      { type: "text", text: "你" },
      { type: "text", text: "好" }
    ]),
    "你好"
  );
});

test("createTemporaryChatCompletion sends an OpenAI-compatible request", async () => {
  let requestPayload = null;
  let requestHeaders = null;

  const server = http.createServer(async (request, response) => {
    requestHeaders = request.headers;

    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }

    requestPayload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "这是回复"
            }
          }
        ]
      })
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("failed to read server address");
    }

    const responseText = await createTemporaryChatCompletion({
      apiKey: "test-key",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "test-model",
      message: "你好",
      systemPrompt: "你是一个助手"
    });

    assert.equal(responseText, "这是回复");
    assert.equal(requestHeaders.authorization, "Bearer test-key");
    assert.equal(requestPayload.model, "test-model");
    assert.deepEqual(requestPayload.messages, [
      {
        role: "system",
        content: "你是一个助手"
      },
      {
        role: "user",
        content: "你好"
      }
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
