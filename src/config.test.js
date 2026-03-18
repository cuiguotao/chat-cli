import test from "node:test";
import assert from "node:assert/strict";

import { getUserConfigPath, readUserConfig } from "./config.js";

test("getUserConfigPath points to the user home config file", () => {
  assert.equal(getUserConfigPath("C:\\Users\\Demo"), "C:\\Users\\Demo\\.chat-cli.json");
});

test("readUserConfig returns empty object when config file is missing", async () => {
  const config = await readUserConfig({
    configPath: "C:\\Users\\Demo\\.chat-cli.json",
    readFileImpl: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
  });

  assert.deepEqual(config, {});
});

test("readUserConfig parses supported fields", async () => {
  const config = await readUserConfig({
    configPath: "C:\\Users\\Demo\\.chat-cli.json",
    readFileImpl: async () =>
      JSON.stringify({
        apiKey: " config-key ",
        baseUrl: " https://config.example/v1 ",
        model: " config-model ",
        systemPrompt: " 你是一个助手 "
      })
  });

  assert.deepEqual(config, {
    apiKey: "config-key",
    baseUrl: "https://config.example/v1",
    model: "config-model",
    systemPrompt: "你是一个助手"
  });
});

test("readUserConfig rejects invalid json structures", async () => {
  await assert.rejects(
    () =>
      readUserConfig({
        configPath: "C:\\Users\\Demo\\.chat-cli.json",
        readFileImpl: async () => "[]"
      }),
    /config file must contain a JSON object/i
  );
});
