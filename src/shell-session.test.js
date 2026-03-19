import test from "node:test";
import assert from "node:assert/strict";

import {
  clearActiveSessionId,
  getActiveSessionId,
  getActiveSessionStatePath,
  getShellSessionScopeId,
  parseActiveSessionState,
  setActiveSessionId
} from "./shell-session.js";

test("getShellSessionScopeId prefers explicit shell id", () => {
  const scopeId = getShellSessionScopeId({
    env: {
      CHAT_CLI_SHELL_ID: "demo-shell",
      WT_SESSION: "wt-demo"
    },
    ppid: 99
  });

  assert.equal(scopeId, "shell:demo-shell");
});

test("getShellSessionScopeId falls back to WT_SESSION and ppid", () => {
  assert.equal(
    getShellSessionScopeId({
      env: {
        WT_SESSION: "wt-demo"
      },
      ppid: 99
    }),
    "wt:wt-demo"
  );
  assert.equal(getShellSessionScopeId({ env: {}, ppid: 99 }), "ppid:99");
});

test("getActiveSessionStatePath points to the runtime file", () => {
  assert.equal(
    getActiveSessionStatePath("C:\\Users\\Demo"),
    "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json"
  );
});

test("parseActiveSessionState requires a json object", () => {
  assert.throws(() => parseActiveSessionState("[]"), /active session state must contain a JSON object/i);
});

test("setActiveSessionId persists the scope mapping", async () => {
  const writeFileCalls = [];

  await setActiveSessionId("ppid:99", "session-123", {
    statePath: "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json",
    mkdirImpl: async () => {},
    readFileImpl: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
    writeFileImpl: async (filePath, content, options) => {
      writeFileCalls.push({ filePath, content, options });
    }
  });

  assert.equal(writeFileCalls.length, 1);
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json");
  assert.equal(
    writeFileCalls[0].content,
    `${JSON.stringify(
      {
        "ppid:99": "session-123"
      },
      null,
      2
    )}\n`
  );
  assert.deepEqual(writeFileCalls[0].options, {
    encoding: "utf8",
    flag: "w"
  });
});

test("getActiveSessionId returns the scope specific session id", async () => {
  const sessionId = await getActiveSessionId("ppid:99", {
    statePath: "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json",
    readFileImpl: async () =>
      JSON.stringify({
        "ppid:99": "session-123",
        "ppid:100": "session-999"
      })
  });

  assert.equal(sessionId, "session-123");
});

test("clearActiveSessionId removes the scope mapping", async () => {
  const writeFileCalls = [];

  await clearActiveSessionId("ppid:99", {
    statePath: "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json",
    mkdirImpl: async () => {},
    readFileImpl: async () =>
      JSON.stringify({
        "ppid:99": "session-123",
        "ppid:100": "session-999"
      }),
    writeFileImpl: async (filePath, content, options) => {
      writeFileCalls.push({ filePath, content, options });
    }
  });

  assert.equal(writeFileCalls.length, 1);
  assert.equal(writeFileCalls[0].filePath, "C:\\Users\\Demo\\.chat-cli\\runtime\\active-sessions.json");
  assert.equal(
    writeFileCalls[0].content,
    `${JSON.stringify(
      {
        "ppid:100": "session-999"
      },
      null,
      2
    )}\n`
  );
  assert.deepEqual(writeFileCalls[0].options, {
    encoding: "utf8",
    flag: "w"
  });
});
