// ============================================================
// 🧠 Cognitive Mirror & Thinking Engine
// Implements mirror profiling, multi-agent debates, style
// detectors, and belief trackers.
// ============================================================

import fs from "fs";
import path from "path";

const COGNITIVE_PROFILE_FILE = path.join(process.cwd(), "data", "cognitive_profile.json");

export class CognitiveMirrorEngine {
  constructor(llmInstance) {
    this.llm = llmInstance;
    this.profile = this._loadProfile();
  }

  _loadProfile() {
    try {
      if (fs.existsSync(COGNITIVE_PROFILE_FILE)) {
        return JSON.parse(fs.readFileSync(COGNITIVE_PROFILE_FILE, "utf8"));
      }
    } catch (e) {}
    return {
      analyticalScore: 0.5,
      creativeScore: 0.5,
      emotionalScore: 0.5,
      blindspots: ["Prefers fast conclusions over verification"],
      biases: ["Tech-optimism", "Automation dependency"],
      contradictions: [],
      fatigueAlerts: 0
    };
  }

  _saveProfile() {
    try {
      const dir = path.dirname(COGNITIVE_PROFILE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(COGNITIVE_PROFILE_FILE, JSON.stringify(this.profile, null, 2));
    } catch (e) {}
  }

  /**
   * Run cognitive style detection and update psychological mirror metrics
   */
  detectStyleAndProfile(userMessage) {
    const text = userMessage.toLowerCase();
    
    // Style increments
    if (text.includes("why") || text.includes("how") || text.includes("prove") || text.includes("logic")) {
      this.profile.analyticalScore = Math.min(1.0, this.profile.analyticalScore + 0.05);
    }
    if (text.includes("imagine") || text.includes("creative") || text.includes("story") || text.includes("invent")) {
      this.profile.creativeScore = Math.min(1.0, this.profile.creativeScore + 0.05);
    }
    if (text.includes("feel") || text.includes("sad") || text.includes("happy") || text.includes("worry")) {
      this.profile.emotionalScore = Math.min(1.0, this.profile.emotionalScore + 0.05);
    }

    this._saveProfile();
    return this.getDominantStyle();
  }

  getDominantStyle() {
    const { analyticalScore, creativeScore, emotionalScore } = this.profile;
    if (analyticalScore >= creativeScore && analyticalScore >= emotionalScore) return "analytical";
    if (creativeScore >= analyticalScore && creativeScore >= emotionalScore) return "creative";
    return "emotional";
  }

  /**
   * Multi-Agent Internal Debate Simulator
   */
  async runInternalDebate(prompt) {
    const debatePrompt = `[MODE: MULTI-AGENT INTERNAL DEBATE]
We have 3 virtual agents arguing how to respond to the prompt below:
Query: "${prompt}"

1. THE RATIONALIST: Analyzes logic, rules, limits, and efficiency.
2. THE CREATIVE: Thinks outside the box, offers lateral concepts, breaks conventions.
3. THE SKEPTIC: Flags potential failure points, bugs, security issues, and assumptions.

Please generate a brief debate (max 2 sentences per agent) where they discuss the solution, followed by a combined, verified consensus solution.`;
    
    return await this.llm.generate(debatePrompt);
  }

  /**
   * Checks for contradictions against first principles vault
   */
  trackBeliefsAndContradictions(userMessage, firstPrinciples = []) {
    const text = userMessage.toLowerCase();
    const detectedContradictions = [];

    firstPrinciples.forEach(p => {
      const principle = p.toLowerCase();
      // Simple semantic contradiction check (e.g. saying you hate X after stating X is a first principle)
      if (principle.includes("love") && text.includes("hate")) {
        detectedContradictions.push(`Current statement seems to conflict with principle: "${p}"`);
      }
      if (principle.includes("focus") && text.includes("procrastinate")) {
        detectedContradictions.push(`Action conflicts with focus principle: "${p}"`);
      }
    });

    if (detectedContradictions.length > 0) {
      this.profile.contradictions.push(...detectedContradictions);
      this._saveProfile();
    }
    return detectedContradictions;
  }
}

export class DecisionFatigueDetector {
  constructor() {
    this.timestamps = [];
    this.fatigueDetected = false;
  }

  recordQuery(message) {
    const now = Date.now();
    this.timestamps.push({ time: now, length: message.length });
    
    // Filter timestamps in last 2 minutes
    this.timestamps = this.timestamps.filter(t => now - t.time < 120000);
    
    if (this.timestamps.length >= 5) {
      const avgLen = this.timestamps.reduce((sum, t) => sum + t.length, 0) / this.timestamps.length;
      // High frequency, very short questions indicate decision fatigue
      if (avgLen < 15) {
        this.fatigueDetected = true;
        return true;
      }
    }
    this.fatigueDetected = false;
    return false;
  }
}
