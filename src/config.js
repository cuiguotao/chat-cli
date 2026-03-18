import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const USER_CONFIG_FILE_NAME = ".chat-cli.json";

export function getUserConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, USER_CONFIG_FILE_NAME);
}

export async function readUserConfig({
  configPath = getUserConfigPath(),
  readFileImpl = readFile
} = {}) {
  try {
    const rawContent = await readFileImpl(configPath, "utf8");
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
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read user config at ${configPath}: ${message}`);
  }
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
