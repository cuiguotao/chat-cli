import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

import { USER_CONFIG_DIR_NAME } from "./config.js";

export const USER_HISTORIES_DIR_NAME = "histories";
export const USER_HISTORIES_INDEX_FILE_NAME = "histories.json";

export function getUserHistoriesRootPath(homeDir = os.homedir()) {
  return path.join(homeDir, USER_CONFIG_DIR_NAME, USER_HISTORIES_DIR_NAME);
}

export function getUserHistoriesIndexPath(homeDir = os.homedir()) {
  return path.join(getUserHistoriesRootPath(homeDir), USER_HISTORIES_INDEX_FILE_NAME);
}

export function formatHistoryDate(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export function buildShortSessionId(sessionId) {
  return typeof sessionId === "string" ? sessionId.split("-")[0] : "";
}

export function buildChatHistoryLines({
  sessionId,
  createdAt,
  message,
  response,
  model,
  baseUrl,
  systemPrompt
}) {
  const timestamp = createdAt.toISOString();

  return [
    {
      id: sessionId,
      sessionId,
      role: "user",
      content: message,
      createdAt: timestamp,
      model,
      baseUrl,
      systemPrompt
    },
    {
      id: sessionId,
      sessionId,
      role: "assistant",
      content: response,
      createdAt: timestamp,
      model,
      baseUrl,
      systemPrompt
    }
  ];
}

export async function saveChatHistory(
  {
    sessionId,
    historyPath,
    message,
    response,
    model,
    baseUrl,
    systemPrompt,
    createdAt = new Date()
  },
  {
    historiesRootPath = getUserHistoriesRootPath(),
    mkdirImpl = mkdir,
    readFileImpl = readFile,
    writeFileImpl = writeFile,
    appendFileImpl = appendFile,
    uuidGenerator = () => crypto.randomUUID()
  } = {}
) {
  const nextSessionId = sessionId ?? uuidGenerator();
  const nextRelativeHistoryPath = normalizeRelativeHistoryPath(
    historyPath ?? `${formatHistoryDate(createdAt)}/${nextSessionId}.jsonl`
  );
  const absoluteHistoryPath = resolveAbsoluteHistoryPath(historiesRootPath, nextRelativeHistoryPath);
  const historiesIndexPath = path.join(historiesRootPath, USER_HISTORIES_INDEX_FILE_NAME);
  const lines = buildChatHistoryLines({
    sessionId: nextSessionId,
    createdAt,
    message,
    response,
    model,
    baseUrl,
    systemPrompt
  });
  const content = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;

  await mkdirImpl(path.dirname(absoluteHistoryPath), { recursive: true });

  if (historyPath) {
    await appendFileImpl(absoluteHistoryPath, content, {
      encoding: "utf8"
    });
  } else {
    await writeFileImpl(absoluteHistoryPath, content, {
      encoding: "utf8",
      flag: "w"
    });
  }

  await writeHistoryIndex(
    {
      sessionId: nextSessionId,
      message,
      createdAt,
      historyPath: nextRelativeHistoryPath
    },
    {
      historiesIndexPath,
      mkdirImpl,
      readFileImpl,
      writeFileImpl
    }
  );

  return {
    sessionId: nextSessionId,
    shortSessionId: buildShortSessionId(nextSessionId),
    historyPath: absoluteHistoryPath,
    relativeHistoryPath: nextRelativeHistoryPath
  };
}

export async function writeHistoryIndex(
  {
    sessionId,
    message,
    createdAt = new Date(),
    historyPath
  },
  {
    historiesIndexPath = getUserHistoriesIndexPath(),
    mkdirImpl = mkdir,
    readFileImpl = readFile,
    writeFileImpl = writeFile
  } = {}
) {
  const items = await readHistoryIndex({
    historiesIndexPath,
    readFileImpl
  });
  const nextItems = upsertHistoryIndexEntry(items, {
    sessionId,
    title: message,
    startMessage: message,
    createTime: createdAt.toISOString(),
    updateTime: createdAt.toISOString(),
    historyPath: normalizeRelativeHistoryPath(historyPath)
  });

  await mkdirImpl(path.dirname(historiesIndexPath), { recursive: true });
  await writeFileImpl(historiesIndexPath, `${JSON.stringify(nextItems, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w"
  });

  return nextItems;
}

export async function readHistoryIndex(
  {
    historiesIndexPath = getUserHistoriesIndexPath(),
    readFileImpl = readFile
  } = {}
) {
  try {
    const rawContent = await readFileImpl(historiesIndexPath, "utf8");
    return parseHistoryIndex(rawContent);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read history index at ${historiesIndexPath}: ${message}`);
  }
}

