// ============================================================
// 💬 Slack Bridge
// Connects Alya to Slack via Bolt framework
// ============================================================

import pkg from "@slack/bolt";
const { App } = pkg;
import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory } from "../core/memory.js";
import { getRandomGreeting, SERVICE_CONNECT_MESSAGES } from "../core/personality.js";

export class SlackBridge {
  constructor(config) {
    this.config = config;
    this.llm = new LLMEngine();
    this.app = null;
    this.isReady = false;
  }

  /**
   * Start the Slack bot
   */
  async start() {
    if (!this.config.botToken || !this.config.appToken) {
      console.log("⚠️  Slack: No tokens configured, skipping.");
      return false;
    }

    try {
      this.app = new App({
        token: this.config.botToken,
        appToken: this.config.appToken,
        signingSecret: this.config.signingSecret,
        socketMode: true,
      });

      // Handle direct messages
      this.app.message(async ({ message, say }) => {
        await this.handleMessage(message, say);
      });

      // Handle app mentions in channels
      this.app.event("app_mention", async ({ event, say }) => {
        await this.handleMention(event, say);
      });

      // Slash commands
      this.app.command("/alisa", async ({ command, ack, respond }) => {
        await ack();
        await this.handleCommand(command, respond);
      });

      await this.app.start();
      this.isReady = true;
      console.log("✨ Slack: Connected via Socket Mode");
      console.log(`   ${SERVICE_CONNECT_MESSAGES.slack}`);
      return true;
    } catch (error) {
      console.error("❌ Slack: Connection failed:", error.message);
      return false;
    }
  }

  /**
   * Handle direct messages
   */
  async handleMessage(message, say) {
    // Skip bot messages, edits, and non-text
    if (message.bot_id || message.subtype || !message.text) return;

    const channelId = message.channel;
    const content = message.text;

    // Handle commands
    if (content.toLowerCase() === "clear" || content.toLowerCase() === "reset") {
      clearHistory("slack", channelId);
      await say("✨ Memory cleared! Fresh start. What's next?");
      return;
    }

    // Get conversation history
    const history = getHistory("slack", channelId);

    try {
      const response = await this.llm.chat(history, content);

      addMessage("slack", channelId, "user", content);
      addMessage("slack", channelId, "assistant", response);

      // Check for <media> tag
      const mediaMatch = response.match(/<media>([\s\S]*?)<\/media>/i);
      let textToSend = response.replace(/<media>[\s\S]*?<\/media>/i, "").trim();

      if (textToSend.length > 0) {
        await say(textToSend);
      }

      if (mediaMatch) {
        const mediaSource = mediaMatch[1].trim();
        // Slack auto-previews images if they are URLs
        if (mediaSource.startsWith("http")) {
          await say(mediaSource);
        } else {
          await say(`*(System: Media file path detected, but Slack local file upload is not yet implemented: ${mediaSource})*`);
        }
      }
    } catch (error) {
      console.error("Slack message error:", error);
      await say("✨ Something went wrong. Try again.");
    }
  }

  /**
   * Handle @mentions in channels
   */
  async handleMention(event, say) {
    // Remove the mention from the text
    const content = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const channelId = event.channel;

    if (!content) {
      await say(getRandomGreeting());
      return;
    }

    const history = getHistory("slack", channelId);

    try {
      const response = await this.llm.chat(history, content);

      addMessage("slack", channelId, "user", content);
      addMessage("slack", channelId, "assistant", response);

      // Check for <media> tag
      const mediaMatch = response.match(/<media>([\s\S]*?)<\/media>/i);
      let textToSend = response.replace(/<media>[\s\S]*?<\/media>/i, "").trim();

      const messageOptions = {
        text: textToSend,
        thread_ts: event.thread_ts || event.ts,
      };

      if (textToSend.length > 0) {
        await say(messageOptions);
      }

      if (mediaMatch) {
        const mediaSource = mediaMatch[1].trim();
        if (mediaSource.startsWith("http")) {
          await say({ text: mediaSource, thread_ts: event.thread_ts || event.ts });
        }
      }
    } catch (error) {
      console.error("Slack mention error:", error);
      await say("✨ Something went wrong. Try again.");
    }
  }

  /**
   * Handle /alisa slash command
   */
  async handleCommand(command, respond) {
    const args = command.text.trim().toLowerCase();

    if (args === "help") {
      await respond({
        text: `✨ *Alisa — Help*\n\n• Just message me directly or @mention me!\n• \`/alisa help\` — This help message\n• \`/alisa status\` — Check my systems\n• \`/alisa clear\` — Clear conversation history\n\n_Your local AI assistant — 100% private._ ✨`,
      });
      return;
    }

    if (args === "status") {
      const groqOk = await this.llm.isAvailable();
      await respond({
        text: `✨ *Alisa Status*\n\n🧠 Brain: ${groqOk ? "✅ Online" : "❌ Offline"}\n📡 Slack: ✅ Connected\n🔒 Privacy: 100% Local`,
      });
      return;
    }

    if (args === "clear") {
      clearHistory("slack", command.channel_id);
      await respond({ text: "✨ Memory cleared! Fresh start." });
      return;
    }

    // Treat as a question
    const history = getHistory("slack", command.channel_id);
    const response = await this.llm.chat(history, command.text);
    addMessage("slack", command.channel_id, "user", command.text);
    addMessage("slack", command.channel_id, "assistant", response);
    await respond({ text: response });
  }

  /**
   * Get bridge status
   */
  getStatus() {
    return {
      platform: "slack",
      connected: this.isReady,
    };
  }

  /**
   * Stop the bridge
   */
  async stop() {
    if (this.app) {
      await this.app.stop();
      this.isReady = false;
      console.log("✨ Slack: Disconnected.");
    }
  }
}
