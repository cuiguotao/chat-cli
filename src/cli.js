import { createTemporaryChatCompletion } from "./openai-chat.js";
import { getUserConfigPath, readUserConfig } from "./config.js";

const HELP_TEXT = `Usage:
  chat "Your message"
  chat --model your-model-name --base-url https://api.openai.com/v1 "Hello"

User config:
  ${getUserConfigPath()}
  Created automatically on first run if missing.
  Values in this file override environment variables.

Environment variables:
  OPENAI_API_KEY   Required API key
  OPENAI_BASE_URL  Optional, defaults to https://api.openai.com/v1
  OPENAI_MODEL     Required model name
  OPENAI_SYSTEM    Optional system prompt
`;

export async function runCli(
  rawArgs,
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    chat = createTemporaryChatCompletion,
    loadUserConfig = readUserConfig
  } = {}
) {
  const args = rawArgs[0] === "chat" ? rawArgs.slice(1) : rawArgs;

  if (args.includes("--help") || args.includes("-h")) {
    stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  const options = parseArgs(args);

  if (!options.message) {
    stderr.write("Error: message is required.\n");
    stderr.write(`${HELP_TEXT}\n`);
    return 1;
  }

  const userConfig = await loadUserConfig();
  const config = resolveConfig(options, env, userConfig);
  const response = await chat(config);
  stdout.write(`${response}\n`);

  return 0;
}

export function parseArgs(args) {
  const options = {
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

    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }

    options.messageParts.push(arg);
  }

  return {
    ...options,
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
    message: options.message
  };
}

function readNextValue(args, index, optionName) {
  const nextValue = args[index + 1];

  if (!nextValue || nextValue.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }

  return nextValue;
}
