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
  clearActiveSessionId,
  getActiveSessionId,
  getShellSessionScopeId,
  setActiveSessionId
} from "./shell-session.js";
import { renderMarkdownForTerminal } from "./terminal-markdown.js";
import {
  formatAssistantResponse,
  formatAssistantStreamHeader,
  formatCurrentSessionView,
  formatHelpView,
  formatHistoryListView,
  formatNoticeView,
  formatSessionView
} from "./terminal-ui.js";

const HELP_TEXT = `Usage:
  chat "Your message"
  chat --multi "Start a multi-turn session"
  chat --session sessionId "Continue a session"
  chat --load sessionId
  chat --current
  chat --clear
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
    clearLoadedSessionId = clearActiveSessionId,
    renderMarkdown = renderMarkdownForTerminal
  } = {}
) {
  const args = rawArgs[0] === "chat" ? rawArgs.slice(1) : rawArgs;
  const interactiveOutput = isInteractiveTerminal(stdout);
  const outputColumns = interactiveOutput ? stdout.columns : undefined;

  if (args.includes("--help") || args.includes("-h")) {
    stdout.write(
      interactiveOutput
        ? formatHelpView({
            configPath: getUserConfigPath(),
            activeSessionEnvName: ACTIVE_SESSION_ENV_NAME,
            columns: outputColumns
          })
        : `${HELP_TEXT}\n`
    );
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
    stdout.write(
      interactiveOutput
        ? formatNoticeView(
            "Config Updated",
            [
              `Path: ${configPath}`,
              `Changes: ${formatConfigUpdates(options.configUpdates)}`
            ],
            {
              columns: outputColumns,
              tone: "green",
              subtitle: "User configuration saved"
            }
          )
        : `Updated user config at ${configPath}: ${formatConfigUpdates(options.configUpdates)}\n`
    );
    return 0;
  }

  if (options.historyCommand === "list") {
    const historyItems = await loadHistoryIndex();
    stdout.write(
      interactiveOutput
        ? formatHistoryListView(historyItems, { columns: outputColumns })
        : formatHistoryList(historyItems)
    );
    return 0;
  }

  if (options.historyCommand === "show") {
    const historyItems = await loadHistoryIndex();
    const historyEntry = resolveHistoryEntry(historyItems, options.historyTarget);
    const messages = await loadHistoryMessages(historyEntry);
    stdout.write(
      interactiveOutput
        ? formatSessionView(historyEntry, messages, { columns: outputColumns })
        : formatHistoryShow(historyEntry, messages)
    );
    return 0;
  }

  const shellScopeId = getShellScopeId({ env });
  const sessionRefFromEnv = readSessionRefFromEnv(env);

  if (options.current) {
    const loadedSessionRef = sessionRefFromEnv ?? (await getLoadedSessionId(shellScopeId));

    if (!loadedSessionRef) {
      stdout.write(
        interactiveOutput
          ? formatNoticeView("Current Session", ["No active session loaded in this terminal."], {
              columns: outputColumns,
              tone: "blue",
              subtitle: "Session state"
            })
          : "No current session\n"
      );
      return 0;
    }

    const historyItems = await loadHistoryIndex();
    const historyEntry = resolveHistoryEntry(historyItems, loadedSessionRef);
    stdout.write(
      interactiveOutput
        ? formatCurrentSessionView(historyEntry, { columns: outputColumns })
        : formatCurrentSession(historyEntry)
    );
    return 0;
  }

  if (options.clear) {
    await clearLoadedSessionId(shellScopeId);
    stdout.write(
      interactiveOutput
        ? formatNoticeView("Session Cleared", ["The active session was removed from this terminal."], {
            columns: outputColumns,
            tone: "blue",
            subtitle: "Session state"
          })
        : "Cleared current session\n"
    );
    return 0;
  }

  if (options.loadSessionRef) {
    const historyItems = await loadHistoryIndex();
    const historyEntry = resolveHistoryEntry(historyItems, options.loadSessionRef);
    await saveLoadedSessionId(shellScopeId, historyEntry.sessionId);
    stdout.write(
      interactiveOutput
        ? formatNoticeView(
            "Session Loaded",
            [
              `Short ID: ${buildShortSessionId(historyEntry.sessionId)}`,
              `Title: ${historyEntry.title}`
            ],
            {
              columns: outputColumns,
              tone: "green",
              subtitle: "Ready for follow-up prompts"
            }
          )
        : `Loaded session ${buildShortSessionId(historyEntry.sessionId)}\n`
    );
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
    : options.sessionRef ?? sessionRefFromEnv ?? (await getLoadedSessionId(shellScopeId));
  const historyEntry = activeSessionRef ? resolveHistoryEntry(historyItems, activeSessionRef) : undefined;
  const priorMessages = historyEntry
    ? await loadHistoryMessages(historyEntry)
    : [];
  let hasStreamedOutput = false;
  let hasRenderedStreamHeader = false;

  const response = await chat({
    ...config,
    priorMessages,
    onDelta: config.stream
      ? (chunk) => {
          if (interactiveOutput && !hasRenderedStreamHeader) {
            stdout.write(formatAssistantStreamHeader({ columns: outputColumns }));
            hasRenderedStreamHeader = true;
          }

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

  stdout.write(
    interactiveOutput
      ? `${formatAssistantResponse(renderedResponse, { columns: outputColumns })}\n`
      : `${renderedResponse}\n`
  );

  return 0;
}

export function parseArgs(args) {
  const options = {
    configUpdates: [],
    historyCommand: undefined,
    historyTarget: undefined,
    clear: false,
    current: false,
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

    if (arg === "--clear") {
      options.clear = true;
      continue;
    }

    if (arg === "--current") {
      options.current = true;
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

  if (options.clear && options.message) {
    throw new Error("--clear cannot be combined with a message");
  }

  if (options.current && options.message) {
    throw new Error("--current cannot be combined with a message");
  }

  if (options.loadSessionRef && options.multi) {
    throw new Error("--load cannot be combined with --multi");
  }

  if (options.clear && options.multi) {
    throw new Error("--clear cannot be combined with --multi");
  }

  if (options.current && options.multi) {
    throw new Error("--current cannot be combined with --multi");
  }

  if (options.loadSessionRef && options.sessionRef) {
    throw new Error("--load cannot be combined with --session");
  }

  if (options.clear && options.sessionRef) {
    throw new Error("--clear cannot be combined with --session");
  }

  if (options.current && options.sessionRef) {
    throw new Error("--current cannot be combined with --session");
  }

  if (options.clear && options.loadSessionRef) {
    throw new Error("--clear cannot be combined with --load");
  }

  if (options.current && options.loadSessionRef) {
    throw new Error("--current cannot be combined with --load");
  }

  if (options.clear && options.historyCommand) {
    throw new Error("--clear cannot be combined with --history");
  }

  if (options.current && options.historyCommand) {
    throw new Error("--current cannot be combined with --history");
  }

  if (Object.keys(options.configUpdates).length > 0 && options.message) {
    throw new Error("--config cannot be combined with a message");
  }

  if (options.clear && Object.keys(options.configUpdates).length > 0) {
    throw new Error("--clear cannot be combined with --config");
  }

  if (options.current && Object.keys(options.configUpdates).length > 0) {
    throw new Error("--current cannot be combined with --config");
  }

  if (options.current && options.clear) {
    throw new Error("--current cannot be combined with --clear");
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

function formatCurrentSession(historyEntry) {
  return [
    `sessionId: ${historyEntry.sessionId}`,
    `shortId: ${buildShortSessionId(historyEntry.sessionId)}`,
    `title: ${historyEntry.title}`,
    `updateTime: ${historyEntry.updateTime}`
  ].join("\n") + "\n";
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

function isInteractiveTerminal(output) {
  return Boolean(output?.isTTY);
}
