import { createTemporaryChatCompletion } from "./openai-chat.js";
import { getUserConfigPath, readUserConfig, writeUserConfig } from "./config.js";
import {
  buildShortSessionId,
  readChatHistoryMessages,
  readHistoryIndex,
  resolveHistoryIndexEntry,
  saveChatHistory
} from "./history.js";
import {
  ACTIVE_SESSION_ENV_NAME,
  getActiveSessionId,
  getShellSessionScopeId,
  setActiveSessionId
} from "./shell-session.js";
import { renderMarkdownForTerminal } from "./terminal-markdown.js";

const HELP_TEXT = `Usage:
  chat "Your message"
  chat --multi "Start a multi-turn session"
  chat --session sessionId "Continue a session"
  chat --load sessionId
  chat --history list
  chat --history show sessionId
  chat --config stream=false

User config:
  ${getUserConfigPath()}
  Created automatically on first run if missing.
  Values in this file override environment variables.

Environment variables:
  OPENAI_API_KEY        Required API key
  OPENAI_BASE_URL       Optional, defaults to https://api.openai.com/v1
  OPENAI_MODEL          Required model name
  OPENAI_SYSTEM         Optional system prompt
  OPENAI_STREAM         Optional, true by default
  ${ACTIVE_SESSION_ENV_NAME}  Optional active session id
`;

