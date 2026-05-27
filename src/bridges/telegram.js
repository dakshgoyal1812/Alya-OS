// ============================================================
// 💬 Telegram Bridge
// Connects Alya to Telegram as a bot
// ============================================================

import TelegramBot from "node-telegram-bot-api";
import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory } from "../core/memory.js";
import { getRandomGreeting, SERVICE_CONNECT_MESSAGES } from "../core/personality.js";
import { generateTTS } from "../core/tts.js";
import fs from "fs";
import { join } from "path";

export class TelegramBridge {
  constructor(config) {
    this.config = config;
    this.llm = new LLMEngine();
    this.bot = null;
    this.isReady = false;
    this.botInfo = null;
  }

  /**
   * Start the Telegram bot
   */
  async start() {
    if (!this.config.token || this.config.token.includes("PASTE_YOUR")) {
      console.log("⚠️  Telegram: No valid token configured, skipping.");
      return false;
    }

    try {
      this.bot = new TelegramBot(this.config.token, { 
        polling: false 
      });

      // Get bot info first to test if the token is valid
      this.botInfo = await this.bot.getMe();
      this.isReady = true;
      console.log(`✨ Telegram: Connected as @${this.botInfo.username}`);
      console.log(`   ${SERVICE_CONNECT_MESSAGES.telegram}`);

      // Start polling now that we know the token is valid
      this.bot.startPolling({
        params: { drop_pending_updates: true }
      });

      // Handle polling errors gracefully (especially 409 Conflicts)
      this.bot.on("polling_error", (error) => {
        if (error.message && error.message.includes("409")) {
          console.warn("⚠️ Telegram Warning: 409 Conflict. Another instance of this bot is active elsewhere. Waiting for the other instance to close...");
        } else if (error.message && error.message.includes("401")) {
          console.error("❌ Telegram: 401 Unauthorized (Invalid bot token). Stopping polling.");
          this.bot.stopPolling();
        } else {
          console.error("Telegram polling error:", error.message || error);
        }
      });

      // Register handlers
      this.registerHandlers();
      return true;
    } catch (error) {
      console.error("❌ Telegram: Connection failed:", error.message);
      return false;
    }
  }

