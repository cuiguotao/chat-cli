import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatHistoryLines,
  buildShortSessionId,
  formatHistoryDate,
  getUserHistoriesIndexPath,
  getUserHistoriesRootPath,
  parseChatHistoryContent,
  parseHistoryIndex,
  readChatHistoryMessages,
  resolveHistoryIndexEntry,
  saveChatHistory
} from "./history.js";

test("getUserHistoriesRootPath points to the histories directory", () => {
  assert.equal(getUserHistoriesRootPath("C:\\Users\\Demo"), "C:\\Users\\Demo\\.chat-cli\\histories");
});

test("getUserHistoriesIndexPath points to histories.json", () => {
  assert.equal(getUserHistoriesIndexPath("C:\\Users\\Demo"), "C:\\Users\\Demo\\.chat-cli\\histories\\histories.json");
});

test("formatHistoryDate uses local calendar date", () => {
  assert.equal(formatHistoryDate(new Date("2026-03-18T10:20:30.000Z")), "20260318");
});

test("buildShortSessionId returns the first uuid segment", () => {
  assert.equal(buildShortSessionId("12345678-abcd-efgh"), "12345678");
});

test("buildChatHistoryLines creates user and assistant entries", () => {
  const lines = buildChatHistoryLines({
    sessionId: "test-session-id",
    createdAt: new Date("2026-03-18T09:30:00.000Z"),
    message: "你好",
    response: "你好，我在。",
    model: "test-model",
    baseUrl: "https://example.com/v1",
    systemPrompt: "简洁回答"
  });

  assert.deepEqual(lines, [
    {
      id: "test-session-id",
      sessionId: "test-session-id",
      role: "user",
      content: "你好",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    },
    {
      id: "test-session-id",
      sessionId: "test-session-id",
      role: "assistant",
      content: "你好，我在。",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    }
  ]);
});

test("parseHistoryIndex requires a json array", () => {
  assert.throws(() => parseHistoryIndex("{}"), /history index must contain a JSON array/i);
});

test("parseHistoryIndex derives sessionId from historyPath for older records", () => {
  const items = parseHistoryIndex(
    JSON.stringify([
      {
        title: "旧标题",
        startMessage: "旧消息",
        createTime: "2026-03-18T09:30:00.000Z",
        updateTime: "2026-03-18T09:30:00.000Z",
        historyPath: "20260318/legacy-id.jsonl"
      }
    ])
  );

  assert.deepEqual(items, [
    {
      sessionId: "legacy-id",
      title: "旧标题",
      startMessage: "旧消息",
      createTime: "2026-03-18T09:30:00.000Z",
      updateTime: "2026-03-18T09:30:00.000Z",
      historyPath: "20260318/legacy-id.jsonl"
    }
  ]);
});

test("resolveHistoryIndexEntry supports full and short session ids", () => {
  const items = [
    {
      sessionId: "12345678-abcd-efgh",
      title: "会话一",
      startMessage: "会话一",
      createTime: "2026-03-18T09:30:00.000Z",
      updateTime: "2026-03-18T09:30:00.000Z",
      historyPath: "20260318/12345678-abcd-efgh.jsonl"
    }
  ];

  assert.equal(resolveHistoryIndexEntry(items, "12345678-abcd-efgh").sessionId, "12345678-abcd-efgh");
  assert.equal(resolveHistoryIndexEntry(items, "12345678").sessionId, "12345678-abcd-efgh");
});

test("resolveHistoryIndexEntry rejects ambiguous short ids", () => {
  const items = [
    {
      sessionId: "12345678-abcd-efgh",
      title: "会话一",
      startMessage: "会话一",
      createTime: "2026-03-18T09:30:00.000Z",
      updateTime: "2026-03-18T09:30:00.000Z",
      historyPath: "20260318/12345678-abcd-efgh.jsonl"
    },
    {
      sessionId: "12345678-ijkl-mnop",
      title: "会话二",
      startMessage: "会话二",
      createTime: "2026-03-18T10:30:00.000Z",
      updateTime: "2026-03-18T10:30:00.000Z",
      historyPath: "20260318/12345678-ijkl-mnop.jsonl"
    }
  ];

  assert.throws(() => resolveHistoryIndexEntry(items, "12345678"), /sessionId is ambiguous/i);
});

test("parseChatHistoryContent parses jsonl messages", () => {
  const lines = parseChatHistoryContent(
    `${JSON.stringify({ role: "user", content: "你好" })}\n${JSON.stringify({ role: "assistant", content: "你好，我在。" })}\n`
  );

  assert.deepEqual(lines, [
    {
      role: "user",
      content: "你好"
    },
    {
      role: "assistant",
      content: "你好，我在。"
    }
  ]);
});

test("readChatHistoryMessages returns conversation messages for a session", async () => {
  const messages = await readChatHistoryMessages(
    {
      sessionId: "test-uuid",
      historyPath: "20260318/test-uuid.jsonl"
    },
    {
      historiesRootPath: "C:\\Users\\Demo\\.chat-cli\\histories",
      readFileImpl: async () =>
        `${JSON.stringify({ role: "user", content: "你好" })}\n${JSON.stringify({ role: "assistant", content: "你好，我在。" })}\n`
    }
  );

  assert.deepEqual(messages, [
    {
      role: "user",
      content: "你好"
    },
    {
      role: "assistant",
      content: "你好，我在。"
    }
  ]);
});

