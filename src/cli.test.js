import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, resolveConfig, runCli } from "./cli.js";

test("parseArgs supports leading chat command and message text", () => {
  const parsed = parseArgs(["--model", "demo-model", "hello", "world"]);

  assert.equal(parsed.model, "demo-model");
  assert.equal(parsed.message, "hello world");
});

test("parseArgs supports config, session, history, load, and multi options", () => {
  const parsed = parseArgs([
    "--config",
    "stream=false",
    "--history",
    "show",
    "history-123",
    "--session",
    "demo-session",
    "--load",
    "demo-load",
    "--multi"
  ]);

  assert.deepEqual(parsed.configUpdates, {
    stream: false
  });
  assert.equal(parsed.historyCommand, "show");
  assert.equal(parsed.historyTarget, "history-123");
  assert.equal(parsed.sessionRef, "demo-session");
  assert.equal(parsed.loadSessionRef, "demo-load");
  assert.equal(parsed.multi, true);
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

test("runCli writes streamed model output to stdout for a single-turn chat", async () => {
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
    loadHistoryIndex: async () => [],
    getLoadedSessionId: async () => undefined,
    getShellScopeId: () => "ppid:1",
    persistHistory: async ({ sessionId, historyPath, message, response, model }) => {
      assert.equal(sessionId, undefined);
      assert.equal(historyPath, undefined);
      assert.equal(message, "你好");
      assert.equal(response, "你好，我在。");
      assert.equal(model, "test-model");
      return {
        sessionId: "new-session-id",
        shortSessionId: "new",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/new-session-id.jsonl"
      };
    },
    renderMarkdown: () => {
      throw new Error("renderMarkdown should not be used for non-tty output");
    },
    chat: async (config) => {
      assert.equal(config.message, "你好");
      assert.equal(config.stream, true);
      assert.deepEqual(config.priorMessages, []);
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
    loadHistoryIndex: async () => [],
    getLoadedSessionId: async () => undefined,
    getShellScopeId: () => "ppid:1",
    persistHistory: async ({ message, response }) => {
      assert.equal(message, "你好");
      assert.equal(response, "# 标题\n\n- 第一项");
      return {
        sessionId: "new-session-id",
        shortSessionId: "new",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/new-session-id.jsonl"
      };
    },
    renderMarkdown: (markdown, { columns }) => {
      assert.equal(markdown, "# 标题\n\n- 第一项");
      assert.equal(columns, 120);
      return "渲染后的终端内容";
    },
    chat: async (config) => {
      assert.equal(config.stream, false);
      assert.deepEqual(config.priorMessages, []);
      return "# 标题\n\n- 第一项";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "渲染后的终端内容\n");
});

test("runCli uses an explicitly selected session for multi-turn conversation", async () => {
  let stdout = "";
  let resolvedSessionRef = null;

  const exitCode = await runCli(["chat", "--session", "12345678", "继续聊"], {
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
      write() {}
    },
    loadUserConfig: async () => ({}),
    loadHistoryIndex: async () => [
      {
        sessionId: "12345678-abcd",
        title: "第一轮",
        startMessage: "第一轮",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T09:30:00.000Z",
        historyPath: "20260318/12345678-abcd.jsonl"
      }
    ],
    resolveHistoryEntry: (items, sessionRef) => {
      resolvedSessionRef = sessionRef;
      return items[0];
    },
    loadHistoryMessages: async (entry) => {
      assert.equal(entry.sessionId, "12345678-abcd");
      return [
        {
          role: "user",
          content: "第一轮"
        },
        {
          role: "assistant",
          content: "第一轮回答"
        }
      ];
    },
    getLoadedSessionId: async () => {
      throw new Error("loaded session should not be used when --session is provided");
    },
    getShellScopeId: () => "ppid:1",
    persistHistory: async ({ sessionId, historyPath, message }) => {
      assert.equal(sessionId, "12345678-abcd");
      assert.equal(historyPath, "20260318/12345678-abcd.jsonl");
      assert.equal(message, "继续聊");
      return {
        sessionId: "12345678-abcd",
        shortSessionId: "12345678",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/12345678-abcd.jsonl"
      };
    },
    chat: async (config) => {
      assert.deepEqual(config.priorMessages, [
        {
          role: "user",
          content: "第一轮"
        },
        {
          role: "assistant",
          content: "第一轮回答"
        }
      ]);
      config.onDelta("继续");
      config.onDelta("回答");
      return "继续回答";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(resolvedSessionRef, "12345678");
  assert.equal(stdout, "继续回答\n");
});

test("runCli uses the active session from the current shell scope", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "继续聊"], {
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
      write() {}
    },
    loadUserConfig: async () => ({}),
    loadHistoryIndex: async () => [
      {
        sessionId: "shell-session-id",
        title: "第一轮",
        startMessage: "第一轮",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T09:30:00.000Z",
        historyPath: "20260318/shell-session-id.jsonl"
      }
    ],
    getShellScopeId: () => "ppid:99",
    getLoadedSessionId: async (scopeId) => {
      assert.equal(scopeId, "ppid:99");
      return "shell-session-id";
    },
    loadHistoryMessages: async () => [],
    persistHistory: async () => ({
      sessionId: "shell-session-id",
      shortSessionId: "shell",
      historyPath: "C:\\history.jsonl",
      relativeHistoryPath: "20260318/shell-session-id.jsonl"
    }),
    chat: async (config) => {
      assert.deepEqual(config.priorMessages, []);
      config.onDelta("继续");
      config.onDelta("回答");
      return "继续回答";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "继续回答\n");
});

test("runCli prefers the active session from env before shell state", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "继续聊"], {
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
      CHAT_CLI_SESSION_ID: "env-session-id"
    },
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadUserConfig: async () => ({}),
    loadHistoryIndex: async () => [
      {
        sessionId: "env-session-id",
        title: "第一轮",
        startMessage: "第一轮",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T09:30:00.000Z",
        historyPath: "20260318/env-session-id.jsonl"
      }
    ],
    getLoadedSessionId: async () => {
      throw new Error("shell state should not be read when env session exists");
    },
    loadHistoryMessages: async () => [],
    persistHistory: async () => ({
      sessionId: "env-session-id",
      shortSessionId: "env",
      historyPath: "C:\\history.jsonl",
      relativeHistoryPath: "20260318/env-session-id.jsonl"
    }),
    chat: async (config) => {
      assert.deepEqual(config.priorMessages, []);
      config.onDelta("继续");
      config.onDelta("回答");
      return "继续回答";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "继续回答\n");
});

test("runCli starts a new multi-turn session and stores it for the shell scope", async () => {
  let stdout = "";
  const savedSessions = [];

  const exitCode = await runCli(["chat", "--multi", "开始多轮"], {
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
      write() {}
    },
    loadUserConfig: async () => ({}),
    loadHistoryIndex: async () => [],
    getShellScopeId: () => "ppid:77",
    getLoadedSessionId: async () => {
      throw new Error("loaded session should not be read for --multi");
    },
    saveLoadedSessionId: async (scopeId, sessionId) => {
      savedSessions.push({ scopeId, sessionId });
    },
    persistHistory: async ({ sessionId, historyPath, message }) => {
      assert.equal(sessionId, undefined);
      assert.equal(historyPath, undefined);
      assert.equal(message, "开始多轮");
      return {
        sessionId: "multi-session-id",
        shortSessionId: "multi",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/multi-session-id.jsonl"
      };
    },
    chat: async (config) => {
      assert.deepEqual(config.priorMessages, []);
      config.onDelta("多轮");
      config.onDelta("回答");
      return "多轮回答";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "多轮回答\n");
  assert.deepEqual(savedSessions, [
    {
      scopeId: "ppid:77",
      sessionId: "multi-session-id"
    }
  ]);
});

test("runCli lists history sessions with short ids", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "--history", "list"], {
    env: {},
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadHistoryIndex: async () => [
      {
        sessionId: "12345678-abcd",
        title: "第一轮标题",
        startMessage: "第一轮标题",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T10:00:00.000Z",
        historyPath: "20260318/12345678-abcd.jsonl"
      }
    ]
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "sessionId\ttitle\tupdateTime\n12345678\t第一轮标题\t2026-03-18T10:00:00.000Z\n");
});

