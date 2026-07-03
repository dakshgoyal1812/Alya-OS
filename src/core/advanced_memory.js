// ============================================================
// 🧠 Advanced Cognitive Memory Engine (Aion-inspired Architecture)
// Integrates Episodic, Semantic, Emotional, and Temporal memory banks
// with relationship linkages and habit mapping.
// ============================================================

import fs from "fs";
import path from "path";

const COGNITIVE_FILE = path.join(process.cwd(), "data", "cognitive_memory.json");

export class AdvancedMemoryEngine {
  constructor() {
    this._loadCognitiveDb();
  }

  _loadCognitiveDb() {
    try {
      const dir = path.dirname(COGNITIVE_FILE);
      if (!dir) return;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(COGNITIVE_FILE)) {
        this.db = JSON.parse(fs.readFileSync(COGNITIVE_FILE, "utf8"));
      } else {
        this.db = {
          semanticFacts: [
            { id: 1, text: "User's AI assistant name is Alisa", timestamp: new Date().toISOString() }
          ],
          habits: [
            { id: 1, habit: "User usually reviews system resource stats every afternoon", confidence: 0.85 },
            { id: 2, habit: "User prefers dark cyber neon colors for styling and UI layouts", confidence: 0.90 }
          ],
          relationships: [
            { from: "User", relation: "Creator of", to: "Alisa AI" },
            { from: "Alisa AI", relation: "Runs on", to: "Local Host OS" },
            { from: "Alisa AI", relation: "Uses", to: "Groq Cloud Llama 3" }
          ],
          emotionalState: {
            stress: 0.1,
            frustration: 0.0,
            excitement: 0.55,
            confusion: 0.0,
            lastUpdated: new Date().toISOString()
          },
          temporalTimeline: [
            { timestamp: new Date().toISOString(), event: "Alisa Master Control Core upgraded to AI OS Suite" }
          ]
        };
        this._saveCognitiveDb();
      }
      if (!this.db.semanticFacts) {
        this.db.semanticFacts = [];
      }
    } catch (e) {
      this.db = { semanticFacts: [], habits: [], relationships: [], emotionalState: { stress: 0, frustration: 0, excitement: 0.5, confusion: 0 }, temporalTimeline: [] };
    }
  }

  _saveCognitiveDb() {
    try {
      fs.writeFileSync(COGNITIVE_FILE, JSON.stringify(this.db, null, 2));
    } catch (e) {
      console.error("Failed to save cognitive memory:", e.message);
    }
  }

  getCognitiveDb() {
    this._loadCognitiveDb();
    return this.db;
  }

  /**
   * Tracks user habits and detects recurrence
   */
  recordInteraction(actionText) {
    const text = actionText.toLowerCase();
    
    // Auto-detect habits
    if (text.includes("system") || text.includes("ram") || text.includes("cpu")) {
      this._boostHabit("User monitors hardware resources closely");
    }
    if (text.includes("generate image") || text.includes("paint") || text.includes("draw")) {
      this._boostHabit("User enjoys visual/creative image generation tools");
    }
    if (text.includes("backup")) {
      this._boostHabit("User prioritizes codebase backups and security safety");
    }

    // Add event to temporal timeline
    this.db.temporalTimeline.push({
      timestamp: new Date().toISOString(),
      event: `Executed command: "${actionText.substring(0, 50)}..."`
    });

    // Keep timeline limited to last 20 events (memory decay representation)
    if (this.db.temporalTimeline.length > 20) {
      this.db.temporalTimeline.shift();
    }

    this._saveCognitiveDb();
  }

  _boostHabit(habitStr) {
    const existing = this.db.habits.find(h => h.habit === habitStr);
    if (existing) {
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
    } else {
      this.db.habits.push({ id: Date.now(), habit: habitStr, confidence: 0.4 });
    }
  }

  /**
   * Updates Emotional state of the conversation
   */
  updateEmotionalState(frustrationDelta, stressDelta, excitementDelta, confusionDelta) {
    const s = this.db.emotionalState;
    s.frustration = Math.max(0.0, Math.min(1.0, s.frustration + frustrationDelta));
    s.stress = Math.max(0.0, Math.min(1.0, s.stress + stressDelta));
    s.excitement = Math.max(0.0, Math.min(1.0, s.excitement + excitementDelta));
    s.confusion = Math.max(0.0, Math.min(1.0, s.confusion + confusionDelta));
    s.lastUpdated = new Date().toISOString();
    this._saveCognitiveDb();
  }

  /**
   * Adapts system personality guidelines based on emotional state
   */
  getEmotionalToneGuidelines() {
    const s = this.db.emotionalState;
    if (s.frustration > 0.6) {
      return "CRITICAL: The user seems frustrated. Be extremely brief, humble, and prioritize quick action. Avoid jokes or chatty pleasantries.";
    }
    if (s.stress > 0.5) {
      return "CRITICAL: User is under stress. Express calm reassurance, speak softly, and keep your explanations very clear and simple.";
    }
    if (s.excitement > 0.7) {
      return "User is highly excited! Match their energy. Use enthusiastic language, exclamation marks, and keep descriptions fun.";
    }
    return "Standard calm professional assistant tone.";
  }

  /**
   * Relationship Graph Builder
   */
  addRelationship(from, relation, to) {
    this.db.relationships.push({ from, relation, to });
    this._saveCognitiveDb();
  }

  deleteRelationship(from, to) {
    this.db.relationships = this.db.relationships.filter(r => !(r.from === from && r.to === to));
    this._saveCognitiveDb();
  }

  /**
   * Add a semantic fact to long-term memory
   */
  addSemanticFact(factText) {
    if (!this.db.semanticFacts) this.db.semanticFacts = [];
    const exists = this.db.semanticFacts.some(f => f.text.toLowerCase() === factText.toLowerCase());
    if (!exists) {
      this.db.semanticFacts.push({
        id: Date.now(),
        text: factText,
        timestamp: new Date().toISOString()
      });
      this._saveCognitiveDb();
      console.log(`🧠 Saved semantic memory fact: "${factText}"`);
    }
  }

  /**
   * Search semantic memories using simple TF-IDF/Jaccard token similarity
   */
  querySemanticMemory(queryText, topN = 3) {
    if (!this.db.semanticFacts || this.db.semanticFacts.length === 0) return [];
    
    const tokenize = (text) => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(t => t.length > 2 && !["the", "and", "you", "for", "with", "this", "that", "are", "was"].includes(t));
    };

    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0) return [];

    const scoredFacts = this.db.semanticFacts.map(fact => {
      const factTokens = tokenize(fact.text);
      const intersection = queryTokens.filter(t => factTokens.includes(t));
      const union = Array.from(new Set([...queryTokens, ...factTokens]));
      const score = union.length > 0 ? intersection.length / union.length : 0;
      return { fact: fact.text, score };
    });

    return scoredFacts
      .filter(f => f.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(f => f.fact);
  }

  /**
   * Automatically extract declaratives from conversational inputs
   */
  autoExtractSemanticFacts(userMessage) {
    const text = userMessage.trim();
    
    // Regular expression helpers for direct declarations
    const patterns = [
      { regex: /my\s+(\w+)\s+(?:is|name\s+is)\s+([^.]+)/i, format: (m) => `User's ${m[1]} is ${m[2].trim()}` },
      { regex: /i\s+am\s+(?:a|an)?\s*([^.]+)/i, format: (m) => `User is ${m[1].trim()}` },
      { regex: /i\s+(?:love|like|hate)\s+([^.]+)/i, format: (m) => `User preference: ${m[0].trim()}` },
      { regex: /i\s+live\s+in\s+([^.]+)/i, format: (m) => `User lives in ${m[1].trim()}` }
    ];

    for (const p of patterns) {
      const match = text.match(p.regex);
      if (match && match[1]) {
        const fact = p.format(match);
        this.addSemanticFact(fact);
        break;
      }
    }
  }
}
