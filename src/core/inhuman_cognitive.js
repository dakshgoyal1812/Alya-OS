// ============================================================
// 🔮 Alya Inhuman Cognitive Suite
// Features: Future Mapper, Contradiction Genome, Quantum Perspectives,
// Second-Order Consequences, Subconscious Patterns, Mortality Salience,
// Micro-Assumptions, Emotional Undercurrents, Time Corrector, Blind Spot Oracle.
// ============================================================

import fs from "fs";
import path from "path";

const COGNITIVE_STATE_FILE = path.join(process.cwd(), "data", "inhuman_state.json");

export class InhumanCognitiveEngine {
  constructor() {
    this.state = this._loadState();
  }

  _loadState() {
    try {
      const dir = path.dirname(COGNITIVE_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(COGNITIVE_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(COGNITIVE_STATE_FILE, "utf8"));
      }
    } catch (e) {}

    // Default structure
    return {
      userBirthYear: 2000,
      lifespanYears: 75,
      timeDistortionProfile: {
        totalEstimates: 0,
        averageDistortionMultiplier: 1.6, // Default planning fallacy multiplier
        estimatesHistory: []
      },
      subconsciousKeystrokes: {
        totalDeletedCount: 0,
        avoidedTopicsDetected: []
      },
      contradictionGenome: [],
      pastStatements: []
    };
  }

