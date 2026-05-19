// ============================================================
// 🌌 Alya Experimental Mind & Reality Engine
// Implements Self-Evolving AI, Deep Surveillance, Reality Augmentation,
// Experimental Mind Tools, and Gamification.
// ============================================================

import fs from "fs";
import path from "path";

const EXPERIMENTAL_STATE_FILE = path.join(process.cwd(), "data", "experimental_state.json");

export class ExperimentalMindEngine {
  constructor() {
    this.state = this._loadState();
  }

  _loadState() {
    try {
      const dir = path.dirname(EXPERIMENTAL_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(EXPERIMENTAL_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(EXPERIMENTAL_STATE_FILE, "utf8"));
      }
    } catch (e) {
      console.error("Failed to load experimental state:", e.message);
    }

    return {
      xp: 0,
      level: 1,
      streak: 1,
      lastCheckIn: new Date().toISOString().split("T")[0],
      unlockedSkills: ["Basic Chat", "Weather Tool"],
      dreams: [],
      regrets: [],
      alternateTimelines: []
    };
  }

  _saveState() {
    try {
      fs.writeFileSync(EXPERIMENTAL_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("Failed to save experimental state:", e.message);
    }
  }

  // ==========================================
  // 🧬 SELF-EVOLVING AI MODULE
  // ==========================================

  optimizeSystemPrompt(currentPrompt, userFeedback) {
    if (userFeedback.includes("short") || userFeedback.includes("concise")) {
      return currentPrompt + "\nOptimization Guideline: Keep responses highly compact, bulleted, and direct.";
    }
    if (userFeedback.includes("detail") || userFeedback.includes("explain")) {
      return currentPrompt + "\nOptimization Guideline: Elaborate comprehensively, explaining architectural choices step-by-step.";
    }
    return currentPrompt;
  }

  generateFineTuneData(history) {
    const qaPairs = [];
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].role === "user" && history[i+1].role === "assistant") {
        qaPairs.push({
          prompt: history[i].content,
          completion: history[i+1].content
        });
      }
    }
    return qaPairs;
  }

  calculateConfidenceScore(responseText) {
    const lowConfidenceIndicators = ["maybe", "not sure", "possibly", "i think", "could be", "probably", "hallucination", "unverified"];
    let score = 98; // Base high confidence
    
    const textLower = responseText.toLowerCase();
    lowConfidenceIndicators.forEach(word => {
      if (textLower.includes(word)) score -= 12;
    });

    if (textLower.length < 30) score -= 5; // short answers have slightly less contextual weight
    return Math.max(45, score);
  }

  detectKnowledgeGaps(queryText) {
    const complexityKeywords = ["quantum", "cryptography", "assembly language", "kernel bypass", "neuroscience", "astrophysics", "bioinformatics"];
    const queryLower = queryText.toLowerCase();
    
    const gaps = complexityKeywords.filter(keyword => queryLower.includes(keyword));
    if (gaps.length > 0) {
      return {
        hasGap: true,
        topic: gaps[0],
        recommendation: `Recommended reading: Open-source documentation and research reviews on "${gaps[0]}". Alya will adapt context logic in parallel.`
      };
    }
    return { hasGap: false };
  }

  detectResponseBias(text) {
    const biasedWords = ["always", "never", "obviously", "everyone knows", "undoubtedly", "definitely"];
    const textLower = text.toLowerCase();
    const hits = biasedWords.filter(word => textLower.includes(word));
    
    if (hits.length > 1) {
      return {
        hasBias: true,
        score: (hits.length * 15),
        description: `Absolutist phrasing detected ("${hits.join(", ")}"). Recommend checking alternate viewpoints.`
      };
    }
    return { hasBias: false, score: 0 };
  }

  // ==========================================
  // 🕵️ DEEP SURVEILLANCE MODULE
  // ==========================================

  analyzeBehavioralAnomaly(userMessage, history) {
    if (history.length < 5) return { anomaly: false };
    
    // Average length calculation
    const lengths = history.filter(h => h.role === "user").map(h => h.content.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    
    if (userMessage.length > avgLength * 4 && userMessage.toUpperCase() === userMessage) {
      return {
        anomaly: true,
        reason: "User is typing in all CAPS with significantly higher word count than standard session averages."
      };
    }
    return { anomaly: false };
  }

  scanDeceptionLikelihood(text) {
    const indicators = ["trust me", "to be honest", "believe me", "actually", "honestly", "literally"];
    const textLower = text.toLowerCase();
    let count = 0;
    
    indicators.forEach(ind => {
      const regex = new RegExp(`\\b${ind}\\b`, "g");
      const matches = textLower.match(regex);
      if (matches) count += matches.length;
    });

    const probability = Math.min(95, count * 20 + 5);
    return {
      deceptionProbability: probability,
      verdict: probability > 50 ? "Suspicious emphasis markers detected." : "Standard credibility score."
    };
  }

  // ==========================================
  // 🌌 REALITY AUGMENTATION MODULE
  // ==========================================

  simulateAlternateTimeline(decisionText, yearsAgo) {
    const branches = [
      `Timeline A: High-risk optimization path. Yields 2.5x productivity gains but raises complexity by 40%.`,
      `Timeline B: Conservative safety route. Stable trajectory with zero regression but slower growth.`,
      `Timeline C: Butterfly Effect divergence. Small choices lead to a completely different stack structure.`
    ];

    const result = {
      decision: decisionText,
      timeframe: `${yearsAgo} years ago`,
      simulatedOutcome: branches[Math.floor(Math.random() * branches.length)],
      timestamp: new Date().toISOString()
    };

    this.state.alternateTimelines.push(result);
    this._saveState();
    return result;
  }

  calculateRegretMinimization(decisionText, futureAge = 80) {
    const queryWords = decisionText.toLowerCase();
    let riskFactor = 50;
    
    if (queryWords.includes("quit") || queryWords.includes("start") || queryWords.includes("launch")) {
      riskFactor = 85; // High potential impact of action
    } else if (queryWords.includes("wait") || queryWords.includes("delay")) {
      riskFactor = 30; // Passive inaction usually carries regret
    }

    const regretScore = Math.max(10, Math.min(95, 100 - riskFactor)); // Bezos framework: Action reduces regret
    const summary = regretScore > 50 
      ? `Bezos Regret Score: ${regretScore}%. Action is highly recommended to prevent long-term regret.`
      : `Bezos Regret Score: ${regretScore}%. Low-impact decision or passive holding pattern.`;

    const result = {
      decision: decisionText,
      regretScore,
      summary,
      timestamp: new Date().toISOString()
    };

    this.state.regrets.push(result);
    this._saveState();
    return result;
  }

  mapButterflyEffectCascades(decisionText) {
    return [
      `Level 1 (Immediate): Choice causes sudden pivot in workflow efficiency.`,
      `Level 2 (Short-term): Team adapts and changes operational priority list.`,
      `Level 3 (Mid-term): Resources shift, opening up hidden technology lanes.`,
      `Level 4 (Long-term): System builds compounding structural advantages.`,
      `Level 5 (Cascading Point): A minor secondary choice creates a major breakthrough.`
    ];
  }

  // ==========================================
  // 🎮 GAMIFICATION & DOPAMINE ENGINE
  // ==========================================

  rewardUserXP(queryText) {
    let gained = 10; // base reward
    const textLower = queryText.toLowerCase();
    
    // Reward for curiosity or analytical reasoning
    if (queryText.includes("?") && queryText.length > 50) gained += 15;
    if (textLower.includes("why") || textLower.includes("how") || textLower.includes("verify")) gained += 10;
    if (textLower.includes("code") || textLower.includes("macro") || textLower.includes("workflow")) gained += 20;

    this.state.xp += gained;
    
    // Check level ups (every 200 XP)
    const newLevel = Math.floor(this.state.xp / 200) + 1;
    let leveledUp = false;
    if (newLevel > this.state.level) {
      this.state.level = newLevel;
      leveledUp = true;
      
      // Auto-unlock skills based on levels
      const newSkills = {
        2: "API Connector Studio",
        3: "Autonomous Ghost Scheduler",
        4: "Alternate Reality Lab",
        5: "First Principles Vault"
      };
      if (newSkills[newLevel]) {
        this.state.unlockedSkills.push(newSkills[newLevel]);
      }
    }

    // Check Check-in Streaks
    const today = new Date().toISOString().split("T")[0];
    if (this.state.lastCheckIn !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (this.state.lastCheckIn === yesterday) {
        this.state.streak += 1;
      } else {
        this.state.streak = 1;
      }
      this.state.lastCheckIn = today;
    }

    this._saveState();
    return {
      xpGained: gained,
      totalXp: this.state.xp,
      level: this.state.level,
      streak: this.state.streak,
      leveledUp,
      unlockedSkills: this.state.unlockedSkills
    };
  }
}
