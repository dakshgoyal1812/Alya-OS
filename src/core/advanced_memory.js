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
          habits: [
            { id: 1, habit: "User usually reviews system resource stats every afternoon", confidence: 0.85 },
            { id: 2, habit: "User prefers dark cyber neon colors for styling and UI layouts", confidence: 0.90 }
          ],
          relationships: [
            { from: "User", relation: "Creator of", to: "Alya AI" },
            { from: "Alya AI", relation: "Runs on", to: "Local Host OS" },
            { from: "Alya AI", relation: "Uses", to: "Groq Cloud Llama 3" }
          ],
          emotionalState: {
            stress: 0.1,
            frustration: 0.0,
            excitement: 0.55,
            confusion: 0.0,
            lastUpdated: new Date().toISOString()
          },
          temporalTimeline: [
            { timestamp: new Date().toISOString(), event: "Alya Master Control Core upgraded to AI OS Suite" }
          ]
        };
        this._saveCognitiveDb();
      }
    } catch (e) {
      this.db = { habits: [], relationships: [], emotionalState: { stress: 0, frustration: 0, excitement: 0.5, confusion: 0 }, temporalTimeline: [] };
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
}
