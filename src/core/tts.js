import fs from "fs";
import path from "path";
import { loadConfig } from "./config.js";
import * as googleTTS from "google-tts-api";

// Global state to track which ElevenLabs key we are currently using
let currentElevenLabsKeyIndex = 0;
let triedKeys = new Set();

/**
 * Generates an MP3 file from text using Google TTS as a fallback.
 */
async function generateGoogleTTS(text) {
  try {
    // Basic language detection: if the text contains Devanagari characters, use Hindi ('hi')
    const hasHindi = /[\u0900-\u097F]/.test(text);
    const lang = hasHindi ? "hi" : "en";

    const audioItems = await googleTTS.getAllAudioBase64(text, {
      lang: lang,
      slow: false,
      host: "https://translate.google.com",
      splitPunct: ",.?"
    });
    
    const buffers = audioItems.map(item => Buffer.from(item.base64, "base64"));
    const finalBuffer = Buffer.concat(buffers);
    
    const tempDir = path.join(process.cwd(), "data", "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const filePath = path.join(tempDir, `voice_fallback_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, finalBuffer);
    
    return filePath;
  } catch (err) {
    console.error("❌ Google TTS Fallback Generation failed:", err.message);
    return null;
  }
}

/**
 * Generates an MP3 file from text using ElevenLabs API with multi-key failover.
 */
export async function generateTTS(text, voiceIdOverride = null) {
  const config = loadConfig();
  const keys = config.elevenlabs?.apiKeys?.filter(k => k && !k.includes("PASTE")) || [];
  
  if (!config.elevenlabs?.enabled || keys.length === 0) {
    console.warn("⚠️ ElevenLabs is not configured or keys are invalid. Falling back to Google TTS.");
    return await generateGoogleTTS(text);
  }

  const apiKey = keys[currentElevenLabsKeyIndex];
  const voiceId = voiceIdOverride || config.elevenlabs.voiceId || "9BWtsMINHqgu8Vj69vS2"; // Default: Aria (Soft & Gentle)
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 429 || response.status === 403) {
        throw new Error(`QuotaExceeded`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    // Success! Clear the tried keys
    triedKeys.clear();

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const tempDir = path.join(process.cwd(), "data", "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const filePath = path.join(tempDir, `voice_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  } catch (error) {
    if (error.message === "QuotaExceeded") {
      triedKeys.add(currentElevenLabsKeyIndex);
      if (triedKeys.size < keys.length) {
        currentElevenLabsKeyIndex = (currentElevenLabsKeyIndex + 1) % keys.length;
        const keyPreview = keys[currentElevenLabsKeyIndex].slice(-5);
        console.warn(`⚠️ ElevenLabs Quota Hit! 🔄 Rotating to Key #${currentElevenLabsKeyIndex + 1} (***${keyPreview})`);
        return await generateTTS(text); // Retry with new key
      } else {
        console.error("❌ All ElevenLabs API keys have exhausted their 10,000 character limit! Falling back to Google TTS.");
        triedKeys.clear(); // Reset for next time
        return await generateGoogleTTS(text);
      }
    }
    
    console.error("❌ TTS Generation failed:", error.message);
    console.warn("Falling back to Google TTS.");
    return await generateGoogleTTS(text);
  }
}
