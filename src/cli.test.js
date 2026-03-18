import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, resolveConfig, runCli } from "./cli.js";

test("parseArgs supports leading chat command and message text", () => {
  const parsed = parseArgs(["--model", "demo-model", "hello", "world"]);

  assert.equal(parsed.model, "demo-model");
  assert.equal(parsed.message, "hello world");
});

test("resolveConfig reads values from environment", () => {
  const config = resolveConfig(
    {
      message: "ping"
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model"
    }
  );

  assert.equal(config.apiKey, "test-key");
  assert.equal(config.model, "test-model");
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
});

test("runCli writes model output to stdout", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runCli(["chat", "你好"], {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model"
    },
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    },
    chat: async (config) => {
      assert.equal(config.message, "你好");
      return "你好，我在。";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "你好，我在。\n");
  assert.equal(stderr, "");
});

test("runCli returns validation error when message is missing", async () => {
  let stderr = "";

  const exitCode = await runCli([], {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model"
    },
    stdout: {
      write() {}
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    },
    chat: async () => "unused"
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /message is required/i);
});
