import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatHistoryLines,
  formatHistoryDate,
  getUserHistoriesIndexPath,
  getUserHistoriesRootPath,
  parseHistoryIndex,
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

test("saveChatHistory stores the chat under a dated uuid file", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];

  const historyPath = await saveChatHistory(
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
      uuidGenerator: () => "test-uuid"
    }
  );

  assert.equal(historyPath, "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid.jsonl");
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
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\20260318\\test-uuid.jsonl");
  assert.equal(
    writeFileCalls[0].content,
    `${JSON.stringify({
      id: "test-uuid",
      sessionId: "test-uuid",
      role: "user",
      content: "你好",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n${JSON.stringify({
      id: "test-uuid",
      sessionId: "test-uuid",
      role: "assistant",
      content: "你好，我在。",
      createdAt: "2026-03-18T09:30:00.000Z",
      model: "test-model",
      baseUrl: "https://example.com/v1",
      systemPrompt: "简洁回答"
    })}\n`
  );
  assert.deepEqual(writeFileCalls[0].options, {
    encoding: "utf8",
    flag: "w"
  });
  assert.equal(writeFileCalls[1].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\histories.json");
  assert.equal(
    writeFileCalls[1].content,
    `${JSON.stringify(
      [
        {
          sessionId: "test-uuid",
          title: "你好",
          startMessage: "你好",
          createTime: "2026-03-18T09:30:00.000Z",
          updateTime: "2026-03-18T09:30:00.000Z",
          historyPath: "20260318\\test-uuid.jsonl"
        }
      ],
      null,
      2
    )}\n`
  );
  assert.deepEqual(writeFileCalls[1].options, {
    encoding: "utf8",
    flag: "w"
  });
});

test("saveChatHistory updates histories.json while preserving existing createTime", async () => {
  const writeFileCalls = [];

  await saveChatHistory(
    {
      message: "新的第一条消息",
      response: "新的回复",
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
              sessionId: "test-uuid",
              title: "旧标题",
              startMessage: "旧消息",
              createTime: "2026-03-18T09:30:00.000Z",
              updateTime: "2026-03-18T09:30:00.000Z",
              historyPath: "20260318\\test-uuid.jsonl"
            }
          ]);
        }

        throw new Error("unexpected read");
      },
      writeFileImpl: async (filePath, content) => {
        writeFileCalls.push({ filePath, content });
      },
      uuidGenerator: () => "test-uuid"
    }
  );

  assert.equal(writeFileCalls[1].filePath, "C:\\Users\\Demo\\.chat-cli\\histories\\histories.json");
  assert.equal(
    writeFileCalls[1].content,
    `${JSON.stringify(
      [
        {
          sessionId: "test-uuid",
          title: "旧标题",
          startMessage: "旧消息",
          createTime: "2026-03-18T09:30:00.000Z",
          updateTime: "2026-03-18T10:00:00.000Z",
          historyPath: "20260318\\test-uuid.jsonl"
        }
      ],
      null,
      2
    )}\n`
  );
});