export async function runCli(
  rawArgs,
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    chat = createTemporaryChatCompletion,
    loadUserConfig = readUserConfig,
    saveUserConfig = writeUserConfig,
    loadHistoryIndex = readHistoryIndex,
    resolveHistoryEntry = resolveHistoryIndexEntry,
    loadHistoryMessages = readChatHistoryMessages,
    persistHistory = saveChatHistory,
    getShellScopeId = getShellSessionScopeId,
    getLoadedSessionId = getActiveSessionId,
    saveLoadedSessionId = setActiveSessionId,
    renderMarkdown = renderMarkdownForTerminal
  } = {}
) {
  const args = rawArgs[0] === "chat" ? rawArgs.slice(1) : rawArgs;

  if (args.includes("--help") || args.includes("-h")) {
    stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  let options;

  try {
    options = parseArgs(args);
    validateOptions(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const configPath = getUserConfigPath();

  if (Object.keys(options.configUpdates).length > 0) {
    const userConfig = await loadUserConfig();
    const nextConfig = {
      ...userConfig,
      ...options.configUpdates
    };

    await saveUserConfig(nextConfig, { configPath });
    stdout.write(`Updated user config at ${configPath}: ${formatConfigUpdates(options.configUpdates)}\n`);
    return 0;
  }

  if (options.historyCommand === "list") {
    const historyItems = await loadHistoryIndex();
    stdout.write(formatHistoryList(historyItems));
    return 0;
  }

  if (options.historyCommand === "show") {
    const historyItems = await loadHistoryIndex();
    const historyEntry = resolveHistoryEntry(historyItems, options.historyTarget);
    const messages = await loadHistoryMessages(historyEntry);
    stdout.write(formatHistoryShow(historyEntry, messages));
    return 0;
  }

  const shellScopeId = getShellScopeId({ env });

  if (options.loadSessionRef) {
    const historyItems = await loadHistoryIndex();
    const historyEntry = resolveHistoryEntry(historyItems, options.loadSessionRef);
    await saveLoadedSessionId(shellScopeId, historyEntry.sessionId);
    stdout.write(`Loaded session ${buildShortSessionId(historyEntry.sessionId)}\n`);
    return 0;
  }

  if (!options.message) {
    stderr.write("Error: message is required.\n");
    stderr.write(`${HELP_TEXT}\n`);
    return 1;
  }

  const userConfig = await loadUserConfig();
  const config = resolveConfig(options, env, userConfig);
  const historyItems = await loadHistoryIndex();
  const activeSessionRef = options.multi
    ? undefined
    : options.sessionRef ?? readSessionRefFromEnv(env) ?? (await getLoadedSessionId(shellScopeId));
  const historyEntry = activeSessionRef ? resolveHistoryEntry(historyItems, activeSessionRef) : undefined;
  const priorMessages = historyEntry
    ? await loadHistoryMessages(historyEntry)
    : [];
  let hasStreamedOutput = false;

  const response = await chat({
    ...config,
    priorMessages,
    onDelta: config.stream
      ? (chunk) => {
          hasStreamedOutput = true;
          stdout.write(chunk);
        }
      : undefined
  });

  try {
    const historyResult = await persistHistory({
      sessionId: historyEntry?.sessionId,
      historyPath: historyEntry?.historyPath,
      message: config.message,
      response,
      model: config.model,
      baseUrl: config.baseUrl,
      systemPrompt: config.systemPrompt
    });

    if (options.multi) {
      await saveLoadedSessionId(shellScopeId, historyResult.sessionId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Warning: failed to save chat history: ${message}\n`);
  }

  if (config.stream) {
    if (!hasStreamedOutput) {
      stdout.write(`${response}\n`);
      return 0;
    }

    stdout.write("\n");
    return 0;
  }

  const renderedResponse = stdout.isTTY
    ? renderMarkdown(response, { columns: stdout.columns })
    : response;

  stdout.write(`${renderedResponse}\n`);

  return 0;
}

export function parseArgs(args) {
  const options = {
    configUpdates: [],
    historyCommand: undefined,
    historyTarget: undefined,
    loadSessionRef: undefined,
    messageParts: [],
    multi: false,
    sessionRef: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--model") {
      options.model = readNextValue(args, index, "--model");
      index += 1;
      continue;
    }

    if (arg === "--base-url") {
      options.baseUrl = readNextValue(args, index, "--base-url");
      index += 1;
      continue;
    }

    if (arg === "--api-key") {
      options.apiKey = readNextValue(args, index, "--api-key");
      index += 1;
      continue;
    }

    if (arg === "--system") {
      options.systemPrompt = readNextValue(args, index, "--system");
      index += 1;
      continue;
    }

    if (arg === "--config") {
      options.configUpdates.push(parseConfigAssignment(readNextValue(args, index, "--config")));
      index += 1;
      continue;
    }

    if (arg === "--history") {
      options.historyCommand = readNextValue(args, index, "--history");
      index += 1;

      if (options.historyCommand === "show") {
        options.historyTarget = readNextValue(args, index, "--history show");
        index += 1;
      }

      continue;
    }

    if (arg === "--session") {
      options.sessionRef = readNextValue(args, index, "--session");
      index += 1;
      continue;
    }

    if (arg === "--load") {
      options.loadSessionRef = readNextValue(args, index, "--load");
      index += 1;
      continue;
    }

    if (arg === "--multi") {
      options.multi = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }

    options.messageParts.push(arg);
  }

  return {
    ...options,
    configUpdates: mergeConfigUpdates(options.configUpdates),
    message: options.messageParts.join(" ").trim()
  };
}

export function resolveConfig(options, env, userConfig = {}) {
  const apiKey = options.apiKey ?? userConfig.apiKey ?? env.OPENAI_API_KEY;
  const model = options.model ?? userConfig.model ?? env.OPENAI_MODEL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Use --api-key or set the environment variable.");
  }

  if (!model) {
    throw new Error("OPENAI_MODEL is required. Use --model or set the environment variable.");
  }

  return {
    apiKey,
    model,
    baseUrl: options.baseUrl ?? userConfig.baseUrl ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    systemPrompt: options.systemPrompt ?? userConfig.systemPrompt ?? env.OPENAI_SYSTEM,
    stream: userConfig.stream ?? parseBooleanEnvValue(env.OPENAI_STREAM) ?? true,
    message: options.message
  };
}

function validateOptions(options) {
  if (options.multi && options.sessionRef) {
    throw new Error("--multi cannot be combined with --session");
  }

  if (options.historyCommand && options.historyCommand !== "list") {
    if (options.historyCommand !== "show") {
      throw new Error("--history only supports list or show");
    }
  }

  if (options.historyCommand === "show" && !options.historyTarget) {
    throw new Error("--history show requires a sessionId");
  }

  if (options.historyCommand && options.message) {
    throw new Error("--history cannot be combined with a message");
  }

  if (options.loadSessionRef && options.message) {
    throw new Error("--load cannot be combined with a message");
  }

  if (options.loadSessionRef && options.multi) {
    throw new Error("--load cannot be combined with --multi");
  }

  if (options.loadSessionRef && options.sessionRef) {
    throw new Error("--load cannot be combined with --session");
  }

  if (Object.keys(options.configUpdates).length > 0 && options.message) {
    throw new Error("--config cannot be combined with a message");
  }
}

function formatHistoryList(historyItems) {
  if (historyItems.length === 0) {
    return "sessionId\ttitle\tupdateTime\n";
  }

  const lines = historyItems.map((item) =>
    [buildShortSessionId(item.sessionId), item.title, item.updateTime].join("\t")
  );

  return `sessionId\ttitle\tupdateTime\n${lines.join("\n")}\n`;
}

function formatHistoryShow(historyEntry, messages) {
  const header = [
    `sessionId: ${historyEntry.sessionId}`,
    `shortId: ${buildShortSessionId(historyEntry.sessionId)}`,
    `title: ${historyEntry.title}`,
    `updateTime: ${historyEntry.updateTime}`,
    `historyPath: ${historyEntry.historyPath}`
  ].join("\n");

  const body = messages
    .map((message) => `${message.role}:\n${message.content}`)
    .join("\n\n");

  return `${header}\n\n${body}\n`;
}

function readSessionRefFromEnv(env) {
  return typeof env[ACTIVE_SESSION_ENV_NAME] === "string" && env[ACTIVE_SESSION_ENV_NAME].trim() !== ""
    ? env[ACTIVE_SESSION_ENV_NAME].trim()
    : undefined;
}

function parseConfigAssignment(rawValue) {
  const separatorIndex = rawValue.indexOf("=");

  if (separatorIndex === -1) {
    throw new Error("--config requires key=value syntax");
  }

  const key = rawValue.slice(0, separatorIndex).trim();
  const value = rawValue.slice(separatorIndex + 1).trim();

  if (key !== "stream") {
    throw new Error(`unsupported config key: ${key}`);
  }

  if (value === "true") {
    return { stream: true };
  }

  if (value === "false") {
    return { stream: false };
  }

  throw new Error("stream config must be true or false");
}

function mergeConfigUpdates(updates) {
  return updates.reduce((merged, update) => ({ ...merged, ...update }), {});
}

function formatConfigUpdates(updates) {
  return Object.entries(updates)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function parseBooleanEnvValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return undefined;
}

function readNextValue(args, index, optionName) {
  const nextValue = args[index + 1];

  if (!nextValue || nextValue.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }

  return nextValue;
}
