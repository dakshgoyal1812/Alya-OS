// ============================================================
// 💬 Discord Bridge
// Connects Alya to Discord as a bot
// ============================================================

import { Client, GatewayIntentBits, Events, ActivityType, AttachmentBuilder } from "discord.js";
import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory } from "../core/memory.js";
import { getRandomGreeting, getThinkingMessage, SERVICE_CONNECT_MESSAGES } from "../core/personality.js";
import { generateTTS } from "../core/tts.js";

export class DiscordBridge {
  constructor(config) {
    this.config = config;
    this.llm = new LLMEngine();
    this.client = null;
    this.isReady = false;
  }

  /**
   * Start the Discord bot
   */
  async start() {
    if (!this.config.token) {
      console.log("⚠️  Discord: No token configured, skipping.");
      return false;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Bot ready
    this.client.once(Events.ClientReady, (c) => {
      this.isReady = true;
      console.log(`✨ Discord: Logged in as ${c.user.tag}`);
      console.log(`   ${SERVICE_CONNECT_MESSAGES.discord}`);

      // Set activity
      c.user.setActivity("for messages | @Alya", {
        type: ActivityType.Watching,
      });
    });

    // Message handler
    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });

    try {
      await this.client.login(this.config.token);
      return true;
    } catch (error) {
      console.error("❌ Discord: Login failed:", error.message);
      return false;
    }
  }

  /**
   * Handle incoming Discord messages
   */
  async handleMessage(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Respond to DMs or when mentioned
    const isMentioned = message.mentions.has(this.client.user);
    const isDM = !message.guild;

    if (!isDM && !isMentioned) return;

    // Get the actual message content (remove mention)
    let content = message.content;
    if (isMentioned) {
      content = content.replace(/<@!?\d+>/g, "").trim();
    }

    if (!content) {
      await message.reply(getRandomGreeting());
      return;
    }

    // Handle special commands
    if (content.toLowerCase() === "!clear" || content.toLowerCase() === "!reset") {
      clearHistory("discord", message.channel.id);
      await message.reply("✨ Memory cleared! Fresh start. What's next?");
      return;
    }

    if (content.toLowerCase() === "!ping") {
      await message.reply(`✨ Pong! Latency: ${this.client.ws.ping}ms. Systems operational.`);
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Get conversation history
    const history = getHistory("discord", message.channel.id);

    try {
      // Get LLM response
      const response = await this.llm.chat(history, content);

      // Store messages
      addMessage("discord", message.channel.id, "user", content);
      addMessage("discord", message.channel.id, "assistant", response);

      // Check for <voice> tag
      const voiceMatch = response.match(/<voice>([\s\S]*?)<\/voice>/i);
      // Check for <media> tag
      const mediaMatch = response.match(/<media>([\s\S]*?)<\/media>/i);

      let textToSend = response
        .replace(/<voice>[\s\S]*?<\/voice>/i, "")
        .replace(/<media>[\s\S]*?<\/media>/i, "")
        .trim();

      if (textToSend.length > 0) {
        // Split long responses (Discord has 2000 char limit)
        if (textToSend.length > 1900) {
          const chunks = splitMessage(textToSend, 1900);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(textToSend);
        }
      }

      // Send Media if requested
      if (mediaMatch) {
        const mediaSource = mediaMatch[1].trim();
        const attachment = new AttachmentBuilder(mediaSource);
        await message.channel.send({ files: [attachment] });
      }

      // Send Voice Note if requested
      if (voiceMatch) {
        const spokenText = voiceMatch[1].trim();
        const audioPath = await generateTTS(spokenText);
        if (audioPath) {
          const attachment = new AttachmentBuilder(audioPath);
          await message.channel.send({ files: [attachment] });
        }
      }
    } catch (error) {
      console.error("Discord message error:", error);
      await message.reply("✨ Something went wrong. Try again in a moment.");
    }
  }

  /**
   * Get bridge status
   */
  getStatus() {
    return {
      platform: "discord",
      connected: this.isReady,
      username: this.client?.user?.tag || "Not connected",
      guilds: this.client?.guilds?.cache?.size || 0,
    };
  }

  /**
   * Stop the bridge
   */
  async stop() {
    if (this.client) {
      this.client.destroy();
      this.isReady = false;
      console.log("✨ Discord: Disconnected.");
    }
  }
}

/**
 * Split a message into chunks
 */
function splitMessage(text, maxLength) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt === -1) {
      splitAt = maxLength;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}
