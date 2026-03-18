import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { USER_CONFIG_DIR_NAME } from "./config.js";

export const USER_RUNTIME_DIR_NAME = "runtime";
export const USER_ACTIVE_SESSION_FILE_NAME = "active-sessions.json";
export const ACTIVE_SESSION_ENV_NAME = "CHAT_CLI_SESSION_ID";

export function getShellSessionScopeId({
  env = process.env,
  ppid = process.ppid
} = {}) {
  if (typeof env.CHAT_CLI_SHELL_ID === "string" && env.CHAT_CLI_SHELL_ID.trim() !== "") {
    return `shell:${env.CHAT_CLI_SHELL_ID.trim()}`;
  }

  if (typeof env.WT_SESSION === "string" && env.WT_SESSION.trim() !== "") {
    return `wt:${env.WT_SESSION.trim()}`;
  }

  if (typeof env.TERM_SESSION_ID === "string" && env.TERM_SESSION_ID.trim() !== "") {
    return `term:${env.TERM_SESSION_ID.trim()}`;
  }

  return `ppid:${String(ppid)}`;
}

export function getActiveSessionStatePath(homeDir = os.homedir()) {
  return path.join(homeDir, USER_CONFIG_DIR_NAME, USER_RUNTIME_DIR_NAME, USER_ACTIVE_SESSION_FILE_NAME);
}

export async function getActiveSessionId(
  scopeId,
  {
    statePath = getActiveSessionStatePath(),
    readFileImpl = readFile
  } = {}
) {
  const state = await readActiveSessionState({
    statePath,
    readFileImpl
  });

  return state[scopeId];
}

export async function setActiveSessionId(
  scopeId,
  sessionId,
  {
    statePath = getActiveSessionStatePath(),
    mkdirImpl = mkdir,
    readFileImpl = readFile,
    writeFileImpl = writeFile
  } = {}
) {
  const state = await readActiveSessionState({
    statePath,
    readFileImpl
  });
  const nextState = {
    ...state,
    [scopeId]: sessionId
  };

  await mkdirImpl(path.dirname(statePath), { recursive: true });
  await writeFileImpl(statePath, `${JSON.stringify(nextState, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w"
  });

  return nextState;
}

export async function readActiveSessionState(
  {
    statePath = getActiveSessionStatePath(),
    readFileImpl = readFile
  } = {}
) {
  try {
    const rawContent = await readFileImpl(statePath, "utf8");
    return parseActiveSessionState(rawContent);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read active session state at ${statePath}: ${message}`);
  }
}

export function parseActiveSessionState(rawContent) {
  const parsed = JSON.parse(rawContent);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("active session state must contain a JSON object");
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === "string" && value.trim() !== "")
  );
}
