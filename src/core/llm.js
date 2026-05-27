// ============================================================
// 🧠 LLM Engine — Groq Cloud Integration
// Handles all communication with Groq API with smart limits
// ============================================================

import { getSystemPrompt, getErrorMessage } from "./personality.js";
import { loadConfig } from "./config.js";
import { availableTools, executeTool } from "./tools.js";
import OpenAI from "openai";
import fs from "fs";
import { join } from "path";

// Import Advanced AI features
import { ModelRouter, MODEL_DIRECTORY } from "./router.js";
import { ThinkingEngine } from "./reflection.js";
import { AgentSwarm } from "./swarm.js";
import { AdvancedMemoryEngine } from "./advanced_memory.js";

// --- Token & Context Constants ---
const MAX_RESPONSE_TOKENS = 4096;
const MAX_CONTEXT_TOKENS = 28000; // Safe limit for llama-3.3-70b (32k context)
const FALLBACK_MODEL = "llama-3.1-8b-instant";
const API_TIMEOUT_MS = 60000; // 60 seconds
const MAX_HISTORY_MESSAGES = 10; // Keep history lean for heavy tasks

/**
 * Rough token estimator (~4 chars per token for English, ~3 for mixed)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Trim messages array to fit within token budget
 */
function trimMessagesToFit(messages, maxTokens) {
  // Always keep the system message (first) and user message (last)
  if (messages.length <= 2) return messages;

  const systemMsg = messages[0];
  const userMsg = messages[messages.length - 1];
  const middleMessages = messages.slice(1, -1);

  let totalTokens = estimateTokens(systemMsg.content) + estimateTokens(userMsg.content);
  // Reserve tokens for tools definition overhead (~2000 tokens)
  totalTokens += 2000;

  const kept = [];
  // Keep messages from most recent to oldest
  for (let i = middleMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(middleMessages[i].content);
    if (totalTokens + msgTokens > maxTokens) break;
    totalTokens += msgTokens;
    kept.unshift(middleMessages[i]);
  }

  return [systemMsg, ...kept, userMsg];
}

/**
 * Robust JSON extraction helper to capture text-leaked tool calls from Llama models.
 * Counts braces to extract complete nested JSON blocks containing "tool" or "function".
 * Supports fallback parsing for unquoted keys/trailing commas.
 */
