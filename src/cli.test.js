import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, resolveConfig, runCli } from "./cli.js";

test("parseArgs supports leading chat command and message text", () => {
  const parsed = parseArgs(["--model", "demo-model", "hello", "world"]);

  assert.equal(parsed.model, "demo-model");
  assert.equal(parsed.message, "hello world");
});

test("parseArgs supports config updates", () => {
  const parsed = parseArgs(["--config", "stream=false"]);

  assert.deepEqual(parsed.configUpdates, {
    stream: false
  });
  assert.equal(parsed.message, "");
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
  assert.equal(config.stream, true);
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
      OPENAI_SYSTEM: "env-system",
      OPENAI_STREAM: "true"
    },
    {
      apiKey: "config-key",
      model: "config-model",
      baseUrl: "https://config.example/v1",
      systemPrompt: "config-system",
      stream: false
    }
  );

  assert.equal(config.apiKey, "config-key");
  assert.equal(config.model, "config-model");
  assert.equal(config.baseUrl, "https://config.example/v1");
  assert.equal(config.systemPrompt, "config-system");
  assert.equal(config.stream, false);
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
  assert.equal(config.stream, true);
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
    renderMarkdown: () => {
      throw new Error("renderMarkdown should not be used for non-tty output");
    },
    chat: async (config) => {
      assert.equal(config.message, "你好");
      assert.equal(config.stream, true);
      config.onDelta("你好，");
      config.onDelta("我在。");
      return "你好，我在。";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "你好，我在。\n");
  assert.equal(stderr, "");
});

test("runCli renders markdown when stream is disabled", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "你好"], {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model"
    },
    stdout: {
      isTTY: true,
      columns: 120,
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadUserConfig: async () => ({
      stream: false
    }),
    renderMarkdown: (markdown, { columns }) => {
      assert.equal(markdown, "# 标题\n\n- 第一项");
      assert.equal(columns, 120);
      return "渲染后的终端内容";
    },
    chat: async (config) => {
      assert.equal(config.stream, false);
      return "# 标题\n\n- 第一项";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "渲染后的终端内容\n");
});

test("runCli uses raw fallback output if a streaming implementation does not emit deltas", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runCli(["chat", "你好"], {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model"
    },
    stdout: {
      isTTY: true,
      columns: 120,
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
    chat: async () => "# 标题\n\n- 第一项"
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "# 标题\n\n- 第一项\n");
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

test("runCli updates user config from --config without calling the model", async () => {
  let stdout = "";
  let stderr = "";
  let savedConfig = null;

  const exitCode = await runCli(["chat", "--config", "stream=false"], {
    env: {},
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
    loadUserConfig: async () => ({
      apiKey: "config-key",
      stream: true
    }),
    saveUserConfig: async (config) => {
      savedConfig = config;
    },
    chat: async () => {
      throw new Error("chat should not be called when updating config");
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(savedConfig, {
    apiKey: "config-key",
    stream: false
  });
  assert.match(stdout, /stream=false/);
  assert.equal(stderr, "");
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
      systemPrompt: "来自配置文件",
      stream: false
    }),
    chat: async (config) => {
      assert.equal(config.apiKey, "config-key");
      assert.equal(config.model, "config-model");
      assert.equal(config.baseUrl, "https://config.example/v1");
      assert.equal(config.systemPrompt, "来自配置文件");
      assert.equal(config.stream, false);
      assert.equal(config.message, "测试配置");
      return "配置读取成功";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "配置读取成功\n");
});
