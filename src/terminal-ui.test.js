import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAssistantResponse,
  formatCurrentSessionView,
  formatHelpView,
  formatHistoryListView,
  formatNoticeView,
  formatSessionView
} from "./terminal-ui.js";

test("formatHelpView renders a boxed help screen", () => {
  const output = formatHelpView({
    configPath: "C:\\Users\\demo\\.chat-cli\\config.json",
    activeSessionEnvName: "CHAT_CLI_SESSION_ID",
    columns: 72
  });

  assert.match(output, /Chat CLI/);
  assert.match(output, /Quick Start/);
  assert.match(output, /CHAT_CLI_SESSION_ID/);
  assert.match(output, /╭/);
});

test("formatHistoryListView renders session rows inside a panel", () => {
  const output = formatHistoryListView([
    {
      sessionId: "12345678",
      title: "第一轮标题",
      updateTime: "2026-03-18T10:00:00.000Z"
    }
  ], {
    columns: 72
  });

  assert.match(output, /History/);
  assert.match(output, /12345678/);
  assert.match(output, /第一轮标题/);
});

test("formatSessionView renders transcript content", () => {
  const output = formatSessionView(
    {
      sessionId: "12345678-abcd",
      title: "第一轮标题",
      updateTime: "2026-03-18T10:00:00.000Z",
      historyPath: "20260318/12345678-abcd.jsonl"
    },
    [
      {
        role: "user",
        content: "你好"
      },
      {
        role: "assistant",
        content: "你好，我在。"
      }
    ],
    {
      columns: 72
    }
  );

  assert.match(output, /Session Detail/);
  assert.match(output, /\[User\]/);
  assert.match(output, /\[Assistant\]/);
  assert.match(output, /你好，我在。/);
});

test("formatCurrentSessionView renders session metadata", () => {
  const output = formatCurrentSessionView({
    sessionId: "12345678-abcd",
    title: "第一轮标题",
    updateTime: "2026-03-18T10:00:00.000Z"
  }, {
    columns: 72
  });

  assert.match(output, /Current Session/);
  assert.match(output, /12345678-abcd/);
});

test("formatNoticeView renders status content", () => {
  const output = formatNoticeView("Session Loaded", [
    "Short ID: 12345678",
    "Title: 第一轮标题"
  ], {
    columns: 72
  });

  assert.match(output, /Session Loaded/);
  assert.match(output, /Short ID: 12345678/);
});

test("formatAssistantResponse keeps the original rendered body", () => {
  const output = formatAssistantResponse("渲染后的终端内容", {
    columns: 72
  });

  assert.match(output, /Assistant/);
  assert.match(output, /渲染后的终端内容/);
});
