import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const result = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getUserConfigPath() {
  const home = os.homedir();
  const primaryDir = path.join(home, ".openclaude");
  if (!fs.existsSync(primaryDir)) {
    try {
      fs.mkdirSync(primaryDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return path.join(primaryDir, "opencode-unlocked.json");
}

export function loadUserConfig() {
  const configPath = getUserConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveUserConfig(data) {
  const configPath = getUserConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const current = loadUserConfig();
  const updated = { ...current, ...data };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function getApiKey() {
  // 1. Process environment variables
  if (process.env.OPENCODE_UNLOCKED_API_KEY) return process.env.OPENCODE_UNLOCKED_API_KEY;
  if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY;
  if (process.env.GO_KEY) return process.env.GO_KEY;

  // 2. User config (~/.openclaude/opencode-unlocked.json)
  const userConfig = loadUserConfig();
  if (userConfig.apiKey) return userConfig.apiKey;
  if (userConfig.GO_KEY) return userConfig.GO_KEY;

  // 3. Optional local .env (checked in CWD and repo root, strictly ignored by git)
  const cwdEnv = parseEnvFile(path.join(process.cwd(), ".env"));
  if (cwdEnv.OPENCODE_UNLOCKED_API_KEY) return cwdEnv.OPENCODE_UNLOCKED_API_KEY;
  if (cwdEnv.OPENCODE_API_KEY) return cwdEnv.OPENCODE_API_KEY;
  if (cwdEnv.GO_KEY) return cwdEnv.GO_KEY;

  const repoEnv = parseEnvFile(path.join(import.meta.dirname, "..", ".env"));
  if (repoEnv.OPENCODE_UNLOCKED_API_KEY) return repoEnv.OPENCODE_UNLOCKED_API_KEY;
  if (repoEnv.OPENCODE_API_KEY) return repoEnv.OPENCODE_API_KEY;
  if (repoEnv.GO_KEY) return repoEnv.GO_KEY;

  return null;
}

export const CONFIG = {
  PORT: parseInt(process.env.OPENCODE_UNLOCKED_PORT || "8788", 10),
  HOST: process.env.OPENCODE_UNLOCKED_HOST || "127.0.0.1",
  UPSTREAM_BASE_URL: (process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1").replace(/\/+$/, ""),
  DEFAULT_MODEL: process.env.OPENCODE_UNLOCKED_DEFAULT_MODEL || "muse-spark-1.3-contributor",
  USER_AGENT: "opencode/stable/2.0.24/cli",
  CLIENT: "cli",
  PROJECT: "default",
  VERSION: "1.0.0"
};
