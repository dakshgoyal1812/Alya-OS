// ============================================================
// 🧠 LLM Engine — Ollama Integration
// Handles all communication with the local Ollama instance
// ============================================================

import { getSystemPrompt, getErrorMessage } from "./personality.js";
import { loadConfig } from "./config.js";
import { availableTools, executeTool } from "./tools.js";
import OpenAI from "openai";

export class LLMEngine {
  constructor() {
    const config = loadConfig();
    
    // Support multiple API keys for failover
    this.apiKeys = config.groq?.apiKeys?.filter(k => k && !k.startsWith("PASTE_YOUR")) || [];
    // Fallback to single apiKey if apiKeys array is empty
    if (this.apiKeys.length === 0 && config.groq?.apiKey && !config.groq.apiKey.startsWith("PASTE_YOUR")) {
      this.apiKeys = [config.groq.apiKey];
    }
    
    this.currentKeyIndex = 0;
    this.model = config.groq?.model || "llama-3.3-70b-versatile";
    this.temperature = 0.7;
    
    // Initialize OpenAI client with the first key
    this._initClient();
    console.log(`🔑 Groq API: ${this.apiKeys.length} key(s) loaded (failover ${this.apiKeys.length > 1 ? 'enabled' : 'disabled'})`);
  }

  /**
   * Initialize or re-initialize the OpenAI client with the current key
   */
  _initClient() {
    this.openai = new OpenAI({
      apiKey: this.apiKeys[this.currentKeyIndex] || "missing-key",
      baseURL: "https://api.groq.com/openai/v1"
    });
  }

  /**
   * Switch to the next available API key
   * Returns true if switched successfully, false if no more keys
   */
  _switchToNextKey() {
    if (this.apiKeys.length <= 1) return false;
    
    // Track which keys we've tried in this failure cycle
    if (!this._triedKeys) this._triedKeys = new Set();
    this._triedKeys.add(this.currentKeyIndex);
    
    // Find the next untried key
    for (let i = 1; i < this.apiKeys.length; i++) {
      const nextIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      if (!this._triedKeys.has(nextIndex)) {
        this.currentKeyIndex = nextIndex;
        const keyPreview = this.apiKeys[this.currentKeyIndex].slice(-6);
        console.log(`🔄 Switching to Groq API key #${this.currentKeyIndex + 1} (***${keyPreview}) [${this._triedKeys.size}/${this.apiKeys.length} keys tried]`);
        this._initClient();
        return true;
      }
    }
    
    // All keys have been tried
    console.error(`❌ All ${this.apiKeys.length} API keys exhausted! No more backup keys available.`);
    this._triedKeys = null; // Reset for next cycle
    return false;
  }

  /**
   * Reset the tried-keys tracker (call this after a successful API call)
   */
  _resetKeyTracker() {
    this._triedKeys = null;
  }

  /**
   * Check if an error is a quota/rate-limit error that should trigger key rotation
   */
  _isQuotaError(error) {
    const status = error?.status || error?.response?.status;
    const msg = (error?.message || "").toLowerCase();
    return (
      status === 429 ||
      status === 503 ||
      status === 401 ||
      status === 403 ||
      msg.includes("rate_limit") ||
      msg.includes("quota") ||
      msg.includes("tokens per minute") ||
      msg.includes("requests per minute") ||
      msg.includes("resource_exhausted")
    );
  }

  async isAvailable() {
    return this.apiKeys.length > 0;
  }

  async listModels() {
    return [{name: "llama-3.3-70b-versatile"}, {name: "llama-3.1-8b-instant"}];
  }

