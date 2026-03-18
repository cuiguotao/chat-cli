import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const USER_CONFIG_DIR_NAME = ".chat-cli";
export const USER_CONFIG_FILE_NAME = "config.json";
export const DEFAULT_USER_CONFIG = {
  apiKey: "",
  model: "",
  baseUrl: "",
  systemPrompt: ""
};

export function getUserConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, USER_CONFIG_DIR_NAME, USER_CONFIG_FILE_NAME);
}

export async function readUserConfig({
  configPath = getUserConfigPath(),
  readFileImpl = readFile,
  mkdirImpl = mkdir,
  writeFileImpl = writeFile
} = {}) {
  try {
    const rawContent = await readFileImpl(configPath, "utf8");
    return parseUserConfig(rawContent);
  } catch (error) {
    if (error?.code === "ENOENT") {
      const defaultConfigText = `${JSON.stringify(DEFAULT_USER_CONFIG, null, 2)}\n`;

      await mkdirImpl(path.dirname(configPath), { recursive: true });
      await writeFileImpl(configPath, defaultConfigText, {
        encoding: "utf8",
        flag: "w"
      });

      return parseUserConfig(defaultConfigText);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read user config at ${configPath}: ${message}`);
  }
}

export function parseUserConfig(rawContent) {
  const parsed = JSON.parse(rawContent);

  if (!isPlainObject(parsed)) {
    throw new Error("config file must contain a JSON object");
  }

  return {
    apiKey: normalizeString(parsed.apiKey),
    baseUrl: normalizeString(parsed.baseUrl),
    model: normalizeString(parsed.model),
    systemPrompt: normalizeString(parsed.systemPrompt)
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}
