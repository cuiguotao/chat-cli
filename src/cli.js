import { createTemporaryChatCompletion } from "./openai-chat.js";
import { getUserConfigPath, readUserConfig, writeUserConfig } from "./config.js";
import { saveChatHistory } from "./history.js";
import { renderMarkdownForTerminal } from "./terminal-markdown.js";

const HELP_TEXT = `Usage:
  chat "Your message"
  chat --model your-model-name --base-url https://api.openai.com/v1 "Hello"
  chat --config stream=false

User config:
  ${getUserConfigPath()}
  Created automatically on first run if missing.
  Values in this file override environment variables.

Environment variables:
  OPENAI_API_KEY   Required API key
  OPENAI_BASE_URL  Optional, defaults to https://api.openai.com/v1
  OPENAI_MODEL     Required model name
  OPENAI_SYSTEM    Optional system prompt
  OPENAI_STREAM    Optional, true by default
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
    persistHistory = saveChatHistory,
    renderMarkdown = renderMarkdownForTerminal
  } = {}
) {
  const args = rawArgs[0] === "chat" ? rawArgs.slice(1) : rawArgs;

  if (args.includes("--help") || args.includes("-h")) {
    stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  const options = parseArgs(args);
  const configPath = getUserConfigPath();

  if (Object.keys(options.configUpdates).length > 0) {
    if (options.message) {
      stderr.write("Error: --config cannot be combined with a message.\n");
      return 1;
    }

    const userConfig = await loadUserConfig();
    const nextConfig = {
      ...userConfig,
      ...options.configUpdates
    };

    await saveUserConfig(nextConfig, { configPath });
    stdout.write(`Updated user config at ${configPath}: ${formatConfigUpdates(options.configUpdates)}\n`);
    return 0;
  }

  if (!options.message) {
    stderr.write("Error: message is required.\n");
    stderr.write(`${HELP_TEXT}\n`);
    return 1;
  }

  const userConfig = await loadUserConfig();
  const config = resolveConfig(options, env, userConfig);
  let hasStreamedOutput = false;

  const response = await chat({
    ...config,
    onDelta: config.stream
      ? (chunk) => {
          hasStreamedOutput = true;
          stdout.write(chunk);
        }
      : undefined
  });

  try {
    await persistHistory({
      message: config.message,
      response,
      model: config.model,
      baseUrl: config.baseUrl,
      systemPrompt: config.systemPrompt
    });
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
    messageParts: []
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
