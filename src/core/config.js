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
    useCloudAPI: false,
    accessToken: "",
    phoneNumberId: "",
    appSecret: "",
    webhookVerifyToken: "alisa_token",
  },
  google: {
    apiKey: "",
    apiKeys: [],
  },
  openrouter: {
    apiKey: "",
    apiKeys: [],
  },
  nvidia: {
    apiKey: "",
    apiKeys: [],
  },
};

let cachedConfig = null;

/**
 * Load the configuration file
 * Falls back to defaults if config doesn't exist
 */
export function loadConfig() {
  if (cachedConfig) return cachedConfig;

  // Parse local .env manually if it exists
  try {
    const envPath = join(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const parts = trimmed.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
          process.env[key] = value;
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const userConfig = JSON.parse(raw);
      // Deep merge with defaults
      cachedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
    }

    // --- Environment Variable Overrides (Crucial for Render/Cloud) ---
    
    // Groq
    if (process.env.GROQ_API_KEY) {
      if (!cachedConfig.groq) cachedConfig.groq = {};
      if (process.env.GROQ_API_KEY.includes(",")) {
        cachedConfig.groq.apiKeys = process.env.GROQ_API_KEY.split(",").map(k => k.trim()).filter(Boolean);
        cachedConfig.groq.apiKey = cachedConfig.groq.apiKeys[0];
      } else {
        cachedConfig.groq.apiKey = process.env.GROQ_API_KEY;
      }
    }
    if (process.env.GROQ_API_KEYS) {
      if (!cachedConfig.groq) cachedConfig.groq = {};
      cachedConfig.groq.apiKeys = process.env.GROQ_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
      if (cachedConfig.groq.apiKeys.length > 0 && !cachedConfig.groq.apiKey) {
        cachedConfig.groq.apiKey = cachedConfig.groq.apiKeys[0];
      }
    }
    if (process.env.GROQ_MODEL) {
      if (!cachedConfig.groq) cachedConfig.groq = {};
      cachedConfig.groq.model = process.env.GROQ_MODEL;
    }

    // Telegram
    if (process.env.TELEGRAM_TOKEN) {
      if (!cachedConfig.telegram) cachedConfig.telegram = {};
      cachedConfig.telegram.enabled = true;
      cachedConfig.telegram.token = process.env.TELEGRAM_TOKEN;
    }

    // Discord
    if (process.env.DISCORD_TOKEN) {
      if (!cachedConfig.discord) cachedConfig.discord = {};
      cachedConfig.discord.enabled = true;
      cachedConfig.discord.token = process.env.DISCORD_TOKEN;
    }

    // WhatsApp
    if (process.env.WHATSAPP_ENABLED === "true") {
      if (!cachedConfig.whatsapp) cachedConfig.whatsapp = {};
      cachedConfig.whatsapp.enabled = true;
    }

    // Email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      cachedConfig.email = {
        enabled: true,
        service: process.env.EMAIL_SERVICE || "gmail",
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      };
    }

    // ElevenLabs
    if (process.env.ELEVENLABS_API_KEY) {
      if (!cachedConfig.elevenlabs) cachedConfig.elevenlabs = { enabled: true, apiKeys: [] };
      cachedConfig.elevenlabs.enabled = true;
      if (process.env.ELEVENLABS_API_KEY.includes(",")) {
        cachedConfig.elevenlabs.apiKeys = process.env.ELEVENLABS_API_KEY.split(",").map(k => k.trim()).filter(Boolean);
      } else {
        cachedConfig.elevenlabs.apiKeys = [process.env.ELEVENLABS_API_KEY];
      }
    }
    if (process.env.ELEVENLABS_API_KEYS) {
      if (!cachedConfig.elevenlabs) cachedConfig.elevenlabs = { enabled: true, apiKeys: [] };
      cachedConfig.elevenlabs.enabled = true;
      cachedConfig.elevenlabs.apiKeys = process.env.ELEVENLABS_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
    }
    if (process.env.ELEVENLABS_VOICE_ID) {
      if (!cachedConfig.elevenlabs) cachedConfig.elevenlabs = {};
      cachedConfig.elevenlabs.voiceId = process.env.ELEVENLABS_VOICE_ID;
    }

    // Google / Gemini Env Variables
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      if (!cachedConfig.google) cachedConfig.google = {};
      const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (envKey.includes(",")) {
        cachedConfig.google.apiKeys = envKey.split(",").map(k => k.trim()).filter(Boolean);
        cachedConfig.google.apiKey = cachedConfig.google.apiKeys[0];
      } else {
        cachedConfig.google.apiKey = envKey;
      }
    }

    // OpenRouter Env Variables
    if (process.env.OPENROUTER_API_KEY) {
      if (!cachedConfig.openrouter) cachedConfig.openrouter = {};
      if (process.env.OPENROUTER_API_KEY.includes(",")) {
        cachedConfig.openrouter.apiKeys = process.env.OPENROUTER_API_KEY.split(",").map(k => k.trim()).filter(Boolean);
        cachedConfig.openrouter.apiKey = cachedConfig.openrouter.apiKeys[0];
      } else {
        cachedConfig.openrouter.apiKey = process.env.OPENROUTER_API_KEY;
      }
    }

    // Nvidia Env Variables
    if (process.env.NVIDIA_API_KEY) {
      if (!cachedConfig.nvidia) cachedConfig.nvidia = {};
      if (process.env.NVIDIA_API_KEY.includes(",")) {
        cachedConfig.nvidia.apiKeys = process.env.NVIDIA_API_KEY.split(",").map(k => k.trim()).filter(Boolean);
        cachedConfig.nvidia.apiKey = cachedConfig.nvidia.apiKeys[0];
      } else {
        cachedConfig.nvidia.apiKey = process.env.NVIDIA_API_KEY;
      }
    }

    // Spotify Env Variables
    if (process.env.SPOTIFY_CLIENT_ID) {
      if (!cachedConfig.spotify) cachedConfig.spotify = {};
      cachedConfig.spotify.clientId = process.env.SPOTIFY_CLIENT_ID;
    }

    // Twitter Env Variables
    if (process.env.TWITTER_API_KEY) {
      if (!cachedConfig.twitter) cachedConfig.twitter = {};
      cachedConfig.twitter.apiKey = process.env.TWITTER_API_KEY;
    }

    // Instagram Env Variables
    if (process.env.INSTAGRAM_ACCESS_TOKEN) {
      if (!cachedConfig.instagram) cachedConfig.instagram = {};
      cachedConfig.instagram.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    }

    // WhatsApp Cloud API Env Variables
    if (process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN) {
      if (!cachedConfig.whatsapp) cachedConfig.whatsapp = {};
      cachedConfig.whatsapp.accessToken = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
      cachedConfig.whatsapp.enabled = true;
      cachedConfig.whatsapp.useCloudAPI = true;
    }
    if (process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID) {
      if (!cachedConfig.whatsapp) cachedConfig.whatsapp = {};
      cachedConfig.whatsapp.phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
    if (process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET) {
      if (!cachedConfig.whatsapp) cachedConfig.whatsapp = {};
      cachedConfig.whatsapp.appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    }
    if (process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN) {
      if (!cachedConfig.whatsapp) cachedConfig.whatsapp = {};
      cachedConfig.whatsapp.webhookVerifyToken = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
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
