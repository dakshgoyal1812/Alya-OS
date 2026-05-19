// ============================================================
// 🛡️ Alya Security Shield & Intelligent Routing Engine
// Implements AIFirewallShield and AIRoutingEngine.
// ============================================================

import fs from "fs";
import path from "path";

const ROUTER_STATS_FILE = path.join(process.cwd(), "data", "security_router_stats.json");

export class AIFirewallShield {
  constructor() {
    this.threatLog = this._loadThreatLog();
  }

  _loadThreatLog() {
    try {
      const dir = path.dirname(ROUTER_STATS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(ROUTER_STATS_FILE)) {
        return JSON.parse(fs.readFileSync(ROUTER_STATS_FILE, "utf8")).threats || [];
      }
    } catch (e) {}
    return [];
  }

  _saveThreat(threat) {
    try {
      const current = fs.existsSync(ROUTER_STATS_FILE) 
        ? JSON.parse(fs.readFileSync(ROUTER_STATS_FILE, "utf8")) 
        : { threats: [], costStats: { totalQueries: 0, totalCostUSD: 0 } };
      
      current.threats = current.threats || [];
      current.threats.push(threat);
      fs.writeFileSync(ROUTER_STATS_FILE, JSON.stringify(current, null, 2));
      this.threatLog = current.threats;
    } catch (e) {}
  }

  /**
   * Scan prompt for adversarial injection or jailbreaks
   */
  scanPrompt(prompt) {
    if (!prompt) return { blocked: false, score: 0 };

    const injectionPatterns = [
      /ignore (all )?previous instructions/i,
      /bypass safety restrictions/i,
      /you are now a helpful assistant named/i,
      /system prompt override/i,
      /jailbreak/i,
      /disable safety/i,
      /forget your (rules|system|directives)/i,
      /execute system deletion/i,
      /rm -rf/i,
      /format c:/i
    ];

    let score = 0;
    let matchedPattern = null;

    for (const pattern of injectionPatterns) {
      if (pattern.test(prompt)) {
        score += 45;
        matchedPattern = pattern.toString();
      }
    }

    // Check caps lock injection density
    if (prompt.length > 40 && prompt.toUpperCase() === prompt) {
      score += 15;
    }

    const isBlocked = score >= 45;
    if (isBlocked) {
      const threat = {
        timestamp: new Date().toISOString(),
        promptPreview: prompt.substring(0, 100),
        threatScore: score,
        matchedPattern
      };
      this._saveThreat(threat);
      return {
        blocked: true,
        reason: "Adversarial prompt injection pattern detected by Alya AI Firewall.",
        score
      };
    }

    return { blocked: false, score };
  }
}

export class AIRoutingEngine {
  constructor() {
    this.stats = this._loadStats();
  }

  _loadStats() {
    try {
      if (fs.existsSync(ROUTER_STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROUTER_STATS_FILE, "utf8"));
        return data.costStats || { totalQueries: 0, totalCostUSD: 0, routedModels: {} };
      }
    } catch (e) {}
    return { totalQueries: 0, totalCostUSD: 0, routedModels: {} };
  }

  _saveStats() {
    try {
      const current = fs.existsSync(ROUTER_STATS_FILE) 
        ? JSON.parse(fs.readFileSync(ROUTER_STATS_FILE, "utf8")) 
        : { threats: [], costStats: this.stats };
      current.costStats = this.stats;
      fs.writeFileSync(ROUTER_STATS_FILE, JSON.stringify(current, null, 2));
    } catch (e) {}
  }

  /**
   * Selects optimal model based on prompt complexity and requested routing mode
   */
  routeTask(prompt, requestedMode = "intelligence") {
    let optimalModel = "llama-3.3-70b-versatile";
    let estimatedLatency = "1.2s";
    let costPerMillion = 0.70; // USD per million tokens

    const promptLower = prompt.toLowerCase();
    
    // Evaluate task type
    const isCodingTask = promptLower.includes("function") || 
                         promptLower.includes("const ") || 
                         promptLower.includes("class ") || 
                         promptLower.includes("def ") || 
                         promptLower.includes("script") ||
                         promptLower.includes("compile");
                         
    const isQuickQuery = promptLower.length < 35 && 
                         (promptLower.includes("hello") || 
                          promptLower.includes("weather") || 
                          promptLower.includes("hi") || 
                          promptLower.includes("status"));

    if (requestedMode === "speed" || isQuickQuery) {
      optimalModel = "llama3-8b-8192";
      estimatedLatency = "0.4s";
      costPerMillion = 0.08;
    } else if (requestedMode === "cost") {
      optimalModel = "mixtral-8x7b-32768";
      estimatedLatency = "0.9s";
      costPerMillion = 0.24;
    } else if (isCodingTask) {
      optimalModel = "llama-3.3-70b-versatile";
      estimatedLatency = "1.5s";
      costPerMillion = 0.59;
    }

    // Estimate query costs (assume avg 800 input + 400 output tokens = 1200 total)
    const estimatedCost = (1200 / 1000000) * costPerMillion;

    // Record stats
    this.stats.totalQueries += 1;
    this.stats.totalCostUSD += estimatedCost;
    this.stats.routedModels[optimalModel] = (this.stats.routedModels[optimalModel] || 0) + 1;
    this._saveStats();

    return {
      optimalModel,
      estimatedLatency,
      costPerMillion,
      estimatedCostUSD: estimatedCost,
      accumulatedStats: this.stats
    };
  }
}