function extractJSONBlock(text) {
  if (!text) return null;
  const startIdx = text.search(/\{\s*"(?:tool|function)"\s*:/) !== -1 ? 
    text.search(/\{\s*"(?:tool|function)"\s*:/) : 
    text.search(/\{\s*(?:tool|function)\s*:/);
  
  if (startIdx === -1) return null;

  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') braceCount++;
    else if (text[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;

  const jsonStr = text.substring(startIdx, endIdx + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    const toolName = parsed.tool || parsed.function;
    if (toolName) {
      return {
        fullMatch: jsonStr,
        tool: toolName,
        args: parsed.args || parsed.arguments || {}
      };
    }
  } catch (e) {
    try {
      const parsed = new Function(`return ${jsonStr}`)();
      const toolName = parsed.tool || parsed.function;
      if (toolName) {
        return {
          fullMatch: jsonStr,
          tool: toolName,
          args: parsed.args || parsed.arguments || {}
        };
      }
    } catch (e2) {}
  }
  return null;
}

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
    this.fallbackModel = FALLBACK_MODEL;
    this.temperature = 0.7;
    this.maxTokens = MAX_RESPONSE_TOKENS;
    
    // Initialize OpenAI client with the first key
    this._initClient();
    console.log(`🔑 Groq API: ${this.apiKeys.length} key(s) loaded (failover ${this.apiKeys.length > 1 ? 'enabled' : 'disabled'})`);

    // Instantiate Advanced Upgrades
    this.router = new ModelRouter();
    this.reflector = new ThinkingEngine(this);
    this.swarm = new AgentSwarm(this);
    this.cognitiveMemory = new AdvancedMemoryEngine();
    this.mood = "normal";
    this.customLore = "";
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

  _getSystemPromptText() {
    let promptText = getSystemPrompt(this.mood || "normal");
    
    // Inject Second Brain (Life OS) memory context dynamically
    try {
      const file = join(process.cwd(), "data", "life_os.json");
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        const openTasks = data.tasks.filter(t => !t.completed).map(t => `- ${t.text}`).join("\n");
        const openGoals = data.goals.map(g => `- ${g.text}`).join("\n");
        
        promptText += `\n\n## USER'S SECOND BRAIN & LIFE OS CONTEXT:
Active Goals:
${openGoals || "None"}

Pending Tasks:
${openTasks || "None"}

Personal Notes:
${data.notes || "None"}

User Level: ${data.level} (Streak: ${data.streak} Days)`;
      }
    } catch (e) {}

    if (this.customLore) {
      promptText += `\n\n## CUSTOM USER PERSONALITY LORE:\n${this.customLore}`;
    }
    return promptText;
  }

  async chat(conversationHistory = [], userMessage) {
    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name })
    }));
    
    let messages = [
      { role: "system", content: this._getSystemPromptText() },
      ...sanitizedHistory.slice(-MAX_HISTORY_MESSAGES),
      { role: "user", content: userMessage },
    ];
    // Smart trim to fit context window
    messages = trimMessagesToFit(messages, MAX_CONTEXT_TOKENS);
    return await this._processChat(messages);
  }

  async _processChat(messages, depth = 0, useFallback = false) {
    if (depth > 5) return "✨ ...I'm thinking too much. Let's stop here.";

    const model = useFallback ? this.fallbackModel : this.model;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        tools: availableTools,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }, { signal: controller.signal });

      clearTimeout(timeout);

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

      // Handle Markdown JSON/JS tool leaks (unquoted keys, missing braces, trailing commas)
      const leakedTool = extractJSONBlock(rawContent);
      if (leakedTool) {
         const toolName = leakedTool.tool.trim();
         const args = leakedTool.args;
         messages.push(msg);
         const result = await executeTool(toolName, args);
         messages.push({ role: "user", content: `[System Tool Result: ${result}]\nNow finish your answer.` });
         return await this._processChat(messages, depth + 1);
      }

      return cleanResponse(msg.content) || getErrorMessage("llm_error");
    } catch (error) {
      const errMsg = error?.message || String(error);
      const errStatus = error?.status || error?.response?.status || 'N/A';
      console.error(`Groq chat error [model=${model}, status=${errStatus}]: ${errMsg}`);

      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit on key ${this.currentKeyIndex}. Retrying with backup key...`);
        return await this._processChat(messages, depth, useFallback);
      }

      // Auto-fallback to smaller model on token/context overflow or heavy-task failures
      if (!useFallback && (errMsg.includes("token") || errMsg.includes("context_length") || errMsg.includes("too many tokens") || errMsg.includes("maximum context") || error.status === 413)) {
        console.warn(`⚠️ Token overflow on ${this.model}. Falling back to ${this.fallbackModel}...`);
        // Also aggressively trim history for the fallback
        const trimmedMessages = trimMessagesToFit(messages, 6000);
        return await this._processChat(trimmedMessages, depth, true);
      }
      
      // Handle Groq's strict tool validation crash
      if (error.status === 400 && errMsg.includes("Failed to call a function")) {
        console.warn("⚠️ Groq tool parser failed. Auto-recovering without tools...");
        try {
          const fallbackResponse = await this.openai.chat.completions.create({
            model,
            messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
          });
          return cleanResponse(fallbackResponse.choices[0].message.content) || getErrorMessage("llm_error");
        } catch (fallbackError) {
           console.error("Groq fallback error:", fallbackError.message);
        }
      }

      // If primary model fails for any 400 error on heavy tasks, try fallback model
      if (!useFallback && error.status === 400) {
        console.warn(`⚠️ Primary model failed (400). Trying fallback model ${this.fallbackModel}...`);
        return await this._processChat(messages, depth, true);
      }

      // Retry transient network errors (timeouts, connection resets, DNS failures)
      if (!this._retryCount) this._retryCount = 0;
      const isTransient = !error.status || error.status >= 500 || errMsg.includes("fetch") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET") || errMsg.includes("socket") || errMsg.includes("network") || errMsg.includes("abort");
      if (isTransient && this._retryCount < 3) {
        this._retryCount++;
        console.warn(`🔄 Transient error. Retrying attempt ${this._retryCount}/3 in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return await this._processChat(messages, depth, useFallback);
      }
      this._retryCount = 0;

      // Return a more helpful error message based on what happened
      if (this._isQuotaError(error)) return getErrorMessage("rate_limit");
      return getErrorMessage("llm_error");
    }
  }

  async chatStream(conversationHistory = [], userMessage, onChunk, options = {}) {
    // Record interaction in cognitive memory
    this.cognitiveMemory.recordInteraction(userMessage);

    // Simple sentiment tracking
    const lowerMessage = userMessage.toLowerCase();
    let frust = 0, stress = 0, exc = 0, conf = 0;
    if (lowerMessage.includes("stupid") || lowerMessage.includes("useless") || lowerMessage.includes("hate") || lowerMessage.includes("bug")) frust = 0.3;
    if (lowerMessage.includes("urgent") || lowerMessage.includes("help") || lowerMessage.includes("immediately")) stress = 0.2;
    if (lowerMessage.includes("amazing") || lowerMessage.includes("wow") || lowerMessage.includes("cool") || lowerMessage.includes("love")) exc = 0.4;
    if (lowerMessage.includes("why") || lowerMessage.includes("what does") || lowerMessage.includes("how does")) conf = 0.1;
    this.cognitiveMemory.updateEmotionalState(frust, stress, exc, conf);

    const emotionalGuidelines = this.cognitiveMemory.getEmotionalToneGuidelines();

    // Swarm Mode
    if (options.swarmMode) {
      if (onChunk) onChunk("🐝 **[Swarm Mode: Multi-Agent Collaboration Active]**\nPlanner, Researcher, Coder, Designer, and Security agents assemble!\n");
      const swarmResult = await this.swarm.executeSwarm(userMessage, (step) => {
        if (onChunk) {
          onChunk(`\n🤖 **[${step.agent}]**: *${step.content}*\n`);
        }
      });
      return swarmResult;
    }

    // Reflection Mode
    if (options.thinkingMode === "reflection") {
      return this.reflector.runReflection(conversationHistory, userMessage, onChunk);
    }
    if (options.thinkingMode === "tree") {
      return this.reflector.runTreeOfThoughts(conversationHistory, userMessage, onChunk);
    }

    // Router selection
    const activeModelKey = this.router.route(userMessage, options.routingMode || "intelligence");
    const activeModel = MODEL_DIRECTORY[activeModelKey]?.name || this.model;

    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name })
    }));

    // Inject sentiment guidelines
    let systemPromptText = this._getSystemPromptText() + "\n" + emotionalGuidelines;
    if (options && options.recalledFacts && options.recalledFacts.length > 0) {
      systemPromptText += "\n\n## RECALLED LONG-TERM MEMORY FACTS:\n" + options.recalledFacts.map(f => `- ${f}`).join("\n");
    }

    let messages = [
      { role: "system", content: systemPromptText },
      ...sanitizedHistory.slice(-MAX_HISTORY_MESSAGES),
      { role: "user", content: userMessage },
    ];
    // Smart trim to fit context window
    messages = trimMessagesToFit(messages, MAX_CONTEXT_TOKENS);

    const originalModel = this.model;
    this.model = activeModel;

    const startTime = Date.now();
    try {
      if (onChunk) onChunk(`🧠 *[Routing task to: ${activeModelKey} (${activeModel})]*\n\n`);
      const result = await this._processChatStream(messages, onChunk);
      const latency = Date.now() - startTime;
      this.router.recordBenchmark(activeModelKey, latency, estimateTokens(result));
      this.model = originalModel;
      return result;
    } catch (err) {
      this.model = originalModel;
      throw err;
    }
  }

  async _processChatStream(messages, onChunk, depth = 0, useFallback = false) {
    if (depth > 5) return "✨ ...I got stuck in a loop.";

    const model = useFallback ? this.fallbackModel : this.model;

    try {
      const stream = await this.openai.chat.completions.create({
        model,
        messages,
        tools: availableTools,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
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
        
        return await this._processChatStream(messages, onChunk, depth + 1, useFallback);
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
         return await this._processChatStream(messages, onChunk, depth + 1, useFallback);
      }

      // Handle Markdown JSON tool leaks
      const jsonToolMatch = fullResponse.match(/```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\})\s*```/) || fullResponse.match(/^(\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\})$/m);
      if (jsonToolMatch) {
         const toolName = jsonToolMatch[2].trim();
         let args = {};
         try { 
           args = JSON.parse(jsonToolMatch[1]); 
           delete args.tool; 
         } catch(e) {}
         
         if (onChunk) onChunk("\n✨ *Right away, Master. Working on it...*\n");
         messages.push({ role: "assistant", content: fullResponse });
         const result = await executeTool(toolName, args);
         messages.push({ role: "user", content: `[System Tool Result: ${result}]\nNow finish your answer.` });
         return await this._processChatStream(messages, onChunk, depth + 1, useFallback);
      }

      return cleanResponse(fullResponse) || getErrorMessage("llm_error");
    } catch (error) {
      const errMsg = error?.message || String(error);
      const errStatus = error?.status || error?.response?.status || 'N/A';
      console.error(`Groq stream error [model=${model}, status=${errStatus}]: ${errMsg}`);

      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit on key ${this.currentKeyIndex}. Retrying stream with backup key...`);
        return await this._processChatStream(messages, onChunk, depth, useFallback);
      }

      // Auto-fallback to smaller model on token/context overflow
      if (!useFallback && (errMsg.includes("token") || errMsg.includes("context_length") || errMsg.includes("too many tokens") || errMsg.includes("maximum context") || error.status === 413)) {
        console.warn(`⚠️ Token overflow on ${this.model}. Falling back to ${this.fallbackModel} for stream...`);
        if (onChunk) onChunk("\n✨ *Switching to faster brain for this heavy task...*\n");
        const trimmedMessages = trimMessagesToFit(messages, 6000);
        return await this._processChatStream(trimmedMessages, onChunk, depth, true);
      }

      // Handle Groq's strict tool validation crash in streams
      if (error.status === 400 && errMsg.includes("Failed to call a function")) {
        console.warn("⚠️ Groq tool parser failed in stream. Auto-recovering without tools...");
        try {
          const fallbackStream = await this.openai.chat.completions.create({
            model,
            messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
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

      // If primary model fails for any 400 error, try fallback model
      if (!useFallback && error.status === 400) {
        console.warn(`⚠️ Primary model stream failed (400). Trying fallback model ${this.fallbackModel}...`);
        if (onChunk) onChunk("\n✨ *Retrying with a different approach...*\n");
        return await this._processChatStream(messages, onChunk, depth, true);
      }

      // Retry transient network errors
      if (!this._streamRetryCount) this._streamRetryCount = 0;
      const isTransient = !error.status || error.status >= 500 || errMsg.includes("fetch") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET") || errMsg.includes("socket") || errMsg.includes("network") || errMsg.includes("abort");
      if (isTransient && this._streamRetryCount < 3) {
        this._streamRetryCount++;
        console.warn(`🔄 Stream transient error. Retrying attempt ${this._streamRetryCount}/3 in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return await this._processChatStream(messages, onChunk, depth, useFallback);
      }
      this._streamRetryCount = 0;

      // Return a more helpful error message
      if (this._isQuotaError(error)) return getErrorMessage("rate_limit");
      return getErrorMessage("llm_error");
    }
  }

  async generate(prompt) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "system", content: this._getSystemPromptText() }, { role: "user", content: prompt }],
        max_tokens: this.maxTokens,
      }, { signal: controller.signal });

      clearTimeout(timeout);
      this._resetKeyTracker(); // Success — reset key tracker
      return cleanResponse(response.choices[0].message.content) || getErrorMessage("llm_error");
    } catch (error) {
      // Try switching to backup key on quota/rate-limit errors
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit. Retrying generate with backup key...`);
        return await this.generate(prompt);
      }
      // Fallback to smaller model on token errors
      const errMsg = error?.message || "";
      if (errMsg.includes("token") || errMsg.includes("context_length")) {
        console.warn(`⚠️ Token overflow on generate. Trying ${this.fallbackModel}...`);
        try {
          const fallback = await this.openai.chat.completions.create({
            model: this.fallbackModel,
            messages: [{ role: "system", content: this._getSystemPromptText() }, { role: "user", content: prompt.substring(0, 8000) }],
            max_tokens: this.maxTokens,
          });
          return cleanResponse(fallback.choices[0].message.content) || getErrorMessage("llm_error");
        } catch (e) {
          console.error("Fallback generate error:", e.message);
        }
      }
      return getErrorMessage("llm_error");
    }
  }

  async analyzeImage(base64Data, mimeType = "image/jpeg", customPrompt = null) {
    try {
      const promptText = customPrompt || "Describe this image in detail. What is happening? Are there any text, objects, or people?";
      const response = await this.openai.chat.completions.create({
        model: "llama-3.2-11b-vision-preview", // Use Groq's dedicated vision model
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
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

  async transcribeAudio(filePath) {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
      });
      this._resetKeyTracker();
      return response.text;
    } catch (error) {
      if (this._isQuotaError(error) && this._switchToNextKey()) {
        console.warn(`⚠️ Quota hit during Transcription task. Retrying...`);
        return await this.transcribeAudio(filePath);
      }
      console.error("Groq Whisper transcription error:", error.message);
      return null;
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
