// ============================================================
// 🧠 Hybrid Multi-Model Router
// Manages intelligent model routing, speed/intelligence modes,
// cost optimization, and automatic failovers.
// ============================================================

import { loadConfig } from "./config.js";

export const MODEL_DIRECTORY = {
  "groq-llama-70b": {
    name: "llama-3.3-70b-versatile",
    provider: "groq",
    type: "reasoning",
    cost: 0.0005, // per 1k tokens
    speed: 95, // tokens/sec
    intelligence: 85,
    description: "Ultra-fast Groq Llama 3.3 model for coding and fast reasoning."
  },
  "groq-llama-8b": {
    name: "llama-3.1-8b-instant",
    provider: "groq",
    type: "fast",
    cost: 0.0001,
    speed: 180,
    intelligence: 65,
    description: "Lightweight, instant speed model for quick chats and greetings."
  },
  "groq-vision": {
    name: "llama-3.2-11b-vision-preview",
    provider: "groq",
    type: "vision",
    cost: 0.00015,
    speed: 120,
    intelligence: 75,
    description: "Multimodal Llama vision model."
  },
  "claude-sonnet": {
    name: "claude-3-5-sonnet",
    provider: "anthropic",
    type: "writing",
    cost: 0.003,
    speed: 60,
    intelligence: 98,
    description: "Superior creative writing, coding complexity, and detailed research."
  },
  "gpt-4o": {
    name: "gpt-4o",
    provider: "openai",
    type: "reasoning",
    cost: 0.005,
    speed: 55,
    intelligence: 95,
    description: "GPT model for structured data planning and step-by-step logic."
  },
  "gemini-pro": {
    name: "gemini-1.5-pro",
    provider: "google",
    type: "long-context",
    cost: 0.00125,
    speed: 45,
    intelligence: 90,
    description: "Gemini Pro model for parsing massive files or full codebases."
  },
  "local-llama": {
    name: "llama3",
    provider: "ollama",
    type: "local",
    cost: 0.0,
    speed: 25,
    intelligence: 70,
    description: "Private offline model running on local computer via Ollama."
  },
  "openrouter-deepseek": {
    name: "deepseek/deepseek-chat",
    provider: "openrouter",
    type: "reasoning",
    cost: 0.00014,
    speed: 75,
    intelligence: 95,
    description: "DeepSeek model hosted on OpenRouter gateway."
  },
  "gemini-thinking": {
    name: "gemini-2.0-flash-thinking-exp-01-21",
    provider: "google",
    type: "reasoning",
    cost: 0.0,
    speed: 45,
    intelligence: 98,
    supportsTools: false,
    description: "Google Gemini 2.0 Flash Thinking reasoning model (Free tier)."
  },
  "gemini-flash": {
    name: "gemini-2.0-flash",
    provider: "google",
    type: "fast",
    cost: 0.0,
    speed: 85,
    intelligence: 88,
    supportsTools: true,
    description: "Google Gemini 2.0 Flash model (Free tier)."
  },
  "openrouter-deepseek-r1": {
    name: "deepseek/deepseek-r1:free",
    provider: "openrouter",
    type: "reasoning",
    cost: 0.0,
    speed: 35,
    intelligence: 99,
    supportsTools: false,
    description: "DeepSeek R1 reasoning model via OpenRouter (Free tier)."
  },
  "openrouter-llama-free": {
    name: "meta-llama/llama-3.3-70b-instruct:free",
    provider: "openrouter",
    type: "reasoning",
    cost: 0.0,
    speed: 65,
    intelligence: 95,
    supportsTools: true,
    description: "Llama 3.3 70B Instruct via OpenRouter (Free tier)."
  },
  "openrouter-qwen-free": {
    name: "qwen/qwen-2.5-72b-instruct:free",
    provider: "openrouter",
    type: "reasoning",
    cost: 0.0,
    speed: 55,
    intelligence: 96,
    supportsTools: true,
    description: "Qwen 2.5 72B Instruct via OpenRouter (Free tier)."
  }
};

export class ModelRouter {
  constructor() {
    this.config = loadConfig();
    this.benchmarks = {
      totalRequests: 0,
      totalCost: 0,
      avgLatency: 0,
      failures: 0
    };
  }