  async chat(conversationHistory = [], userMessage) {
    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name })
    }));
    
    const messages = [
      { role: "system", content: getSystemPrompt("normal") },
      ...sanitizedHistory.slice(-20),
      { role: "user", content: userMessage },
    ];
    return await this._processChat(messages);
  }

  async _processChat(messages, depth = 0) {
    if (depth > 5) return "✨ ...I'm thinking too much. Let's stop here.";

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: availableTools,
        temperature: this.temperature,
      });

      const msg = response.choices[0].message;
      this._resetKeyTracker(); // Success — reset key tracker

      // Handle JSON tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg); // Add assistant's tool call message
        
        for (const tc of msg.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch (e) {
            console.warn("⚠️ Failed to parse tool arguments:", tc.function.arguments);
            args = {};
          }
          const result = await executeTool(tc.function.name, args);
          messages.push({ tool_call_id: tc.id, role: "tool", content: result });
        }
        
        return await this._processChat(messages, depth + 1);
      }

      // Handle raw XML leaks from Llama 3
      const rawContent = msg.content || "";
      const rawToolMatch = rawContent.match(/<function=([^>]+)>(.*?)<\/function>/);
      if (rawToolMatch) {
         const toolName = rawToolMatch[1].trim();
         let args = {};
         try { args = JSON.parse(rawToolMatch[2] || "{}"); } catch(e) {}
         messages.push(msg);
         const result = await executeTool(toolName, args);
         messages.push({ role: "user", content: `[System Tool Result: ${result}]\nNow finish your answer.` });
         return await this._processChat(messages, depth + 1);
      }

      return cleanResponse(msg.content) || getErrorMessage("llm_error");
    } catch (error) {
      const errMsg = error?.message || String(error);
      const errStatus = error?.status || error?.response?.status || 'N/A';
      console.error(`Groq chat error [status=${errStatus}]: ${errMsg}`);

      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit on key ${this.currentKeyIndex}. Retrying with backup key...`);
        return await this._processChat(messages, depth);
      }
      
      // Handle Groq's strict tool validation crash
      if (error.status === 400 && errMsg.includes("Failed to call a function")) {
        console.warn("⚠️ Groq tool parser failed. Auto-recovering without tools...");
        try {
          const fallbackResponse = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            temperature: this.temperature,
          });
          return cleanResponse(fallbackResponse.choices[0].message.content) || getErrorMessage("llm_error");
        } catch (fallbackError) {
           console.error("Groq fallback error:", fallbackError.message);
        }
      }

      // Retry transient network errors (timeouts, connection resets, DNS failures)
      if (!this._retryCount) this._retryCount = 0;
      const isTransient = !error.status || error.status >= 500 || errMsg.includes("fetch") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET") || errMsg.includes("socket") || errMsg.includes("network") || errMsg.includes("abort");
      if (isTransient && this._retryCount < 3) {
        this._retryCount++;
        console.warn(`🔄 Transient error. Retrying attempt ${this._retryCount}/3 in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return await this._processChat(messages, depth);
      }
      this._retryCount = 0;

      return getErrorMessage("llm_error");
    }
  }

  async chatStream(conversationHistory = [], userMessage, onChunk) {
    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name })
    }));

    const messages = [
      { role: "system", content: getSystemPrompt("normal") },
      ...sanitizedHistory.slice(-20),
      { role: "user", content: userMessage },
    ];
    return await this._processChatStream(messages, onChunk);
  }

  async _processChatStream(messages, onChunk, depth = 0) {
    if (depth > 5) return "✨ ...I got stuck in a loop.";

    try {
      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: availableTools,
        temperature: this.temperature,
        stream: true,
      });

      let fullResponse = "";
      let toolCallsMap = {};
      this._resetKeyTracker(); // Stream started successfully — reset key tracker
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullResponse += delta.content;
          if (onChunk) onChunk(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsMap[tc.index]) {
              toolCallsMap[tc.index] = {
                id: tc.id,
                type: "function",
                function: { name: tc.function.name, arguments: "" }
              };
            }
            if (tc.function?.arguments) {
              toolCallsMap[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }

      const toolCalls = Object.values(toolCallsMap);

      if (toolCalls.length > 0) {
        if (onChunk) onChunk("\n✨ *Right away, Master. Working on it...*\n");
        
        messages.push({ role: "assistant", content: fullResponse || null, tool_calls: toolCalls });

        for (const tc of toolCalls) {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch (e) {}
          const result = await executeTool(tc.function.name, args);
          messages.push({ tool_call_id: tc.id, role: "tool", content: result });
        }
        
        return await this._processChatStream(messages, onChunk, depth + 1);
      }

      // Handle raw XML leaks from Llama 3
      const rawToolMatch = fullResponse.match(/<function=([^>]+)>(.*?)<\/function>/);
      if (rawToolMatch) {
         const toolName = rawToolMatch[1].trim();
         let args = {};
         try { args = JSON.parse(rawToolMatch[2] || "{}"); } catch(e) {}
         
         if (onChunk) onChunk("\n✨ *Right away, Master. Working on it...*\n");
         messages.push({ role: "assistant", content: fullResponse });
         const result = await executeTool(toolName, args);
         messages.push({ role: "user", content: `[System Tool Result: ${result}]\nNow finish your answer.` });
         return await this._processChatStream(messages, onChunk, depth + 1);
      }

      return cleanResponse(fullResponse) || getErrorMessage("llm_error");
    } catch (error) {
      const errMsg = error?.message || String(error);
      const errStatus = error?.status || error?.response?.status || 'N/A';
      console.error(`Groq stream error [status=${errStatus}]: ${errMsg}`);

      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit on key ${this.currentKeyIndex}. Retrying stream with backup key...`);
        return await this._processChatStream(messages, onChunk, depth);
      }

      // Handle Groq's strict tool validation crash in streams
      if (error.status === 400) {
        console.warn("⚠️ Groq tool parser failed in stream. Auto-recovering without tools...");
        try {
          const fallbackStream = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            temperature: this.temperature,
            stream: true,
          });
          let fullFallback = "";
          for await (const chunk of fallbackStream) {
            const delta = chunk.choices[0]?.delta;
            if (delta && delta.content) {
              fullFallback += delta.content;
              if (onChunk) onChunk(delta.content);
            }
          }
          return cleanResponse(fullFallback) || getErrorMessage("llm_error");
        } catch (fallbackError) {
          console.error("Groq stream fallback error:", fallbackError.message);
        }
      }

      // Retry transient network errors
      if (!this._streamRetryCount) this._streamRetryCount = 0;
      const isTransient = !error.status || error.status >= 500 || errMsg.includes("fetch") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET") || errMsg.includes("socket") || errMsg.includes("network") || errMsg.includes("abort");
      if (isTransient && this._streamRetryCount < 3) {
        this._streamRetryCount++;
        console.warn(`🔄 Stream transient error. Retrying attempt ${this._streamRetryCount}/3 in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return await this._processChatStream(messages, onChunk, depth);
      }
      this._streamRetryCount = 0;

      return getErrorMessage("llm_error");
    }
  }

  async generate(prompt) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "system", content: getSystemPrompt("normal") }, { role: "user", content: prompt }],
      });
      this._resetKeyTracker(); // Success — reset key tracker
      return cleanResponse(response.choices[0].message.content) || getErrorMessage("llm_error");
    } catch (error) {
      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit. Retrying generate with backup key...`);
        return await this.generate(prompt);
      }
      return getErrorMessage("llm_error");
    }
  }

  async analyzeImage(base64Data, mimeType = "image/jpeg") {
    try {
      const response = await this.openai.chat.completions.create({
        model: "llama-3.2-11b-vision-preview", // Use Groq's dedicated vision model
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image in detail. What is happening? Are there any text, objects, or people?" },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ]
          }
        ],
        temperature: 0.2,
        max_tokens: 1024
      });
      this._resetKeyTracker();
      return response.choices[0].message.content;
    } catch (error) {
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit during Vision task. Retrying...`);
        return await this.analyzeImage(base64Data, mimeType);
      }
      console.error("Groq vision error:", error.message);
      return "I could not process the image clearly due to a system error.";
    }
  }
}

/**
 * Removes leaked Llama 3 internal tags and raw function codes from the final output
 */
function cleanResponse(text) {
  if (!text) return "";
  let clean = text;
  // Strip <function=...>...</function> or unclosed <function...>
  clean = clean.replace(/<function[^>]*>[\s\S]*?(?:<\/function>|$)/gi, "");
  // Strip <tool_call>...</tool_call>
  clean = clean.replace(/<tool_call[^>]*>[\s\S]*?(?:<\/tool_call>|$)/gi, "");
  // Strip Llama 3 special tokens like <|eot_id|>
  clean = clean.replace(/<\|[a-zA-Z0-9_]+\|>/g, "");
  return clean.trim();
}
