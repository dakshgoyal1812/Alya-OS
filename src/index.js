// ============================================================
// ✨ Alya — Main Entry Point
// Boots up Ollama check, all configured bridges, and the web UI
// ============================================================

import { loadConfig } from "./core/config.js";
import { LLMEngine } from "./core/llm.js";
import { ALYA_EMOJI } from "./core/personality.js";
import { DiscordBridge } from "./bridges/discord.js";
import { TelegramBridge } from "./bridges/telegram.js";
import { SlackBridge } from "./bridges/slack.js";
import { WhatsAppBridge } from "./bridges/whatsapp.js";
import { WebBridge } from "./bridges/web.js";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { startCronJobs } from "./core/cron.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const renderSecretPath = "/etc/secrets/config.json";
const localPath = join(__dirname, "..", "config", "config.json");
const configPath = existsSync(renderSecretPath) ? renderSecretPath : localPath;

async function main() {
  console.log("");
  console.log("  ╔══════════════════════════════════════════╗");
  console.log("  ║  ✨  Alya — AI Assistant                 ║");
  console.log("  ║  Private • Local • Always Ready          ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("");

  // Load configuration
  const config = loadConfig();
  const llm = new LLMEngine();

  // Check Groq
  console.log(`${ALYA_EMOJI} Checking Groq Cloud connection...`);
  const groqOk = await llm.isAvailable();
  if (groqOk) {
    console.log(`  ✅ Groq Cloud is connected!`);
    console.log(`  🤖 Model: ${config.groq.model}`);
  } else {
    console.log(`  ⚠️  Groq API Key is missing or invalid.`);
    console.log(`  Please run 'npm run setup' to add your API key.\n`);
  }

  // Start bridges
  const bridges = {};

  // Discord
  if (config.discord?.enabled) {
    console.log(`\n${ALYA_EMOJI} Starting Discord bridge...`);
    const discord = new DiscordBridge(config.discord);
    const ok = await discord.start();
    if (ok) bridges.discord = discord;
  }

  // Telegram
  if (config.telegram?.enabled) {
    console.log(`\n${ALYA_EMOJI} Starting Telegram bridge...`);
    const telegram = new TelegramBridge(config.telegram);
    const ok = await telegram.start();
    if (ok) bridges.telegram = telegram;
  }

  // Slack
  if (config.slack?.enabled) {
    console.log(`\n${ALYA_EMOJI} Starting Slack bridge...`);
    const slack = new SlackBridge(config.slack);
    const ok = await slack.start();
    if (ok) bridges.slack = slack;
  }

  // WhatsApp
  if (config.whatsapp?.enabled) {
    console.log(`\n${ALYA_EMOJI} Starting WhatsApp bridge...`);
    const whatsapp = new WhatsAppBridge(config.whatsapp);
    const ok = await whatsapp.start();
    if (ok) bridges.whatsapp = whatsapp;
  }

  // Web Dashboard (always starts)
  if (config.web?.enabled !== false) {
    console.log(`\n${ALYA_EMOJI} Starting web dashboard...`);
    const web = new WebBridge(config.web || { port: 3000 }, bridges);
    await web.start();
    bridges.web = web;
  }

  // Summary
  const activeBridges = Object.keys(bridges);
  global.bridges = bridges; // Expose globally for automation tools
  
  console.log("\n  ────────────────────────────────────────");
  console.log(`  ${ALYA_EMOJI} Alya is online and ready.`);
  console.log(`  Active bridges: ${activeBridges.join(", ") || "none"}`);
  if (bridges.web) {
    console.log(`  Dashboard: http://localhost:${config.web?.port || 3000}`);
  }
  console.log("  ────────────────────────────────────────\n");

  // Start Background Automations
  startCronJobs(bridges);

  // Global Error Handlers
  process.on("unhandledRejection", (reason, promise) => {
    console.error("🚨 Unhandled Rejection at:", promise, "reason:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("🚨 Uncaught Exception:", err);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log(`\n${ALYA_EMOJI} Alya is shutting down... See you next time.`);
    for (const bridge of Object.values(bridges)) {
      if (bridge.stop) await bridge.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