test("runCli shows a history session by id", async () => {
  let stdout = "";

  const exitCode = await runCli(["chat", "--history", "show", "12345678"], {
    env: {},
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadHistoryIndex: async () => [
      {
        sessionId: "12345678-abcd",
        title: "第一轮标题",
        startMessage: "第一轮标题",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T10:00:00.000Z",
        historyPath: "20260318/12345678-abcd.jsonl"
      }
    ],
    loadHistoryMessages: async (entry) => {
      assert.equal(entry.sessionId, "12345678-abcd");
      return [
        {
          role: "user",
          content: "你好"
        },
        {
          role: "assistant",
          content: "你好，我在。"
        }
      ];
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(
    stdout,
    "sessionId: 12345678-abcd\nshortId: 12345678\ntitle: 第一轮标题\nupdateTime: 2026-03-18T10:00:00.000Z\nhistoryPath: 20260318/12345678-abcd.jsonl\n\nuser:\n你好\n\nassistant:\n你好，我在。\n"
  );
});

test("runCli loads a session into the current shell scope", async () => {
  let stdout = "";
  const savedSessions = [];

  const exitCode = await runCli(["chat", "--load", "12345678"], {
    env: {},
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write() {}
    },
    loadHistoryIndex: async () => [
      {
        sessionId: "12345678-abcd",
        title: "第一轮标题",
        startMessage: "第一轮标题",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T10:00:00.000Z",
        historyPath: "20260318/12345678-abcd.jsonl"
      }
    ],
    getShellScopeId: () => "ppid:55",
    saveLoadedSessionId: async (scopeId, sessionId) => {
      savedSessions.push({ scopeId, sessionId });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(savedSessions, [
    {
      scopeId: "ppid:55",
      sessionId: "12345678-abcd"
    }
  ]);
  assert.match(stdout, /Loaded session 12345678/);
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
    loadHistoryIndex: async () => [],
    getLoadedSessionId: async () => undefined,
    persistHistory: async ({ response }) => {
      assert.equal(response, "# 标题\n\n- 第一项");
      return {
        sessionId: "new-session-id",
        shortSessionId: "new",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/new-session-id.jsonl"
      };
    },
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

test("runCli validates conflicting session options", async () => {
  let stderr = "";

  const exitCode = await runCli(["chat", "--multi", "--session", "abc", "你好"], {
    env: {},
    stdout: {
      write() {}
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /--multi cannot be combined with --session/i);
});

test("runCli validates that --history show requires a session id", async () => {
  let stderr = "";

  const exitCode = await runCli(["chat", "--history", "show"], {
    env: {},
    stdout: {
      write() {}
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /--history show requires a value/i);
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
    persistHistory: async () => {
      throw new Error("persistHistory should not be called when updating config");
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
    loadHistoryIndex: async () => [],
    getLoadedSessionId: async () => undefined,
    persistHistory: async ({ baseUrl, systemPrompt }) => {
      assert.equal(baseUrl, "https://config.example/v1");
      assert.equal(systemPrompt, "来自配置文件");
      return {
        sessionId: "new-session-id",
        shortSessionId: "new",
        historyPath: "C:\\history.jsonl",
        relativeHistoryPath: "20260318/new-session-id.jsonl"
      };
    },
    chat: async (config) => {
      assert.equal(config.apiKey, "config-key");
      assert.equal(config.model, "config-model");
      assert.equal(config.baseUrl, "https://config.example/v1");
      assert.equal(config.systemPrompt, "来自配置文件");
      assert.equal(config.stream, false);
      assert.equal(config.message, "测试配置");
      assert.deepEqual(config.priorMessages, []);
      return "配置读取成功";
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "配置读取成功\n");
});

test("runCli continues when history persistence fails", async () => {
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
    loadUserConfig: async () => ({
      stream: false
    }),
    loadHistoryIndex: async () => [],
    getLoadedSessionId: async () => undefined,
    persistHistory: async () => {
      throw new Error("disk full");
    },
    chat: async () => "普通回复"
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, "普通回复\n");
  assert.match(stderr, /failed to save chat history: disk full/i);
});
