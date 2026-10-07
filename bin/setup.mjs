#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const homeDir = os.homedir();
const openclaudeDir = path.join(homeDir, ".openclaude");
const profilePath = path.join(openclaudeDir, ".openclaude-profile.json");
const profileBackupPath = path.join(openclaudeDir, ".openclaude-profile.json.backup");

const globalConfigPath = path.join(homeDir, ".openclaude.json");
const globalConfigBackupPath = path.join(homeDir, ".openclaude.json.backup");

const { CONFIG, loadUserConfig } = await import("../server/config.mjs");

const PROVIDER_ID = "provider_opencode_unlocked";
const PROVIDER_NAME = "Opencode Unlocked";

export function configureOpenClaudeProfile(options = {}) {
  const userConfig = loadUserConfig();
  const targetModel = options.model || userConfig.defaultModel || CONFIG.DEFAULT_MODEL;
  const targetPort = options.port || CONFIG.PORT;
  const targetHost = options.host || CONFIG.HOST;
  const baseUrl = `http://${targetHost}:${targetPort}/v1`;

  // 1. Configure plural provider profile in ~/.openclaude.json
  if (fs.existsSync(globalConfigPath)) {
    if (!fs.existsSync(globalConfigBackupPath)) {
      fs.copyFileSync(globalConfigPath, globalConfigBackupPath);
      console.log(`✔ Backed up existing ~/.openclaude.json to: ${globalConfigBackupPath}`);
    }

    try {
      const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, "utf-8"));
      globalConfig.providerProfiles = Array.isArray(globalConfig.providerProfiles) ? globalConfig.providerProfiles : [];

      const existingIndex = globalConfig.providerProfiles.findIndex(p => p.id === PROVIDER_ID || p.name === PROVIDER_NAME);
      const unlockedProfile = {
        id: PROVIDER_ID,
        name: PROVIDER_NAME,
        provider: "openai",
        baseUrl,
        model: targetModel,
        apiKey: "opencode-unlocked"
      };

      if (existingIndex !== -1) {
        globalConfig.providerProfiles[existingIndex] = unlockedProfile;
      } else {
        globalConfig.providerProfiles.push(unlockedProfile);
      }

      globalConfig.activeProviderProfileId = PROVIDER_ID;

      // Register model options cache for picker UI
      globalConfig.openaiAdditionalModelOptionsCacheByProfile = globalConfig.openaiAdditionalModelOptionsCacheByProfile || {};
      globalConfig.openaiAdditionalModelOptionsCacheByProfile[PROVIDER_ID] = [
        { value: "muse-spark-1.3-contributor", label: "Muse Spark 1.3 Contributor", description: "Default Reasoning Model" },
        { value: "space-bunny", label: "Space Bunny", description: "Lightweight Chat & Code Model" },
        { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "High-Throughput Model" },
        { value: "glm-5.3", label: "GLM 5.3", description: "General Language Model" }
      ];

      fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2), "utf-8");
      console.log(`✔ Updated ~/.openclaude.json (active provider set to: ${PROVIDER_NAME})`);
    } catch (err) {
      console.warn(`⚠ Could not update ~/.openclaude.json: ${err.message}`);
    }
  }

  // 2. Configure legacy mirror ~/.openclaude/.openclaude-profile.json
  if (!fs.existsSync(openclaudeDir)) {
    fs.mkdirSync(openclaudeDir, { recursive: true });
  }

  if (fs.existsSync(profilePath) && !fs.existsSync(profileBackupPath)) {
    fs.copyFileSync(profilePath, profileBackupPath);
    console.log(`✔ Backed up existing .openclaude-profile.json to: ${profileBackupPath}`);
  }

  const legacyProfile = {
    profile: "openai",
    env: {
      OPENAI_BASE_URL: baseUrl,
      OPENAI_MODEL: targetModel,
      OPENAI_API_KEY: "opencode-unlocked"
    },
    displayName: PROVIDER_NAME,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(profilePath, JSON.stringify(legacyProfile, null, 2), "utf-8");
  console.log(`✔ OpenClaude provider profile configured successfully!`);
  console.log(`  Provider Name  : ${PROVIDER_NAME}`);
  console.log(`  OPENAI_BASE_URL: ${baseUrl}`);
  console.log(`  OPENAI_MODEL   : ${targetModel}`);

  return legacyProfile;
}

export function restoreOriginalProfile() {
  let restored = false;
  if (fs.existsSync(globalConfigBackupPath)) {
    fs.copyFileSync(globalConfigBackupPath, globalConfigPath);
    console.log(`✔ Restored ~/.openclaude.json from: ${globalConfigBackupPath}`);
    restored = true;
  }
  if (fs.existsSync(profileBackupPath)) {
    fs.copyFileSync(profileBackupPath, profilePath);
    console.log(`✔ Restored .openclaude-profile.json from: ${profileBackupPath}`);
    restored = true;
  }
  return restored;
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("setup.mjs")) {
  const arg = process.argv[2];
  if (arg === "restore" || arg === "--restore") {
    restoreOriginalProfile();
  } else {
    configureOpenClaudeProfile({ model: arg });
  }
}
