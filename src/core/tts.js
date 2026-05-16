import fs from "fs";
import path from "path";
import { loadConfig } from "./config.js";

// Global state to track which ElevenLabs key we are currently using
let currentElevenLabsKeyIndex = 0;
let triedKeys = new Set();

/**
 * Generates an MP3 file from text using ElevenLabs API with multi-key failover.
 */
export async function generateTTS(text) {
  const config = loadConfig();
  const keys = config.elevenlabs?.apiKeys?.filter(k => k && !k.includes("PASTE")) || [];
  
  if (!config.elevenlabs?.enabled || keys.length === 0) {
    console.warn("⚠️ ElevenLabs is not configured or keys are invalid. Falling back to text.");
    return null;
  }

  const apiKey = keys[currentElevenLabsKeyIndex];
  const voiceId = config.elevenlabs.voiceId || "EXAVITQu4vr4xnSDxMaL"; // Default: Bella
  
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
      if (response.status === 401 || response.status === 429) {
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
        console.error("❌ All ElevenLabs API keys have exhausted their 10,000 character limit!");
        triedKeys.clear(); // Reset for next time
        return null;
      }
    }
    
    console.error("❌ TTS Generation failed:", error.message);
    return null;
  }
}