  /**
   * Selects the best model based on prompt category and user performance preference.
   * Modes: 'speed' | 'intelligence' | 'cost'
   */
  route(prompt, mode = "intelligence", fileAttached = false) {
    const promptLower = prompt.toLowerCase();
    
    // Check long context need
    const needsLongContext = fileAttached || prompt.length > 8000 || promptLower.includes("summarize codebase") || promptLower.includes("read this pdf");
    if (needsLongContext) {
      return this._verifyOrFallback("gemini-pro");
    }

    // Check specific task type
    const isCodingTask = promptLower.includes("write code") || promptLower.includes("debug") || promptLower.includes("fix syntax") || promptLower.includes("python");
    const isCreativeTask = promptLower.includes("write a story") || promptLower.includes("draft email") || promptLower.includes("creative");
    
    // Identify complex math, logic, reasoning, or deep thinking prompts
    const isReasoningTask = promptLower.includes("think") || 
                            promptLower.includes("explain in detail") || 
                            promptLower.includes("solve") || 
                            promptLower.includes("math") || 
                            promptLower.includes("logic") || 
                            promptLower.includes("why") || 
                            promptLower.includes("complex") || 
                            promptLower.includes("analyze");

    if (mode === "speed") {
      return this._verifyOrFallback("groq-llama-8b");
    }

    if (mode === "cost") {
      return this._verifyOrFallback("local-llama");
    }

    // Default intelligence mode routing
    if (isReasoningTask) {
      return this._verifyOrFallback("gemini-thinking");
    }
    if (isCodingTask) {
      return this._verifyOrFallback("groq-llama-70b");
    }
    if (isCreativeTask) {
      return this._verifyOrFallback("claude-sonnet");
    }

    return this._verifyOrFallback("groq-llama-70b");
  }

  /**
   * Verifies if the targeted model's provider is configured, otherwise rolls back.
   */
  _verifyOrFallback(preferredKey) {
    const config = this.config;
    const key = MODEL_DIRECTORY[preferredKey];

    // Check configuration status for keys
    let isAvailable = false;
    if (key.provider === "groq" && config.groq?.apiKey && !config.groq.apiKey.startsWith("PASTE")) isAvailable = true;
    if (key.provider === "anthropic" && config.anthropic?.apiKey) isAvailable = true;
    if (key.provider === "openai" && config.openai?.apiKey) isAvailable = true;
    if (key.provider === "google" && config.google?.apiKey) isAvailable = true;
    if (key.provider === "openrouter" && config.openrouter?.apiKey) isAvailable = true;
    if (key.provider === "ollama" && config.ollama?.enabled) isAvailable = true;

    if (isAvailable) {
      return preferredKey;
    }

    // Failover sequence: Preferred -> Gemini thinking -> OpenRouter DeepSeek R1 -> Groq 70b -> Groq 8b
    console.warn(`⚠️ Target model provider for '${preferredKey}' is unavailable. Invoking failover...`);
    this.benchmarks.failures++;

    if (preferredKey === "gemini-thinking") {
      return this._verifyOrFallback("openrouter-deepseek-r1");
    } else if (preferredKey === "openrouter-deepseek-r1") {
      return this._verifyOrFallback("groq-llama-70b");
    } else if (preferredKey !== "groq-llama-70b") {
      return this._verifyOrFallback("groq-llama-70b");
    } else {
      return "groq-llama-8b";
    }
  }

  /**
   * Updates tracking stats for model response benchmarks
   */
  recordBenchmark(modelKey, latencyMs, tokensOut = 200) {
    const details = MODEL_DIRECTORY[modelKey] || { cost: 0, speed: 50 };
    this.benchmarks.totalRequests++;
    this.benchmarks.totalCost += (details.cost / 1000) * tokensOut;
    this.benchmarks.avgLatency = Math.round(
      (this.benchmarks.avgLatency * (this.benchmarks.totalRequests - 1) + latencyMs) / this.benchmarks.totalRequests
    );
  }

  getBenchmarks() {
    return {
      ...this.benchmarks,
      formattedCost: `$${this.benchmarks.totalCost.toFixed(5)}`,
      avgSpeed: `${this.benchmarks.avgLatency > 0 ? Math.round(200 / (this.benchmarks.avgLatency / 1000)) : 0} tok/s`
    };
  }
}