export function parseHistoryIndex(rawContent) {
  const parsed = JSON.parse(rawContent);

  if (!Array.isArray(parsed)) {
    throw new Error("history index must contain a JSON array");
  }

  return parsed.map(normalizeHistoryIndexEntry);
}

export function resolveHistoryIndexEntry(items, sessionRef) {
  const normalizedRef = typeof sessionRef === "string" ? sessionRef.trim() : "";

  if (!normalizedRef) {
    throw new Error("sessionId is required");
  }

  const exactMatch = items.find((item) => item.sessionId === normalizedRef);

  if (exactMatch) {
    return exactMatch;
  }

  const shortMatches = items.filter((item) => buildShortSessionId(item.sessionId) === normalizedRef);

  if (shortMatches.length === 1) {
    return shortMatches[0];
  }

  if (shortMatches.length > 1) {
    throw new Error(`sessionId is ambiguous: ${normalizedRef}`);
  }

  throw new Error(`session not found: ${normalizedRef}`);
}

export async function readChatHistoryMessages(
  historyEntry,
  {
    historiesRootPath = getUserHistoriesRootPath(),
    readFileImpl = readFile
  } = {}
) {
  const historyPath = resolveAbsoluteHistoryPath(historiesRootPath, historyEntry.historyPath);
  const rawContent = await readFileImpl(historyPath, "utf8");
  const lines = parseChatHistoryContent(rawContent);

  return lines
    .filter((line) => line.role === "user" || line.role === "assistant")
    .map((line) => ({
      role: line.role,
      content: line.content
    }));
}

export function parseChatHistoryContent(rawContent) {
  return rawContent
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export function upsertHistoryIndexEntry(items, nextItem) {
  const existingIndex = items.findIndex(
    (item) => item.sessionId === nextItem.sessionId || item.historyPath === nextItem.historyPath
  );

  if (existingIndex === -1) {
    return [nextItem, ...items];
  }

  const existingItem = items[existingIndex];
  const updatedItem = {
    ...existingItem,
    sessionId: existingItem.sessionId || nextItem.sessionId,
    updateTime: nextItem.updateTime,
    historyPath: nextItem.historyPath
  };

  return items.map((item, index) => (index === existingIndex ? updatedItem : item));
}

function normalizeHistoryIndexEntry(item) {
  const historyPath = normalizeRelativeHistoryPath(typeof item?.historyPath === "string" ? item.historyPath : "");
  const sessionId = typeof item?.sessionId === "string" && item.sessionId !== ""
    ? item.sessionId
    : deriveSessionIdFromHistoryPath(historyPath);

  return {
    sessionId,
    title: typeof item?.title === "string" ? item.title : "",
    startMessage: typeof item?.startMessage === "string" ? item.startMessage : "",
    createTime: typeof item?.createTime === "string" ? item.createTime : "",
    updateTime: typeof item?.updateTime === "string" ? item.updateTime : "",
    historyPath
  };
}

function deriveSessionIdFromHistoryPath(historyPath) {
  const baseName = historyPath.split("/").pop() ?? "";
  return baseName.endsWith(".jsonl") ? baseName.slice(0, -6) : "";
}

function normalizeRelativeHistoryPath(relativeHistoryPath) {
  return String(relativeHistoryPath)
    .trim()
    .replace(/\\/g, "/");
}

function resolveAbsoluteHistoryPath(historiesRootPath, relativeHistoryPath) {
  return path.join(historiesRootPath, ...normalizeRelativeHistoryPath(relativeHistoryPath).split("/"));
}