test("saveChatHistory stores a new session under a dated uuid file", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];

  const historyResult = await saveChatHistory(
    {
      message: "你好",
      response: "你好，我在。",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答",
      createdAt: new Date("2026-03-18T09:30:00.000Z")
    },
    {
      historiesRootPath: "C:\\Users\\Demo\\.chat-cli\\histories",
      mkdirImpl: async (directoryPath, options) => {
        mkdirCalls.push({ directoryPath, options });
      },
      readFileImpl: async () => {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      },
      writeFileImpl: async (filePath, content, options) => {
        writeFileCalls.push({ filePath, content, options });
      },
      uuidGenerator: () => "test-uuid-1234"
    }
  );

  assert.deepEqual(historyResult, {
    sessionId: "test-uuid-1234",
    shortSessionId: "test",
    historyPath: "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid-1234.jsonl",
    relativeHistoryPath: "20260318/test-uuid-1234.jsonl"
  });
  assert.deepEqual(mkdirCalls, [
    {
      directoryPath: "C:\\Users\\Demo\\.chat-cli\\histories\\20260318",
      options: { recursive: true }
    },
    {
      directoryPath: "C:\\Users\\Demo\\.chat-cli\\histories",
      options: { recursive: true }
    }
  ]);
  assert.equal(writeFileCalls.length, 2);
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid-1234.jsonl");
  assert.equal(
    writeFileCalls[0].content,
    `${JSON.stringify({
      id: "test-uuid-1234",
      sessionId: "test-uuid-1234",
      role: "user",
      content: "你好",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n${JSON.stringify({
      id: "test-uuid-1234",
      sessionId: "test-uuid-1234",
      role: "assistant",
      content: "你好，我在。",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n`
  );
  assert.equal(writeFileCalls[1].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\histories.json");
  assert.equal(
    writeFileCalls[1].content,
    `${JSON.stringify(
      [
        {
          sessionId: "test-uuid-1234",
          title: "你好",
          startMessage: "你好",
          createTime: "2026-03-18T09:30:00.000Z",
          updateTime: "2026-03-18T09:30:00.000Z",
          historyPath: "20260318/test-uuid-1234.jsonl"
        }
      ],
      null,
      2
    )}\n`
  );
});

test("saveChatHistory appends to an existing session and updates only updateTime", async () => {
  const appendFileCalls = [];
  const writeFileCalls = [];

  const historyResult = await saveChatHistory(
    {
      sessionId: "test-uuid-1234",
      historyPath: "20260318/test-uuid-1234.jsonl",
      message: "第二轮问题",
      response: "第二轮回答",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答",
      createdAt: new Date("2026-03-18T10:00:00.000Z")
    },
    {
      historiesRootPath: "C:\\Users\\Demo\\.chat-cli\\histories",
      mkdirImpl: async () => {},
      readFileImpl: async (filePath) => {
        if (filePath.endsWith("histories.json")) {
          return JSON.stringify([
            {
              sessionId: "test-uuid-1234",
              title: "第一轮问题",
              startMessage: "第一轮问题",
              createTime: "2026-03-18T09:30:00.000Z",
              updateTime: "2026-03-18T09:30:00.000Z",
              historyPath: "20260318/test-uuid-1234.jsonl"
            }
          ]);
        }

        throw new Error("unexpected read");
      },
      writeFileImpl: async (filePath, content) => {
        writeFileCalls.push({ filePath, content });
      },
      appendFileImpl: async (filePath, content, options) => {
        appendFileCalls.push({ filePath, content, options });
      }
    }
  );

  assert.deepEqual(historyResult, {
    sessionId: "test-uuid-1234",
    shortSessionId: "test",
    historyPath: "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid-1234.jsonl",
    relativeHistoryPath: "20260318/test-uuid-1234.jsonl"
  });
  assert.equal(appendFileCalls.length, 1);
  assert.equal(appendFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid-1234.jsonl");
  assert.equal(
    appendFileCalls[0].content,
    `${JSON.stringify({
      id: "test-uuid-1234",
      sessionId: "test-uuid-1234",
      role: "user",
      content: "第二轮问题",
      createdAt: "2026-03-18T10:00:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n${JSON.stringify({
      id: "test-uuid-1234",
      sessionId: "test-uuid-1234",
      role: "assistant",
      content: "第二轮回答",
      createdAt: "2026-03-18T10:00:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n`
  );
  assert.deepEqual(appendFileCalls[0].options, {
    encoding: "utf8"
  });
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\histories.json");
  assert.equal(
    writeFileCalls[0].content,
    `${JSON.stringify(
      [
        {
          sessionId: "test-uuid-1234",
          title: "第一轮问题",
          startMessage: "第一轮问题",
          createTime: "2026-03-18T09:30:00.000Z",
          updateTime: "2026-03-18T10:00:00.000Z",
          historyPath: "20260318/test-uuid-1234.jsonl"
        }
      ],
      null,
      2
    )}\n`
  );
});
