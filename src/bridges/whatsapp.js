// ============================================================
// ✨ WhatsApp Bridge — whatsapp-web.js with QR auth
// ============================================================

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory } from "../core/memory.js";
import { SERVICE_CONNECT_MESSAGES } from "../core/personality.js";
import { generateTTS } from "../core/tts.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WhatsAppBridge {
  constructor(config) {
    this.config = config;
    this.llm = new LLMEngine();
    this.client = null;
    this.isReady = false;
    this.qrCallback = null;
  }

  async start() {
    try {
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: join(__dirname, "..", "..", "data", "whatsapp-auth") }),
        webVersionCache: {
          type: "remote",
          remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018925586-alpha.html",
        },
        puppeteer: { 
          headless: true, 
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === "linux" ? "/usr/bin/google-chrome" : undefined),
          args: [
            "--no-sandbox", 
            "--disable-setuid-sandbox", 
            "--disable-gpu", 
            "--disable-extensions", 
            "--disable-dev-shm-usage",
            "--no-zygote",
            "--single-process",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
          ] 
        },
      });

      this.client.on("qr", (qr) => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
        console.log("\n✨ WhatsApp: Scan this QR code with your phone!");
        console.log(`🔗 QR Link: ${qrUrl}\n`);
        qrcode.generate(qr, { small: true });
        this.lastQR = qr; // Expose for API
        if (this.qrCallback) this.qrCallback(qr);
      });

      this.client.on("ready", () => {
        this.isReady = true;
        console.log(`✨ WhatsApp: Connected! ${SERVICE_CONNECT_MESSAGES.whatsapp}`);
      });
      this.client.on("auth_failure", (msg) => { console.error("❌ WhatsApp auth failed:", msg); this.isReady = false; });
      this.client.on("disconnected", () => { this.isReady = false; });
      this.client.on("message", (msg) => this.handleMessage(msg));

      console.log("✨ WhatsApp: Initializing...");
      await this.client.initialize();
      return true;
    } catch (error) {
      console.error("❌ WhatsApp failed:", error.message);
      return false;
    }
  }

  async handleMessage(msg) {
    const chat = await msg.getChat();
    if (chat.isGroup || msg.isStatus) return;
    
    let content = (msg.body || "").trim();

    // Enforce "!alya" prefix
    if (!content.toLowerCase().startsWith("!alya")) return;
    
    // Strip the "!alya" prefix for processing
    content = content.slice(5).trim();

    // Check if message has a picture attached
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media && media.mimetype && media.mimetype.startsWith("image/")) {
        chat.sendStateTyping(); // Show typing while vision model thinks
        const description = await this.llm.analyzeImage(media.data, media.mimetype);
        content = `[User attached an image. Optic Nerve description: ${description}]\n\nUser message: ${content}`;
      }
    }

    if (!content) {
      await msg.reply("✨ At your service! Type `!alya help` to see what I can do.");
      return;
    }

    const chatId = msg.from;

    if (content.toLowerCase() === "clear") { clearHistory("whatsapp", chatId); await msg.reply("✨ Memory cleared!"); return; }
    if (content.toLowerCase() === "help") { await msg.reply("✨ *Alya*\nCommands:\n- !alya <your message>\n- !alya clear\n- !alya status"); return; }
    if (content.toLowerCase() === "status") { 
      const groqOk = await this.llm.isAvailable();
      await msg.reply(`✨ *Alya Status*\n\n🧠 Brain (Groq API): ${groqOk ? "✅ Online" : "❌ Offline"}\n📡 WhatsApp: ✅ Connected\n🔒 Privacy: 100% Local`); 
      return; 
    }

    chat.sendStateTyping();
    const history = getHistory("whatsapp", chatId);
    try {
      const response = await this.llm.chat(history, content);
      addMessage("whatsapp", chatId, "user", content);
      addMessage("whatsapp", chatId, "assistant", response);

      // Check for <voice> tag
      const voiceMatch = response.match(/<voice>([\s\S]*?)<\/voice>/i);
      // Check for <media> tag
      const mediaMatch = response.match(/<media>([\s\S]*?)<\/media>/i);
      
      let textToSend = response
        .replace(/<voice>[\s\S]*?<\/voice>/i, "")
        .replace(/<media>[\s\S]*?<\/media>/i, "")
        .trim();

      if (textToSend.length > 0) {
        await chat.sendMessage(textToSend);
      }

      // Send Media if requested
      if (mediaMatch) {
        const mediaSource = mediaMatch[1].trim();
        try {
          let media;
          if (mediaSource.startsWith("http")) {
            media = await MessageMedia.fromUrl(mediaSource);
          } else {
            media = MessageMedia.fromFilePath(mediaSource);
          }
          await chat.sendMessage(media);
        } catch (err) {
          console.error("WhatsApp media send error:", err);
          await chat.sendMessage("*(System: Failed to send media. Check logs.)*");
        }
      }

      // Send Voice Note if requested
      if (voiceMatch) {
        const spokenText = voiceMatch[1].trim();
        const audioPath = await generateTTS(spokenText);
        
        if (audioPath) {
          const media = MessageMedia.fromFilePath(audioPath);
          await chat.sendMessage(media, { sendAudioAsVoice: true });
        } else {
          await chat.sendMessage("*(System: ElevenLabs API key is missing or invalid. Voice generation failed.)*");
        }
      }
    } catch (error) {
      await msg.reply("✨ Something went wrong. Try again.");
    }
    chat.clearState();
  }

  onQR(callback) { this.qrCallback = callback; }
  getStatus() { return { platform: "whatsapp", connected: this.isReady }; }
  async stop() { if (this.client) { await this.client.destroy(); this.isReady = false; } }
}
