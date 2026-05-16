// ============================================================
// ⚙️ Configuration Manager
// Loads and manages the Alya configuration file
// ============================================================

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check Render's secret mount path first, fallback to local config folder
const renderSecretPath = "/etc/secrets/config.json";
const localPath = join(__dirname, "..", "..", "config", "config.json");
const CONFIG_PATH = existsSync(renderSecretPath) ? renderSecretPath : localPath;

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  ollama: {
    host: "http://localhost:11434",
    model: "llama3.2",
    contextWindow: 4096,
    temperature: 0.7,
  },
  web: {
    enabled: true,
    port: 3000,
  },
  discord: {
    enabled: false,
    token: "",
  },
  telegram: {
    enabled: false,
    token: "",
  },
  slack: {
    enabled: false,
    botToken: "",
    appToken: "",
    signingSecret: "",
  },
  whatsapp: {
    enabled: false,
  },
};

let cachedConfig = null;

/**
 * Load the configuration file
 * Falls back to defaults if config doesn't exist
 */
export function loadConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const userConfig = JSON.parse(raw);
      // Deep merge with defaults
      cachedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  } catch (error) {
    console.error("Error loading config:", error.message);
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}

/**
 * Reload config from disk (clears cache)
 */
export function reloadConfig() {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Get the config file path
 */
export function getConfigPath() {
  return CONFIG_PATH;
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
