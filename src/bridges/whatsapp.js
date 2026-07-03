// ============================================================
// ✨ WhatsApp Bridge — whatsapp-web.js with QR auth
// ============================================================

import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory } from "../core/memory.js";
import { SERVICE_CONNECT_MESSAGES } from "../core/personality.js";
import { generateTTS } from "../core/tts.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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
    if (this.config.useCloudAPI) {
      console.log("✨ WhatsApp: Configured for WhatsApp Business Cloud API.");
      this.isReady = true;
      return true;
    }

    console.warn("⚠️ WhatsApp Web (Puppeteer client) is BLOCKED. You must enable 'useCloudAPI': true in config.json to run WhatsApp.");
    this.isReady = false;
    return false;
  }

  async handleMessage(msg) {
    const chat = await msg.getChat();
    if (chat.isGroup || msg.isStatus) return;
    
    let content = (msg.body || "").trim();

    // Enforce "!alisa" prefix
    if (!content.toLowerCase().startsWith("!alisa")) return;
    
    // Strip the "!alisa" prefix for processing
    content = content.slice(6).trim();

    // Check if message has a media file attached
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media && media.mimetype) {
        if (media.mimetype.startsWith("image/")) {
          chat.sendStateTyping(); // Show typing while vision model thinks
          const description = await this.llm.analyzeImage(media.data, media.mimetype);
          content = `[User attached an image. Optic Nerve description: ${description}]\n\nUser message: ${content}`;
        } else if (media.mimetype.startsWith("audio/")) {
          chat.sendStateTyping();
          // Write voice message to a temp file
          const tempDir = join(process.cwd(), "data", "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const tempFilePath = join(tempDir, `wa_voice_${Date.now()}.ogg`);
          fs.writeFileSync(tempFilePath, Buffer.from(media.data, "base64"));
          
          const transcription = await this.llm.transcribeAudio(tempFilePath);
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          
          if (transcription && transcription.trim().length > 0) {
            content = transcription;
            // Send back what was heard
            await chat.sendMessage(`🎤 *You (Voice):* _"${transcription}"_`);
          } else {
            await msg.reply("✨ I heard a voice message but couldn't transcribe it.");
            return;
          }
        }
      }
    }

    if (!content) {
      await msg.reply("✨ At your service! Type `!alisa help` to see what I can do.");
      return;
    }

    const chatId = msg.from;

    if (content.toLowerCase() === "clear") { clearHistory("whatsapp", chatId); await msg.reply("✨ Memory cleared!"); return; }
    if (content.toLowerCase() === "help") { await msg.reply("✨ *Alisa*\nCommands:\n- !alisa <your message>\n- !alisa clear\n- !alisa status"); return; }
    if (content.toLowerCase() === "status") { 
      const groqOk = await this.llm.isAvailable();
      await msg.reply(`✨ *Alisa Status*\n\n🧠 Brain (Groq API): ${groqOk ? "✅ Online" : "❌ Offline"}\n📡 WhatsApp: ✅ Connected\n🔒 Privacy: 100% Local`); 
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
  async stop() { 
    if (this.config.useCloudAPI) {
      this.isReady = false;
      return;
    }
    if (this.client) { 
      await this.client.destroy(); 
      this.isReady = false; 
    } 
  }

  async sendCloudTextMessage(to, text) {
    const phoneNumberId = this.config.phoneNumberId;
    const accessToken = this.config.accessToken;
    
    if (!phoneNumberId || !accessToken) {
      console.error("❌ WhatsApp Cloud API: phoneNumberId or accessToken is missing in config!");
      return false;
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "text",
          text: {
            body: text
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("❌ WhatsApp Cloud API send failed:", data);
        return false;
      }
      return true;
    } catch (err) {
      console.error("❌ WhatsApp Cloud API send error:", err.message);
      return false;
    }
  }

  async handleCloudMessage(from, body, contactName) {
    console.log(`📩 WhatsApp Cloud: Message from ${contactName} (${from}): ${body}`);
    const sessionId = `whatsapp_${from}`;

    // Get chat history
    const history = getHistory("whatsapp", sessionId);
    
    // Add user message
    addMessage("whatsapp", sessionId, "user", body);
    history.push({ role: "user", content: body });

    // Generate AI response
    try {
      const response = await this.llm.chat(history, body);
      
      // Add assistant message to history
      addMessage("whatsapp", sessionId, "assistant", response);

      // Clean <voice> and <media> tags
      let cleanResponse = response;
      const voiceMatch = response.match(/<voice>([\s\S]*?)<\/voice>/i);
      
      cleanResponse = cleanResponse
        .replace(/<voice>[\s\S]*?<\/voice>/gi, "")
        .replace(/<media>[\s\S]*?<\/media>/gi, "")
        .trim();
        
      if (!cleanResponse && voiceMatch) {
        cleanResponse = voiceMatch[1].trim();
      }

      // Send via Cloud API
      await this.sendCloudTextMessage(from, cleanResponse);
    } catch (err) {
      console.error("❌ WhatsApp Cloud response generation failed:", err.message);
      await this.sendCloudTextMessage(from, "⚠️ Sorry, I encountered a temporary error processing that.");
    }
  }
}
