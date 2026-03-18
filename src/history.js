import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

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
    uuidGenerator = () => crypto.randomUUID()
  } = {}
) {
  const sessionId = uuidGenerator();
  const datePath = path.join(historiesRootPath, formatHistoryDate(createdAt));
  const historyPath = path.join(datePath, `${sessionId}.jsonl`);
  const relativeHistoryPath = path.relative(historiesRootPath, historyPath);
  const historiesIndexPath = path.join(historiesRootPath, USER_HISTORIES_INDEX_FILE_NAME);
  const lines = buildChatHistoryLines({
    sessionId,
    createdAt,
    message,
    response,
    model,
    baseUrl,
    systemPrompt
  });
  const content = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;

  await mkdirImpl(datePath, { recursive: true });
  await writeFileImpl(historyPath, content, {
    encoding: "utf8",
    flag: "w"
  });
  await writeHistoryIndex(
    {
      sessionId,
      message,
      createdAt,
      historyPath: relativeHistoryPath
    },
    {
      historiesIndexPath,
      mkdirImpl,
      readFileImpl,
      writeFileImpl
    }
  );

  return historyPath;
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
    historyPath
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

export function upsertHistoryIndexEntry(items, nextItem) {
  const existingIndex = items.findIndex((item) => item.historyPath === nextItem.historyPath);

  if (existingIndex === -1) {
    return [nextItem, ...items];
  }

  const existingItem = items[existingIndex];
  const updatedItem = {
    ...existingItem,
    updateTime: nextItem.updateTime
  };

  return items.map((item, index) => (index === existingIndex ? updatedItem : item));
}

function normalizeHistoryIndexEntry(item) {
  return {
    sessionId: typeof item?.sessionId === "string" ? item.sessionId : "",
    title: typeof item?.title === "string" ? item.title : "",
    startMessage: typeof item?.startMessage === "string" ? item.startMessage : "",
    createTime: typeof item?.createTime === "string" ? item.createTime : "",
    updateTime: typeof item?.updateTime === "string" ? item.updateTime : "",
    historyPath: typeof item?.historyPath === "string" ? item.historyPath : ""
  };
}
