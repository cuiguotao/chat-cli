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

test("resolveConfig prefers user config over environment variables", () => {
  const config = resolveConfig(
    {
      message: "ping"
    },
    {
      OPENAI_API_KEY: "env-key",
      OPENAI_MODEL: "env-model",
      OPENAI_BASE_URL: "https://env.example/v1",
      OPENAI_SYSTEM: "env-system"
    },
    {
      apiKey: "config-key",
      model: "config-model",
      baseUrl: "https://config.example/v1",
      systemPrompt: "config-system"
    }
  );

  assert.equal(config.apiKey, "config-key");
  assert.equal(config.model, "config-model");
  assert.equal(config.baseUrl, "https://config.example/v1");
  assert.equal(config.systemPrompt, "config-system");
});

test("resolveConfig prefers cli args over user config", () => {
  const config = resolveConfig(
    {
      apiKey: "cli-key",
      model: "cli-model",
      baseUrl: "https://cli.example/v1",
      systemPrompt: "cli-system",
      message: "ping"
    },
    {
      OPENAI_API_KEY: "env-key",
      OPENAI_MODEL: "env-model"
    },
    {
      apiKey: "config-key",
      model: "config-model",
      baseUrl: "https://config.example/v1",
      systemPrompt: "config-system"
    }
  );

  assert.equal(config.apiKey, "cli-key");
  assert.equal(config.model, "cli-model");
  assert.equal(config.baseUrl, "https://cli.example/v1");
  assert.equal(config.systemPrompt, "cli-system");
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
    loadUserConfig: async () => ({}),
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
    loadUserConfig: async () => ({}),
    chat: async () => "unused"
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /message is required/i);
});

test("runCli loads user config and lets it override environment variables", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "测试配置"], {
    env: {
      OPENAI_API_KEY: "env-key",
      OPENAI_MODEL: "env-model"
    },
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadUserConfig: async () => ({
      apiKey: "config-key",
      model: "config-model",
      baseUrl: "https://config.example/v1",
      systemPrompt: "来自配置文件"
    }),
    chat: async (config) => {
      assert.equal(config.apiKey, "config-key");
      assert.equal(config.model, "config-model");
      assert.equal(config.baseUrl, "https://config.example/v1");
      assert.equal(config.systemPrompt, "来自配置文件");
      assert.equal(config.message, "测试配置");
      return "配置读取成功";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "配置读取成功\n");
});
