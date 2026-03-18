import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_USER_CONFIG,
  getUserConfigPath,
  parseUserConfig,
  readUserConfig
} from "./config.js";

test("getUserConfigPath points to the user home config file", () => {
  assert.equal(getUserConfigPath("C:\\Users\\Demo"), "C:\\Users\\Demo\\.chat-cli\\config.json");
});

test("readUserConfig creates the config directory and file when missing", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];

  const config = await readUserConfig({
    configPath: "C:\\Users\\Demo\\.chat-cli\\config.json",
    readFileImpl: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
    mkdirImpl: async (directoryPath, options) => {
      mkdirCalls.push({ directoryPath, options });
    },
    writeFileImpl: async (filePath, content, options) => {
      writeFileCalls.push({ filePath, content, options });
    }
  });

  assert.deepEqual(config, {
    apiKey: undefined,
    baseUrl: undefined,
    model: undefined,
    systemPrompt: undefined
  });
  assert.deepEqual(mkdirCalls, [
    {
      directoryPath: "C:\\Users\\Demo\\.chat-cli",
      options: { recursive: true }
    }
  ]);
  assert.equal(writeFileCalls.length, 1);
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\config.json");
  assert.equal(writeFileCalls[0].content, `${JSON.stringify(DEFAULT_USER_CONFIG, null, 2)}\n`);
  assert.deepEqual(writeFileCalls[0].options, {
    encoding: "utf8",
    flag: "w"
  });
});

test("readUserConfig parses supported fields", async () => {
  const config = await readUserConfig({
    configPath: "C:\\Users\\Demo\\.chat-cli\\config.json",
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

test("parseUserConfig rejects invalid json structures", () => {
  assert.throws(() => parseUserConfig("[]"), /config file must contain a JSON object/i);
});