  /**
   * Register message handlers
   */
  registerHandlers() {
    // /start command
    this.bot.onText(/\/start/, (msg) => {
      this.bot.sendMessage(msg.chat.id, getRandomGreeting(), { parse_mode: "Markdown" });
    });

    // /clear command
    this.bot.onText(/\/clear/, (msg) => {
      clearHistory("telegram", msg.chat.id);
      this.bot.sendMessage(msg.chat.id, "✨ Memory cleared! Fresh start. What's on your mind?");
    });

    // /help command
    this.bot.onText(/\/help/, (msg) => {
      const helpText = `✨ *Alya — Help*

I'm your private AI assistant. Just send me a message and I'll help.

*Commands:*
/start — Say hello
/clear — Clear our conversation history  
/help — Show this help message
/status — Check my systems

*Tips:*
• Just type naturally — I understand context
• I remember our conversation (use /clear to reset)
• I run 100% locally — your data stays with you 🔒

_Let's get to work._ ✨`;

      this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
    });

    // /status command
    this.bot.onText(/\/status/, async (msg) => {
      const groqOk = await this.llm.isAvailable();
      const status = `✨ *Alya Status*

🧠 Brain (Groq API): ${groqOk ? "✅ Online" : "❌ Offline"}
📡 Telegram: ✅ Connected
🔒 Privacy: 100% Local

_All systems operational._ ✨`;

      this.bot.sendMessage(msg.chat.id, status, { parse_mode: "Markdown" });
    });

    // Handle all other messages
    this.bot.on("message", async (msg) => {
      // Skip commands
      if (msg.text?.startsWith("/")) return;
      if (!msg.text) return;

      if (!this.processedMessageIds) this.processedMessageIds = new Set();
      if (this.processedMessageIds.has(msg.message_id)) return;
      this.processedMessageIds.add(msg.message_id);
      if (this.processedMessageIds.size > 200) this.processedMessageIds.clear();

      try {
        await this.handleMessage(msg);
      } catch (err) {
        console.error("Telegram critical handler error:", err);
      }
    });

    // Handle voice messages using Groq Whisper transcription
    this.bot.on("voice", async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await this.bot.sendChatAction(chatId, "record_audio");
        
        const tempDir = join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        // Download the voice file from Telegram
        const localPath = await this.bot.downloadFile(msg.voice.file_id, tempDir);
        
        // Transcribe using Groq Whisper
        const transcription = await this.llm.transcribeAudio(localPath);
        
        // Clean up temp file
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        
        if (!transcription || transcription.trim().length === 0) {
          await this.bot.sendMessage(chatId, "✨ I couldn't hear or understand the voice note. Could you try speaking louder or typing it?");
          return;
        }
        
        // Notify the user what was transcribed
        await this.bot.sendMessage(chatId, `🎤 *You (Voice):* _"${transcription}"_`, { parse_mode: "Markdown" });
        
        // Process as if it were a text message
        const fakeMsg = { ...msg, text: transcription };
        await this.handleMessage(fakeMsg);
      } catch (err) {
        console.error("Telegram voice transcription error:", err);
        await this.bot.sendMessage(chatId, "✨ Sorry, I had trouble processing that voice message.");
      }
    });
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const content = msg.text;

    // Send typing action
    try {
      await this.bot.sendChatAction(chatId, "typing");
    } catch (e) {
      console.warn("Telegram: Failed to send typing action");
    }

    // Get conversation history
    const history = getHistory("telegram", chatId);

    try {
      // Get LLM response
      const response = await this.llm.chat(history, content);

      // Store messages
      addMessage("telegram", chatId, "user", content);
      addMessage("telegram", chatId, "assistant", response);

      // Check for <voice> tag
      const voiceMatch = response.match(/<voice>([\s\S]*?)<\/voice>/i);
      // Check for <media> tag
      const mediaMatch = response.match(/<media>([\s\S]*?)<\/media>/i);

      let textToSend = response
        .replace(/<voice>[\s\S]*?<\/voice>/i, "")
        .replace(/<media>[\s\S]*?<\/media>/i, "")
        .trim();

      if (textToSend.length > 0) {
        // Split long messages (Telegram has 4096 char limit)
        if (textToSend.length > 4000) {
          const chunks = splitMessage(textToSend, 4000);
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" }).catch(() => {
              this.bot.sendMessage(chatId, chunk);
            });
          }
        } else {
          await this.bot.sendMessage(chatId, textToSend, { parse_mode: "Markdown" }).catch(() => {
            this.bot.sendMessage(chatId, textToSend);
          });
        }
      }

      // Send Media if requested
      if (mediaMatch) {
        const mediaSource = mediaMatch[1].trim();
        try {
          if (mediaSource.startsWith("http")) {
            await this.bot.sendPhoto(chatId, mediaSource);
          } else {
            await this.bot.sendPhoto(chatId, fs.createReadStream(mediaSource));
          }
        } catch (err) {
          console.error("Telegram media send error:", err);
          await this.bot.sendMessage(chatId, "*(System: Failed to send media. Check logs.)*");
        }
      }

      // Send Voice Note if requested
      if (voiceMatch) {
        const spokenText = voiceMatch[1].trim();
        const audioPath = await generateTTS(spokenText);

        if (audioPath) {
          await this.bot.sendVoice(chatId, fs.createReadStream(audioPath));
        } else {
          await this.bot.sendMessage(chatId, "*(System: Voice generation failed. Check ElevenLabs API keys.)*");
        }
      }
    } catch (error) {
      console.error("Telegram message error:", error);
      this.bot.sendMessage(chatId, "✨ Something went wrong. Try again.");
    }
  }

  /**
   * Get bridge status
   */
  getStatus() {
    return {
      platform: "telegram",
      connected: this.isReady,
      username: this.botInfo ? `@${this.botInfo.username}` : "Not connected",
    };
  }

  /**
   * Stop the bridge
   */
  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      this.isReady = false;
      console.log("✨ Telegram: Disconnected.");
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

    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt === -1) splitAt = maxLength;

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}