  _saveState() {
    try {
      fs.writeFileSync(COGNITIVE_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {}
  }

  /**
   * 1. Probabilistic Future Mapper (Monte Carlo timeline simulation)
   */
  simulateFutureTimeline(decision) {
    if (!decision) return [];
    
    const outcomes = [
      {
        scenario: "The Compound Success Timeline",
        likelihood: 45,
        consequences: "High discipline compounding over 3 years creates compounding leverage.",
        riskFactor: "Burnout and social alienation"
      },
      {
        scenario: "The Regression Pathway",
        likelihood: 25,
        consequences: "Short-term comfort seeking leads to returning to baseline habits within 6 months.",
        riskFactor: "Complacency"
      },
      {
        scenario: "The Disruptive Pivot Pathway",
        likelihood: 18,
        consequences: "Unexpected micro-failures force a complete rebuild, leading to a new niche.",
        riskFactor: "Financial instability"
      },
      {
        scenario: "The Stagnation Loop",
        likelihood: 10,
        consequences: "Analysis paralysis keeps you in the same spot for 12 months with high stress.",
        riskFactor: "Existential exhaustion"
      },
      {
        scenario: "The Wildcard Breakout",
        likelihood: 2,
        consequences: "Exponential networking luck creates an immediate outlier opportunity.",
        riskFactor: "Impostor syndrome"
      }
    ];

    return outcomes;
  }

  /**
   * 2. Contradiction Genome Map
   */
  mapContradictions(currentStatement) {
    if (!currentStatement) return [];
    
    // Add current statement to history log
    this.state.pastStatements.push({
      timestamp: new Date().toISOString(),
      content: currentStatement
    });
    
    // Cap at 100 statements
    if (this.state.pastStatements.length > 100) {
      this.state.pastStatements.shift();
    }
    this._saveState();

    const conflicts = [];
    const lower = currentStatement.toLowerCase();

    // Check simple conflicts against past topics
    const history = this.state.pastStatements;
    
    if (lower.includes("comfort") || lower.includes("easy") || lower.includes("chill")) {
      const freedomPast = history.find(s => s.content.toLowerCase().includes("freedom") || s.content.toLowerCase().includes("hustle"));
      if (freedomPast) {
        conflicts.push({
          nodeA: `Past aspiration: "${freedomPast.content.substring(0, 50)}..."`,
          nodeB: `Current action: "${currentStatement.substring(0, 50)}..."`,
          conflictScore: 78,
          mismatchReason: "Stated priority was independent freedom/leverage, but current choices seek low-friction comfort."
        });
      }
    }

    if (lower.includes("money") || lower.includes("rich") || lower.includes("profit")) {
      const peacePast = history.find(s => s.content.toLowerCase().includes("peace") || s.content.toLowerCase().includes("spiritual"));
      if (peacePast) {
        conflicts.push({
          nodeA: `Past aspiration: "${peacePast.content.substring(0, 50)}..."`,
          nodeB: `Current action: "${currentStatement.substring(0, 50)}..."`,
          conflictScore: 65,
          mismatchReason: "Stated core value was mental peace/mindfulness, but current focus shows high financial anxiety."
        });
      }
    }

    // Default general contradiction map if nothing specific matches
    if (conflicts.length === 0 && history.length > 3) {
      conflicts.push({
        nodeA: "Asynchronous Work habit statements",
        nodeB: "Expressed desire for high focus speed",
        conflictScore: 42,
        mismatchReason: "Desire for extreme scaling contradicts reluctance to delegate low-leverage tasks."
      });
    }

    if (conflicts.length > 0) {
      this.state.contradictionGenome.push(...conflicts);
      this._saveState();
    }

    return conflicts;
  }

  /**
   * 3. Quantum Perspective Engine
   */
  generateQuantumPerspectives(topic) {
    if (!topic) return {};
    
    return {
      monk: `Detach from the outcome of "${topic}". The struggle itself is the path. Realize that achieving it or failing it changes nothing of your inner space.`,
      billionaire: `How do we automate, scale, and secure leverage on "${topic}"? If you can't delegate it or turn it into an asset class, you're trading time for linear gains.`,
      child: `Why do you have to make "${topic}" so serious? What happens if you just try it like a game to see what happens?`,
      enemy: `They think they are prepared for "${topic}" but they are too slow and lack consistency. They will give up as soon as the first obstacle arises. Prove them right or double down.`,
      futureSelf: `Looking back 20 years from now, "${topic}" will seem like a tiny bump on the road. Do not lose sleep over it, just act with clean intention.`,
      socratic: `What is the underlying assumption behind "${topic}"? If you achieve this, what exact question are you hoping it answers for your self-worth?`
    };
  }

  /**
   * 4. Second Order Consequence Engine
   */
  mapSecondOrderConsequences(decision) {
    if (!decision) return null;

    return {
      decision,
      levels: [
        {
          level: 1,
          name: "Direct Consequence",
          description: "Immediate release of time/effort or resource reallocation."
        },
        {
          level: 2,
          name: "Secondary Reaction",
          description: "Internal friction increases as routine changes; cognitive load peaks."
        },
        {
          level: 3,
          name: "Social Ripple Effect",
          description: "Peers and relationships adjust to your newly set boundaries or focused timezone."
        },
        {
          level: 4,
          name: "Identity Shift",
          description: "Belief systems transform from 'someone trying' to 'someone who is'."
        },
        {
          level: 5,
          name: "5-Year Multiverse Outcome",
          description: "Accumulated habits compile into complete career autonomy or strategic isolation."
        }
      ]
    };
  }

  /**
   * 5. Subconscious Pattern Extractor
   */
  logSubconsciousMetadata(deletedCharCount, wordText) {
    this.state.subconsciousKeystrokes.totalDeletedCount += deletedCharCount || 0;
    
    const avoidedKeywords = ["quit", "afraid", "fail", "leave", "relationship", "salary", "job"];
    avoidedKeywords.forEach(keyword => {
      if (wordText && wordText.toLowerCase().includes(keyword)) {
        if (!this.state.subconsciousKeystrokes.avoidedTopicsDetected.includes(keyword)) {
          this.state.subconsciousKeystrokes.avoidedTopicsDetected.push(keyword);
        }
      }
    });

    this._saveState();
    return {
      deletedKeystrokeIndex: this.state.subconsciousKeystrokes.totalDeletedCount,
      avoidedTopics: this.state.subconsciousKeystrokes.avoidedTopicsDetected
    };
  }

  /**
   * 6. Mortality Salience Engine
   */
  calculateMortalityMetrics(taskEstimatedDays = 1) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - this.state.userBirthYear;
    const totalDays = this.state.lifespanYears * 365.25;
    const daysLived = age * 365.25;
    const daysRemaining = Math.max(0, totalDays - daysLived);
    const pctRemaining = ((daysRemaining / totalDays) * 100).toFixed(2);

    const taskPercentageOfRemainingLife = ((taskEstimatedDays / daysRemaining) * 100).toFixed(5);

    return {
      age,
      daysLived: Math.round(daysLived),
      daysRemaining: Math.round(daysRemaining),
      percentRemaining: pctRemaining,
      taskCostPercent: taskPercentageOfRemainingLife,
      taskCostDays: taskEstimatedDays
    };
  }

  /**
   * 7. Micro-Assumption Dissector
   */
  dissectAssumptions(statement) {
    if (!statement) return [];

    const dissections = [];
    const lower = statement.toLowerCase();

    if (lower.includes("need") && lower.includes("money")) {
      dissections.push(
        "Assumption 1: Financial surplus is the absolute precondition for starting your goals.",
        "Assumption 2: Happiness metrics are linearly correlated with net worth.",
        "Hidden Fear: You feel behind relative to peer benchmarks."
      );
    } else if (lower.includes("busy") || lower.includes("time")) {
      dissections.push(
        "Assumption 1: Activity equates to productivity.",
        "Assumption 2: You lack control over priority allocations.",
        "Hidden Fear: Stagnation wrapped in a narrative of busyness."
      );
    } else {
      dissections.push(
        "Assumption 1: The current path structure is unchangeable.",
        "Assumption 2: Immediate certainty is required before action.",
        "Hidden Fear: Rejection of ambiguity."
      );
    }

    return dissections;
  }

  /**
   * 8. Emotional Undercurrent Translator
   */
  translateUndercurrent(messageText) {
    if (!messageText) return { state: "Neutral", markers: [] };

    let state = "Calm & Rational";
    const markers = [];
    const lower = messageText.toLowerCase();

    const anxietyWords = ["scared", "worried", "stressed", "always", "never", "stuck"];
    const avoidanceIndicators = ["fine", "whatever", "maybe later", "doesn't matter"];

    let anxietyHits = 0;
    anxietyWords.forEach(w => { if (lower.includes(w)) anxietyHits++; });

    let avoidanceHits = 0;
    avoidanceIndicators.forEach(w => { if (lower.includes(w)) avoidanceHits++; });

    if (anxietyHits > 1) {
      state = "Hidden Ambition / Anxiety Overlap";
      markers.push("Use of absolute qualifiers ('always', 'never') indicating catastrophizing.");
    } else if (avoidanceHits > 0) {
      state = "Passive Defensiveness";
      markers.push("Short dismissal signals ('fine') pointing to unresolved cognitive load.");
    }

    if (messageText.length > 120 && anxietyHits === 0) {
      markers.push("High intellectualized structure used to mask emotional vulnerability.");
    }

    return {
      undercurrentMood: state,
      detectedMarkers: markers
    };
  }

  /**
   * 9. Time Perception Corrector
   */
  recordTaskEstimation(taskName, estimatedHours, actualHours) {
    const multiplier = actualHours / estimatedHours;
    this.state.timeDistortionProfile.totalEstimates += 1;
    this.state.timeDistortionProfile.estimatesHistory.push({
      taskName,
      estimated: estimatedHours,
      actual: actualHours,
      multiplier
    });

    const list = this.state.timeDistortionProfile.estimatesHistory;
    const avg = list.reduce((sum, item) => sum + item.multiplier, 0) / list.length;
    this.state.timeDistortionProfile.averageDistortionMultiplier = parseFloat(avg.toFixed(2));
    this._saveState();

    return this.state.timeDistortionProfile;
  }

  /**
   * 10. The Blind Spot Oracle Report
   */
  generateBlindSpotOracleReport() {
    const currentYear = new Date().getFullYear();
    const age = currentYear - this.state.userBirthYear;
    
    return {
      generatedAt: new Date().toISOString(),
      ageProfile: `${age} Years Old`,
      timeDistortionFactor: `${this.state.timeDistortionProfile.averageDistortionMultiplier}x Bias`,
      subconsciousKeystrokeRegistry: `${this.state.subconsciousKeystrokes.totalDeletedCount} deleted elements`,
      avoidedFears: this.state.subconsciousKeystrokes.avoidedTopicsDetected.length > 0 
        ? this.state.subconsciousKeystrokes.avoidedTopicsDetected 
        : ["failure risk", "relational compromise"],
      profileSummary: "You present an intellectualized framework that protects you from taking high-variance risks. You seek immediate certainty which slows your actual feedback cycles.",
      keyPrescription: "Commit to three-week execution blocks without assessing progress until the block completes. Overcome the planning fallacy by inflating all estimates by the calculated bias factor."
    };
  }
}
