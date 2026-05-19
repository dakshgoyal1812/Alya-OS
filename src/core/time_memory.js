// ============================================================
// ⏳ Time Capsules, Memory Erasers, and Growth Reports
// ============================================================

import fs from "fs";
import path from "path";

const CAPSULE_FILE = path.join(process.cwd(), "data", "time_capsules.json");

export class TimeCapsuleManager {
  constructor() {
    this.capsules = this._loadCapsules();
  }

  _loadCapsules() {
    try {
      if (fs.existsSync(CAPSULE_FILE)) {
        return JSON.parse(fs.readFileSync(CAPSULE_FILE, "utf8"));
      }
    } catch (e) {}
    return [];
  }

  _saveCapsules() {
    try {
      const dir = path.dirname(CAPSULE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CAPSULE_FILE, JSON.stringify(this.capsules, null, 2));
    } catch (e) {}
  }

  scheduleCapsule(message, deliverDate) {
    const capsule = {
      id: Date.now(),
      message,
      deliverDate: new Date(deliverDate).toISOString(),
      delivered: false,
      scheduledAt: new Date().toISOString()
    };
    this.capsules.push(capsule);
    this._saveCapsules();
    return capsule;
  }

  checkMaturedCapsules() {
    const now = new Date();
    const matured = this.capsules.filter(c => !c.delivered && new Date(c.deliverDate) <= now);
    matured.forEach(c => { c.delivered = true; });
    if (matured.length > 0) this._saveCapsules();
    return matured;
  }
}

export class ForgetModeManager {
  /**
   * GDPR-style selective memory purging
   */
  static purgeKeywords(cognitiveDb, keywords) {
    if (!cognitiveDb) return;
    const list = Array.isArray(keywords) ? keywords : [keywords];
    const match = (text) => list.some(k => text.toLowerCase().includes(k.toLowerCase()));

    // Filter habits
    if (cognitiveDb.habits) {
      cognitiveDb.habits = cognitiveDb.habits.filter(h => !match(h.habit));
    }
    // Filter relationships
    if (cognitiveDb.relationships) {
      cognitiveDb.relationships = cognitiveDb.relationships.filter(r => !match(r.from) && !match(r.to) && !match(r.relation));
    }
    // Filter temporalTimeline
    if (cognitiveDb.temporalTimeline) {
      cognitiveDb.temporalTimeline = cognitiveDb.temporalTimeline.filter(t => !match(t.event));
    }
  }
}

export class GrowthReportGenerator {
  static generateReport(cognitiveDb) {
    const timeline = cognitiveDb.temporalTimeline || [];
    const eventCount = timeline.length;
    const habitsCount = (cognitiveDb.habits || []).length;
    const relationshipCount = (cognitiveDb.relationships || []).length;

    let growthSummary = "📈 ** Weekly AI OS Cognitive Growth Report**\n\n";
    growthSummary += `* **Logical Milestones Tracked**: ${eventCount} key activities recorded.\n`;
    growthSummary += `* **Identified Workflow Patterns (Habits)**: ${habitsCount} recurring behaviors.\n`;
    growthSummary += `* **Memory Graph Node Connections**: ${relationshipCount} semantic linkages map.\n\n`;

    if (habitsCount > 0) {
      growthSummary += `### 💡 Primary Behavioral Patterns:\n`;
      cognitiveDb.habits.forEach(h => {
        growthSummary += `- **${h.habit}** (Confidence Index: ${Math.round(h.confidence * 100)}%)\n`;
      });
    } else {
      growthSummary += `*No workflow habits recorded yet. Engage in more code, design, or research sessions to trigger profiling.*\n`;
    }

    return growthSummary;
  }
}
