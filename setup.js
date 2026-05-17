#!/usr/bin/env node
// ============================================================
// ✨ Alya — Guided Setup Wizard
// Interactive CLI to configure all services
// ============================================================

import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import figlet from "figlet";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "config");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// Color helpers
const r = chalk.hex("#22d3ee");  // alya cyan
const b = chalk.hex("#60a5fa");  // ocean blue
const g = chalk.hex("#22c55e");  // green
const d = chalk.dim;
const bold = chalk.bold;

async function main() {
  console.clear();

  // ASCII Art title
  const title = figlet.textSync("Alya", { font: "Standard" });
  console.log(r(title));
  console.log(r("  ✨  Alya — Your Private AI Assistant"));
  console.log(d("  ─────────────────────────────────────────────\n"));

  console.log(b("  Welcome to Alya's setup wizard!"));
  console.log(d("  This will walk you through connecting your accounts."));
  console.log(d("  Everything stays local on your machine. 🔒\n"));

  const config = {
    ollama: {},
    web: { enabled: true, port: 3000 },
    discord: { enabled: false },
    telegram: { enabled: false },
    slack: { enabled: false },
    whatsapp: { enabled: false },
  };

  // ── Step 1: Groq API Setup ──────────────────────────────────
  console.log(bold("\n  🧠 Step 1: Groq Cloud AI Setup\n"));
  console.log(d("  Alya will run on Groq's superfast Llama 3 servers for free."));
  console.log(d("  Get your free API key at: ") + b("https://console.groq.com/keys\n"));

  const groqAnswers = await inquirer.prompt([
    {
      type: "input",
      name: "apiKey",
      message: r("✨") + " Your Groq API Key:",
      validate: (input) => input.startsWith("gsk_") ? true : "Groq API keys usually start with 'gsk_'",
    },
    {
      type: "list",
      name: "model",
      message: r("✨") + " Which model to use?",
      choices: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      default: "llama-3.3-70b-versatile",
    },
  ]);

  config.groq = {
    apiKey: groqAnswers.apiKey,
    model: groqAnswers.model,
  };

  console.log(g("\n  ✓ Groq API Key Saved"));

  // ── Step 2: Web Dashboard ────────────────────────────────
  console.log(bold("\n  🌐 Step 2: Web Dashboard\n"));
  console.log(d("  A beautiful web UI with voice chat. Always recommended!\n"));

  const webAnswers = await inquirer.prompt([
    {
      type: "confirm",
      name: "enabled",
      message: r("🦞") + " Enable the web dashboard?",
      default: true,
    },
    {
      type: "number",
      name: "port",
      message: r("🦞") + " Dashboard port:",
      default: 3000,
      when: (a) => a.enabled,
    },
  ]);
  config.web = { enabled: webAnswers.enabled, port: webAnswers.port || 3000 };

  // ── Step 3: Chat Bridges ─────────────────────────────────
  console.log(bold("\n  🔗 Step 3: Chat Platform Bridges\n"));
  console.log(d("  Connect Alya to your favorite messaging apps."));
  console.log(d("  You can skip any platform and add it later.\n"));

  const bridgeChoices = await inquirer.prompt([
    {
      type: "checkbox",
      name: "platforms",
      message: r("🦞") + " Which platforms do you want to connect?",
      choices: [
        { name: "💬 Discord", value: "discord" },
        { name: "✈️  Telegram", value: "telegram" },
        { name: "💼 Slack", value: "slack" },
        { name: "📱 WhatsApp", value: "whatsapp" },
      ],
    },
  ]);

  // ── Discord Setup ──
  if (bridgeChoices.platforms.includes("discord")) {
    console.log(bold("\n  💬 Discord Setup\n"));
    console.log(d("  Create a bot at: ") + b("https://discord.com/developers/applications"));
    console.log(d("  Enable MESSAGE CONTENT intent in Bot settings."));
    console.log(d("  Invite bot with: applications.commands + bot scopes\n"));

    const discordAnswers = await inquirer.prompt([
      {
        type: "password",
        name: "token",
        message: r("🦞") + " Discord bot token:",
        mask: "•",
      },
    ]);
    config.discord = { enabled: true, token: discordAnswers.token };
  }

  // ── Telegram Setup ──
  if (bridgeChoices.platforms.includes("telegram")) {
    console.log(bold("\n  ✈️  Telegram Setup\n"));
    console.log(d("  Talk to ") + b("@BotFather") + d(" on Telegram to create a bot."));
    console.log(d("  It will give you an API token.\n"));

    const telegramAnswers = await inquirer.prompt([
      {
        type: "password",
        name: "token",
        message: r("🦞") + " Telegram bot token:",
        mask: "•",
      },
    ]);
    config.telegram = { enabled: true, token: telegramAnswers.token };
  }

  // ── Slack Setup ──
  if (bridgeChoices.platforms.includes("slack")) {
    console.log(bold("\n  💼 Slack Setup\n"));
    console.log(d("  Create a Slack app at: ") + b("https://api.slack.com/apps"));
    console.log(d("  Enable Socket Mode and add these scopes:"));
    console.log(d("  Bot: app_mentions:read, chat:write, im:history, im:read, im:write\n"));

    const slackAnswers = await inquirer.prompt([
      {
        type: "password",
        name: "botToken",
        message: r("🦞") + " Bot Token (xoxb-...):",
        mask: "•",
      },
      {
        type: "password",
        name: "appToken",
        message: r("🦞") + " App Token (xapp-...):",
        mask: "•",
      },
      {
        type: "password",
        name: "signingSecret",
        message: r("🦞") + " Signing Secret:",
        mask: "•",
      },
    ]);
    config.slack = { enabled: true, ...slackAnswers };
  }

  // ── WhatsApp Setup ──
  if (bridgeChoices.platforms.includes("whatsapp")) {
    console.log(bold("\n  📱 WhatsApp Setup\n"));
    console.log(d("  WhatsApp uses QR code auth — no API keys needed!"));
    console.log(d("  When you start Alya, a QR code will appear."));
    console.log(d("  Scan it with WhatsApp → Settings → Linked Devices.\n"));

    const waAnswers = await inquirer.prompt([
      {
        type: "confirm",
        name: "enabled",
        message: r("🦞") + " Enable WhatsApp bridge?",
        default: true,
      },
    ]);
    config.whatsapp = { enabled: waAnswers.enabled };
  }

  // ── Step 4: Email Setup ──────────────────────────────────
  console.log(bold("\n  📧 Step 4: Email Configuration\n"));
  console.log(d("  Give Alya the ability to send emails on your behalf."));
  console.log(d("  (Recommended: Use a Gmail account with an App Password)\n"));

  const emailChoice = await inquirer.prompt([
    {
      type: "confirm",
      name: "enabled",
      message: r("✨") + " Enable email sending?",
      default: false,
    },
  ]);

  if (emailChoice.enabled) {
    const emailAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "user",
        message: r("✨") + " Your Gmail address:",
      },
      {
        type: "password",
        name: "pass",
        message: r("✨") + " Your Gmail App Password (NOT your normal password):",
        mask: "•",
      },
    ]);
    config.email = { enabled: true, service: "gmail", user: emailAnswers.user, pass: emailAnswers.pass };
  } else {
    config.email = { enabled: false };
  }

  // ── Save Config ──────────────────────────────────────────
  console.log(bold("\n  💾 Saving Configuration\n"));

  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log(g("  ✅ Config saved to: ") + d(CONFIG_PATH));

  // ── Summary ──────────────────────────────────────────────
  console.log(r("\n  ╔══════════════════════════════════════════╗"));
  console.log(r("  ║     ✨  Setup Complete!                  ║"));
  console.log(r("  ╚══════════════════════════════════════════╝\n"));

  console.log(bold("  What's been configured:\n"));
  console.log(`  🧠 Groq AI: ${g(config.groq.model)}`);
  console.log(`  🌐 Web Dashboard: ${config.web.enabled ? g("Enabled") + d(` (port ${config.web.port})`) : r("Disabled")}`);
  console.log(`  💬 Discord: ${config.discord.enabled ? g("Enabled") : d("Disabled")}`);
  console.log(`  ✈️  Telegram: ${config.telegram.enabled ? g("Enabled") : d("Disabled")}`);
  console.log(`  💼 Slack: ${config.slack.enabled ? g("Enabled") : d("Disabled")}`);
  console.log(`  📱 WhatsApp: ${config.whatsapp.enabled ? g("Enabled") : d("Disabled")}`);
  console.log(`  📧 Email: ${config.email?.enabled ? g("Enabled") : d("Disabled")}`);

  console.log(bold("\n  Next steps:\n"));
  if (!config.discord.enabled && !config.telegram.enabled && !config.slack.enabled && !config.whatsapp.enabled) {
    console.log(d("  You haven't connected any chat apps yet."));
    console.log(d("  That's fine! You can use the web dashboard."));
    console.log(d("  Run ") + b("npm run setup") + d(" again to add platforms later.\n"));
  }
  console.log(`  1. Start Alya: ${b("npm start")}\n`);
  console.log(r("  ✨ See you soon!\n"));
}

main().catch((err) => {
  console.error("Setup error:", err);
  process.exit(1);
});
