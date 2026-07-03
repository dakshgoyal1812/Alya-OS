import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { LLMEngine } from "../core/llm.js";
import { loadConfig } from "../core/config.js";
import { getHistory, addMessage, clearHistory, getStats } from "../core/memory.js";
import { getRandomGreeting, SERVICE_CONNECT_MESSAGES } from "../core/personality.js";
import { generateTTS } from "../core/tts.js";
import path from "path";
import os from "os";
import fs from "fs";

import { AutomationEngine } from "../core/automation.js";
import { CognitiveMirrorEngine, DecisionFatigueDetector } from "../core/cognition.js";
import { TimeCapsuleManager, ForgetModeManager, GrowthReportGenerator } from "../core/time_memory.js";
import { WorkflowSuperpowersManager } from "../core/workflows.js";
import { AdvancedMemoryEngine } from "../core/advanced_memory.js";
import { ExperimentalMindEngine } from "../core/experimental_mind.js";
import { AIFirewallShield, AIRoutingEngine } from "../core/security_router.js";
import { InhumanCognitiveEngine } from "../core/inhuman_cognitive.js";
import { SelfHealingEngine } from "../core/self_healing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// CPU tick difference calculation state
let lastCpuInfo = getCpuTimes();

function getCpuTimes() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  return { idle, total };
}

function getCpuUsage() {
  const current = getCpuTimes();
  const idleDiff = current.idle - lastCpuInfo.idle;
  const totalDiff = current.total - lastCpuInfo.total;
  lastCpuInfo = current;
  if (totalDiff === 0) return 0;
  return Math.round(100 - (100 * idleDiff / totalDiff));
}

export class WebBridge {
  constructor(config, bridges = {}) {
    this.config = config;
    this.llm = new LLMEngine();
    this.bridges = bridges;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, { cors: { origin: "*" } });
    this.isReady = false;
    
    // Automation engine instance
    this.automation = new AutomationEngine(this.llm);
    
    // Cognitive, memory, and workflow instances
    this.cognitiveMirror = new CognitiveMirrorEngine(this.llm);
    this.fatigueDetector = new DecisionFatigueDetector();
    this.timeCapsule = new TimeCapsuleManager();
    this.workflows = new WorkflowSuperpowersManager();
    this.memoryEngine = new AdvancedMemoryEngine();
    this.experimental = new ExperimentalMindEngine();
    this.firewall = new AIFirewallShield();
    this.router = new AIRoutingEngine();
    this.inhuman = new InhumanCognitiveEngine();

    // Auto-Evolution / Self-Healing Brain
    this.healer = new SelfHealingEngine(this.io);
    global.healer = this.healer;
  }

  async start() {
    const port = process.env.PORT || this.config.port || 3000;

    // Serve static files
    this.app.use(express.static(join(__dirname, "..", "..", "web")));
    this.app.use("/temp", express.static(join(process.cwd(), "data", "temp")));
    this.app.use(express.json());

    // API: Health check
    this.app.get("/api/health", async (req, res) => {
      const groqOk = await this.llm.isAvailable();
      const googleConfig = this.llm.router.config.google;
      const geminiOk = (googleConfig?.apiKey && !googleConfig.apiKey.startsWith("PASTE")) ||
                       (googleConfig?.apiKeys && googleConfig.apiKeys.some(k => k && !k.startsWith("PASTE"))) ? true : false;
                       
      const openrouterConfig = this.llm.router.config.openrouter;
      const openrouterOk = (openrouterConfig?.apiKey && !openrouterConfig.apiKey.startsWith("PASTE")) ||
                           (openrouterConfig?.apiKeys && openrouterConfig.apiKeys.some(k => k && !k.startsWith("PASTE"))) ? true : false;
      const models = groqOk ? await this.llm.listModels() : [];
      res.json({
        status: "ok",
        groqApi: groqOk,
        geminiApi: geminiOk,
        openrouterApi: openrouterOk,
        model: this.llm.model,
        availableModels: models.map((m) => m.name),
        uptime: process.uptime(),
      });
    });

    // API: Get status of all bridges
    this.app.get("/api/status", (req, res) => {
      const statuses = {};
      for (const [name, bridge] of Object.entries(this.bridges)) {
        statuses[name] = bridge.getStatus ? bridge.getStatus() : { connected: false };
      }
      statuses.web = { platform: "web", connected: this.isReady };
      res.json({ bridges: statuses, stats: getStats() });
    });

    // API: System stats for the dashboard widget
    this.app.get("/api/system", (req, res) => {
      try {
        const totalMB = Math.round(os.totalmem() / 1024 / 1024);
        const freeMB = Math.round(os.freemem() / 1024 / 1024);
        const usedMB = totalMB - freeMB;
        const ramPercent = Math.round((usedMB / totalMB) * 100);

        res.json({
          platform: os.platform(),
          osType: os.type(),
          arch: os.arch(),
          cpuCores: os.cpus().length,
          totalRAM: (totalMB / 1024).toFixed(1) + " GB",
          usedRAM: (usedMB / 1024).toFixed(1) + " GB",
          ramPercent: ramPercent,
          cpuPercent: getCpuUsage()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Reminders for the dashboard widget
    this.app.get("/api/reminders", (req, res) => {
      try {
        const remindersFile = join(process.cwd(), "data", "reminders.json");
        let reminders = [];
        if (fs.existsSync(remindersFile)) {
          reminders = JSON.parse(fs.readFileSync(remindersFile, "utf-8"));
        }
        res.json({ reminders: reminders.slice(-5) }); // return last 5 reminders
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Delete reminder
    this.app.post("/api/reminders/delete", (req, res) => {
      try {
        const { id } = req.body;
        const remindersFile = join(process.cwd(), "data", "reminders.json");
        if (fs.existsSync(remindersFile)) {
          let reminders = JSON.parse(fs.readFileSync(remindersFile, "utf-8"));
          reminders = reminders.filter(r => Number(r.id) !== Number(id));
          fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));
          res.json({ success: true });
        } else {
          res.status(404).json({ error: "No reminders file found" });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Get Life OS State
    this.app.get("/api/life-os", (req, res) => {
      try {
        const file = join(process.cwd(), "data", "life_os.json");
        let data = { tasks: [], goals: [], notes: "", xp: 0, level: 1, streak: 1, lastStreakUpdate: "" };
        if (fs.existsSync(file)) {
          data = JSON.parse(fs.readFileSync(file, "utf-8"));
        }
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Update Life OS State
    this.app.post("/api/life-os/update", (req, res) => {
      try {
        const file = join(process.cwd(), "data", "life_os.json");
        const data = req.body;
        
        // Ensure data directory exists
        const dir = join(process.cwd(), "data");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Generate AI Daily Summary & Schedule Optimization
    this.app.post("/api/life-os/summary", async (req, res) => {
      try {
        const file = join(process.cwd(), "data", "life_os.json");
        let data = { tasks: [], goals: [], notes: "", xp: 0, level: 1, streak: 1, lastStreakUpdate: "" };
        if (fs.existsSync(file)) {
          data = JSON.parse(fs.readFileSync(file, "utf-8"));
        }
        
        const openTasks = data.tasks.filter(t => !t.completed).map(t => t.text).join(", ");
        const openGoals = data.goals.map(g => g.text).join(", ");
        
        const prompt = `You are Alisa's Brain Core. The user wants an AI Daily Summary and Schedule Optimization. 
Here is their current state:
Level: ${data.level} (XP: ${data.xp}/200)
Pending Tasks: ${openTasks || "None"}
Active Goals: ${openGoals || "None"}
Personal Notes: ${data.notes || "None"}

Please generate a motivating daily summary, highlighting priorities and providing a 3-step action plan to optimize their productivity today. Keep it short, actionable, and conversational.`;
        
        const summary = await this.llm.generate(prompt);
        res.json({ summary });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Get all workflows
    this.app.get("/api/workflows", (req, res) => {
      res.json({ workflows: this.automation.getWorkflows() });
    });

    // API: Create new workflow
    this.app.post("/api/workflows", (req, res) => {
      try {
        const { name, trigger, actions } = req.body;
        const newWf = this.automation.createWorkflow(name, trigger, actions);
        res.json({ success: true, workflow: newWf });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Toggle workflow active state
    this.app.post("/api/workflows/toggle", (req, res) => {
      try {
        const { id, active } = req.body;
        this.automation.toggleWorkflow(id, active);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Delete workflow
    this.app.post("/api/workflows/delete", (req, res) => {
      try {
        const { id } = req.body;
        this.automation.deleteWorkflow(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Trigger workflow execution simulation
    this.app.post("/api/workflows/trigger", async (req, res) => {
      try {
        const { id } = req.body;
        const result = await this.automation.triggerWorkflow(id, (step) => {
          this.io.emit("workflow_step", { id, ...step });
        });
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // API: Get advanced cognitive memories
    this.app.get("/api/cognitive", (req, res) => {
      res.json(this.llm.cognitiveMemory.getCognitiveDb());
    });

    // API: Get model performance benchmarks
    this.app.get("/api/benchmarks", (req, res) => {
      res.json(this.llm.router.getBenchmarks());
    });
    // API: Get WhatsApp QR Code
    this.app.get("/api/whatsapp/qr", (req, res) => {
      const wa = this.bridges.whatsapp;
      if (!wa || !wa.lastQR) {
        return res.status(404).json({ error: "QR code not available yet. Please wait for initialization." });
      }
      res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(wa.lastQR)}`);
    });

    // WhatsApp Cloud API Webhook Verification (GET)
    this.app.get("/webhook/whatsapp", (req, res) => {
      const config = loadConfig();
      const verifyToken = config.whatsapp?.webhookVerifyToken || "alisa_token";
      
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      
      if (mode === "subscribe" && token === verifyToken) {
        console.log("✅ WhatsApp Webhook verified successfully!");
        return res.status(200).send(challenge);
      }
      return res.sendStatus(403);
    });

    // WhatsApp Cloud API Webhook Inbound Messages (POST)
    this.app.post("/webhook/whatsapp", async (req, res) => {
      console.log("📩 WhatsApp webhook POST received:", JSON.stringify(req.body));
      // Respond to Meta immediately to prevent retry loops
      res.sendStatus(200);
      
      const config = loadConfig();
      if (!config.whatsapp?.enabled || !config.whatsapp?.useCloudAPI) return;

      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      
      if (message && message.type === "text") {
        const from = message.from;
        const body = message.text.body;
        const contactName = value?.contacts?.[0]?.profile?.name || "User";
        
        const whatsappBridge = this.bridges.whatsapp;
        if (whatsappBridge && typeof whatsappBridge.handleCloudMessage === "function") {
          await whatsappBridge.handleCloudMessage(from, body, contactName);
        }
      }
    });

    // API: Direct execute backend tool from Creator/Coder dashboard
    this.app.post("/api/tools/execute", async (req, res) => {
      try {
        const { name, args } = req.body;
        const { executeTool } = await import("../core/tools.js");
        const result = await executeTool(name, args || {});
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 🔄 Render.com Free Tier Ephemeral Sync
    this.app.get("/api/state/sync", (req, res) => {
      try {
        const payload = {
          cognitiveProfile: this.cognitiveMirror.profile,
          timeCapsules: this.timeCapsule.capsules,
          workflows: this.workflows.state,
          cognitiveDb: this.memoryEngine.getCognitiveDb()
        };
        res.json(payload);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/state/sync", (req, res) => {
      try {
        const { cognitiveProfile, timeCapsules, workflows, cognitiveDb } = req.body;
        if (cognitiveProfile) {
          this.cognitiveMirror.profile = cognitiveProfile;
          this.cognitiveMirror._saveProfile();
        }
        if (timeCapsules) {
          this.timeCapsule.capsules = timeCapsules;
          this.timeCapsule._saveCapsules();
        }
        if (workflows) {
          this.workflows.state = workflows;
          this.workflows._saveState();
        }
        if (cognitiveDb) {
          this.memoryEngine.db = cognitiveDb;
          this.memoryEngine._saveCognitiveDb();
        }
        res.json({ success: true, message: "Render state re-hydrated successfully." });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 🧠 Multi-Agent Live Internal Debate
    this.app.post("/api/cognition/debate", async (req, res) => {
      try {
        const { query } = req.body;
        const debate = await this.cognitiveMirror.runInternalDebate(query);
        res.json({ success: true, debate });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ⏳ Time Capsules
    this.app.get("/api/timecapsule", (req, res) => {
      res.json(this.timeCapsule.capsules);
    });

    this.app.post("/api/timecapsule", (req, res) => {
      try {
        const { message, deliverDate } = req.body;
        const capsule = this.timeCapsule.scheduleCapsule(message, deliverDate);
        res.json({ success: true, capsule });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ✂️ GDPR Memory Forget Mode
    this.app.post("/api/memory/forget", (req, res) => {
      try {
        const { keywords } = req.body;
        const db = this.memoryEngine.getCognitiveDb();
        ForgetModeManager.purgeKeywords(db, keywords);
        this.memoryEngine._saveCognitiveDb();
        res.json({ success: true, db });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 📈 Growth report
    this.app.get("/api/memory/growth", (req, res) => {
      try {
        const db = this.memoryEngine.getCognitiveDb();
        const report = GrowthReportGenerator.generateReport(db);
        res.json({ success: true, report });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ⚙️ Custom slash commands & macro chains
    this.app.post("/api/workflows/slash", (req, res) => {
      try {
        const { trigger, prompt } = req.body;
        const list = this.workflows.registerSlashCommand(trigger, prompt);
        res.json({ success: true, slashCommands: list });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/workflows/macro", (req, res) => {
      try {
        const { name, steps } = req.body;
        const list = this.workflows.registerMacro(name, steps);
        res.json({ success: true, macros: list });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/workflows/email", async (req, res) => {
      try {
        const { email, tone } = req.body;
        const prompt = WorkflowSuperpowersManager.getEmailGhostPrompt(email, tone);
        const reply = await this.llm.generate(prompt);
        res.json({ success: true, reply });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/workflows/meeting", async (req, res) => {
      try {
        const { topic } = req.body;
        const prompt = WorkflowSuperpowersManager.getMeetingPrepPrompt(topic);
        const prep = await this.llm.generate(prompt);
        res.json({ success: true, prep });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 🌌 Experimental Mind & AR Lab routes
    this.app.get("/api/experimental/stats", (req, res) => {
      res.json({ success: true, state: this.experimental.state });
    });

    this.app.post("/api/experimental/timeline", (req, res) => {
      try {
        const { decision, yearsAgo } = req.body;
        const result = this.experimental.simulateAlternateTimeline(decision, yearsAgo);
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/experimental/regret", (req, res) => {
      try {
        const { decision } = req.body;
        const result = this.experimental.calculateRegretMinimization(decision);
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/experimental/deception", (req, res) => {
      try {
        const { text } = req.body;
        const result = this.experimental.scanDeceptionLikelihood(text);
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.post("/api/experimental/finetune", (req, res) => {
      try {
        const result = this.experimental.generateFineTuneData([]);
        res.json({ success: true, count: result.length, pairs: result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 🛡️ Security Shield & Cost routing info
    this.app.get("/api/security/stats", (req, res) => {
      res.json({
        success: true,
        threats: this.firewall.threatLog,
        costStats: this.router.stats
      });
    });

    // 🔮 Inhuman Cognitive Engine REST Endpoints
    this.app.post("/api/cognitive/future", (req, res) => {
      const { decision } = req.body;
      const timeline = this.inhuman.simulateFutureTimeline(decision);
      res.json({ success: true, timeline });
    });

    this.app.post("/api/cognitive/contradiction", (req, res) => {
      const { statement } = req.body;
      const conflicts = this.inhuman.mapContradictions(statement);
      res.json({ success: true, conflicts });
    });

    this.app.post("/api/cognitive/perspectives", (req, res) => {
      const { topic } = req.body;
      const perspectives = this.inhuman.generateQuantumPerspectives(topic);
      res.json({ success: true, perspectives });
    });

    this.app.post("/api/cognitive/consequences", (req, res) => {
      const { decision } = req.body;
      const result = this.inhuman.mapSecondOrderConsequences(decision);
      res.json({ success: true, result });
    });

    this.app.post("/api/cognitive/subconscious", (req, res) => {
      const { deletedCount, text } = req.body;
      const result = this.inhuman.logSubconsciousMetadata(deletedCount, text);
      res.json({ success: true, result });
    });

    this.app.post("/api/cognitive/mortality", (req, res) => {
      const { taskDays } = req.body;
      const metrics = this.inhuman.calculateMortalityMetrics(taskDays);
      res.json({ success: true, metrics });
    });

    this.app.post("/api/cognitive/assumptions", (req, res) => {
      const { statement } = req.body;
      const assumptions = this.inhuman.dissectAssumptions(statement);
      res.json({ success: true, assumptions });
    });

    this.app.post("/api/cognitive/undercurrent", (req, res) => {
      const { text } = req.body;
      const result = this.inhuman.translateUndercurrent(text);
      res.json({ success: true, result });
    });

    this.app.post("/api/cognitive/timecorrect", (req, res) => {
      const { taskName, estimated, actual } = req.body;
      const profile = this.inhuman.recordTaskEstimation(taskName, estimated, actual);
      res.json({ success: true, profile });
    });

    this.app.get("/api/cognitive/oracle", (req, res) => {
      const report = this.inhuman.generateBlindSpotOracleReport();
      res.json({ success: true, report });
    });

    // --- LAYER 1 — Beyond Perception ---
    this.app.post("/api/cognitive/layer1/unsaid", (req, res) => {
      const { text } = req.body;
      const list = this.inhuman.logDeletedMessageDraft(text);
      res.json({ success: true, list });
    });

    this.app.get("/api/cognitive/layer1/unsaid/analysis", (req, res) => {
      const analysis = this.inhuman.getUnsaidWordsAnalysis();
      res.json({ success: true, analysis });
    });

    this.app.get("/api/cognitive/layer1/parallel", (req, res) => {
      const conversation = this.inhuman.simulateParallelSelfConversation();
      res.json({ success: true, conversation });
    });

    this.app.post("/api/cognitive/layer1/reality", (req, res) => {
      const { statements } = req.body;
      const result = this.inhuman.detectRealityDistortion(statements || []);
      res.json({ success: true, result });
    });

    this.app.post("/api/cognitive/layer1/iceberg", (req, res) => {
      const { problem } = req.body;
      const iceberg = this.inhuman.analyzeIceberg(problem);
      res.json({ success: true, iceberg });
    });

    this.app.post("/api/cognitive/layer1/age", (req, res) => {
      const { vocabulary } = req.body;
      const age = this.inhuman.calculateCognitiveAge(vocabulary || []);
      res.json({ success: true, age });
    });

    // --- LAYER 2 — Beyond Memory ---
    this.app.post("/api/cognitive/layer2/mentors", (req, res) => {
      const { question, mentors } = req.body;
      const feedback = this.inhuman.consultMentorBoard(question, mentors);
      res.json({ success: true, feedback });
    });

    this.app.post("/api/cognitive/layer2/narrative", (req, res) => {
      const { statement } = req.body;
      const identities = this.inhuman.trackNarrativeIdentity(statement);
      res.json({ success: true, identities });
    });

    this.app.post("/api/cognitive/layer2/loops", (req, res) => {
      const { thought } = req.body;
      const loops = this.inhuman.detectUnfinishedLoops(thought);
      res.json({ success: true, loops });
    });

    this.app.post("/api/cognitive/layer2/palace", (req, res) => {
      const { topic, concepts } = req.body;
      const palace = this.inhuman.buildMemoryPalace(topic, concepts || []);
      res.json({ success: true, palace });
    });

    this.app.post("/api/cognitive/layer2/nostalgia", (req, res) => {
      const { pastTopic } = req.body;
      const report = this.inhuman.getAntiNostalgiaReport(pastTopic);
      res.json({ success: true, report });
    });

    // --- LAYER 3 — Beyond Intelligence ---
    this.app.post("/api/cognitive/layer3/chaos", (req, res) => {
      const { situation } = req.body;
      const lever = this.inhuman.getChaosLever(situation);
      res.json({ success: true, lever });
    });

    this.app.post("/api/cognitive/layer3/inversion", (req, res) => {
      const { goal } = req.body;
      const plan = this.inhuman.runInversionPlan(goal);
      res.json({ success: true, plan });
    });

    this.app.post("/api/cognitive/layer3/overton", (req, res) => {
      const { belief } = req.body;
      const shift = this.inhuman.shiftOvertonWindow(belief);
      res.json({ success: true, shift });
    });

    this.app.post("/api/cognitive/layer3/humility", (req, res) => {
      const { didChange } = req.body;
      const score = this.inhuman.scoreEpistemicHumility(didChange);
      res.json({ success: true, score });
    });

    this.app.post("/api/cognitive/layer3/signalnoise", (req, res) => {
      const { items } = req.body;
      const classification = this.inhuman.classifySignalVsNoise(items || []);
      res.json({ success: true, classification });
    });

    // --- LAYER 4 — Beyond Time ---
    this.app.post("/api/cognitive/layer4/check10", (req, res) => {
      const { decision } = req.body;
      const check = this.inhuman.run101010Check(decision);
      res.json({ success: true, check });
    });

    this.app.post("/api/cognitive/layer4/ledger", (req, res) => {
      const { area, hours, energy, ROI } = req.body;
      const ledger = this.inhuman.logLifeLedger(area, hours, energy, ROI);
      res.json({ success: true, ledger });
    });

    this.app.post("/api/cognitive/layer4/deathbed", (req, res) => {
      const { worry } = req.body;
      const filter = this.inhuman.filterDeathbedPerspective(worry);
      res.json({ success: true, filter });
    });

    this.app.get("/api/cognitive/layer4/momentum", (req, res) => {
      const momentum = this.inhuman.getMomentumStats();
      res.json({ success: true, momentum });
    });

    this.app.get("/api/cognitive/layer4/gratitude", (req, res) => {
      const gratitude = this.inhuman.getTemporalGratitude();
      res.json({ success: true, gratitude });
    });

    // --- LAYER 5 — Beyond Human ---
    this.app.post("/api/cognitive/layer5/premortem", (req, res) => {
      const { planName } = req.body;
      const preMortem = this.inhuman.runPreMortemAnalysis(planName);
      res.json({ success: true, preMortem });
    });

    this.app.get("/api/cognitive/layer5/emergence", (req, res) => {
      const emergence = this.inhuman.detectEmergence();
      res.json({ success: true, emergence });
    });

    this.app.post("/api/cognitive/layer5/destructor", (req, res) => {
      const { idea } = req.body;
      const destruction = this.inhuman.destroyIdea(idea);
      res.json({ success: true, destruction });
    });

    this.app.post("/api/cognitive/layer5/risks", (req, res) => {
      const { worries } = req.body;
      const ranked = this.inhuman.rankExistentialRisks(worries || []);
      res.json({ success: true, ranked });
    });

    this.app.get("/api/cognitive/layer5/identity", (req, res) => {
      const test = this.inhuman.runIdentityStressTest();
      res.json({ success: true, test });
    });

    // --- LAYER 6 — Truly Inhuman ---
    this.app.post("/api/cognitive/layer6/predict", (req, res) => {
      const { predictionText, probability } = req.body;
      const market = this.inhuman.logBehavioralPrediction(predictionText, probability);
      res.json({ success: true, market });
    });

    this.app.get("/api/cognitive/layer6/predictions", (req, res) => {
      const reports = this.inhuman.getPredictionMarketReports();
      res.json({ success: true, reports });
    });

    this.app.post("/api/cognitive/layer6/dissolve", (req, res) => {
      const { situation } = req.body;
      const rawRaw = this.inhuman.dissolveEgo(situation);
      res.json({ success: true, rawRaw });
    });

    this.app.get("/api/cognitive/layer6/feed", (req, res) => {
      const feed = this.inhuman.getCollectiveUnconsciousData();
      res.json({ success: true, feed });
    });

    this.app.post("/api/cognitive/layer6/final", (req, res) => {
      const { options } = req.body;
      const choice = this.inhuman.getFinalAnswer(options || []);
      res.json({ success: true, choice });
    });

    this.app.post("/api/cognitive/layer6/continuity", (req, res) => {
      const { belief } = req.body;
      const logs = this.inhuman.logContinuityStep(belief);
      res.json({ success: true, logs });
    });

    // Socket.IO for real-time chat
    this.io.on("connection", (socket) => {
      const sessionId = `web_${socket.id}`;
      console.log(`🌐 Web client connected: ${socket.id}`);

      // Send greeting
      socket.emit("message", {
        role: "assistant",
        content: getRandomGreeting(),
        timestamp: new Date().toISOString(),
      });

      // Send healer logs history & current status
      socket.emit("healer_history", {
        logs: this.healer ? this.healer.logs : [],
        status: this.healer ? (this.healer.isHealing ? "healing" : "idle") : "idle"
      });

      // Handle manual heal trigger
      socket.on("trigger_heal", (data) => {
        if (this.healer) {
          const errorText = data.errorText || "";
          this.healer.log("Manual trigger started by user...");
          const mockError = new Error(errorText || "Manual heal request");
          mockError.stack = errorText.includes("at ") ? errorText : `Error: Manual heal\n    at manual_trigger (src/core/llm.js:1:1)`;
          this.healer.reportError(mockError);
        }
      });

      // Handle chat messages
      socket.on("chat", async (data) => {
        const { message, image, mimeType, voiceId, options } = data;
        if (!message?.trim() && !image) return;

        // Direct slash command handler for /weather
        if (message && message.trim().startsWith("/weather")) {
          const city = message.replace("/weather", "").trim();
          if (!city) {
            socket.emit("stream", { content: "🌦️ Please provide a city name, e.g., `/weather Mumbai`" });
            socket.emit("stream_end", {
              role: "assistant",
              content: "🌦️ Please provide a city name, e.g., `/weather Mumbai`",
              timestamp: new Date().toISOString()
            });
            return;
          }
          socket.emit("typing", true);
          try {
            const { executeTool } = await import("../core/tools.js");
            const weatherResult = await executeTool("get_weather", { city });
            socket.emit("stream", { content: weatherResult });
            socket.emit("stream_end", {
              role: "assistant",
              content: weatherResult,
              timestamp: new Date().toISOString()
            });
            addMessage("web", sessionId, "user", message);
            addMessage("web", sessionId, "assistant", weatherResult);
          } catch (err) {
            socket.emit("stream", { content: `🌦️ Failed to fetch weather for ${city}` });
            socket.emit("stream_end", {
              role: "assistant",
              content: `🌦️ Failed to fetch weather for ${city}`,
              timestamp: new Date().toISOString()
            });
          }
          socket.emit("typing", false);
          return;
        }

        let finalMessage = message || "";

        // 1. AI Firewall Prompt Injection Scan
        const scan = this.firewall.scanPrompt(finalMessage);
        if (scan.blocked) {
          socket.emit("stream", { content: `⚠️ Alisa AI Firewall Blocked: Prompt injection pattern detected (${scan.score}% threat level).` });
          socket.emit("stream_end", {
            role: "assistant",
            content: `⚠️ Alisa AI Firewall Blocked: Prompt injection pattern detected (${scan.score}% threat level).`,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // 2. Intelligent Cost Router
        const routing = this.router.routeTask(finalMessage, options?.routingMode);
        socket.emit("security_routing", {
          optimalModel: routing.optimalModel,
          estimatedLatency: routing.estimatedLatency,
          estimatedCostUSD: routing.estimatedCostUSD,
          accumulatedStats: routing.accumulatedStats
        });
        
        // 1. Process Slash Commands & Custom Macros
        const triggerResult = this.workflows.processPromptTriggers(finalMessage);
        finalMessage = triggerResult.prompt;
        
        // 2. Cognitive Mirror profiling
        const dominantStyle = this.cognitiveMirror.detectStyleAndProfile(finalMessage);
        
        // 3. Contradiction Tracking (Check against First Principles stored in habits/relationships)
        const principles = this.memoryEngine.getCognitiveDb().habits.map(h => h.habit);
        const contradictions = this.cognitiveMirror.trackBeliefsAndContradictions(finalMessage, principles);
        
        // 4. Decision Fatigue warning
        const isFatigued = this.fatigueDetector.recordQuery(finalMessage);

        // 5. Long-Term Semantic Memory Auto-extraction & Recall
        this.memoryEngine.autoExtractSemanticFacts(finalMessage);
        const recalledFacts = this.memoryEngine.querySemanticMemory(finalMessage, 3);

        // 6. Reward XP for analytical exploration & thinking
        const xpResult = this.experimental.rewardUserXP(finalMessage);
        socket.emit("xp_earned", xpResult);

        const history = getHistory("web", sessionId);

        // Prepend custom prompt modifiers if command trigger was used
        if (triggerResult.modeModifier) {
          finalMessage = triggerResult.modeModifier + finalMessage;
        }

        // Send cognitive context details to frontend for the Monologue Accordion
        socket.emit("cognitive_state", {
          dominantStyle,
          fatigueAlert: isFatigued,
          contradictionCount: contradictions.length,
          contradictionMsg: contradictions.join(", ") || null
        });

        // Stream response
        let fullResponse = "";
        socket.emit("typing", true);

        try {
          if (image && mimeType) {
            const description = await this.llm.analyzeImage(image, mimeType);
            finalMessage = `[User attached an image. Optic Nerve description: ${description}]\n\nUser message: ${finalMessage}`;
          }

          fullResponse = await this.llm.chatStream(history, finalMessage, (chunk) => {
            socket.emit("stream", { content: chunk });
          }, { ...(options || {}), recalledFacts });

          addMessage("web", sessionId, "user", finalMessage);
          addMessage("web", sessionId, "assistant", fullResponse);

          socket.emit("stream_end", {
            role: "assistant",
            content: fullResponse,
            timestamp: new Date().toISOString(),
          });

          // Generate and emit voice audio if a voice match is found
          const voiceMatch = fullResponse.match(/<voice>([\s\S]*?)<\/voice>/i);
          if (voiceMatch) {
            const spokenText = voiceMatch[1].trim();
            try {
              const audioPath = await generateTTS(spokenText, voiceId);
              if (audioPath) {
                const filename = path.basename(audioPath);
                socket.emit("voice", { url: `/temp/${filename}` });
              }
            } catch (err) {
              console.error("Failed to generate TTS for web socket:", err.message);
            }
          }

          // Calculate and emit experimental mind metrics
          const confidence = this.experimental.calculateConfidenceScore(fullResponse);
          const bias = this.experimental.detectResponseBias(fullResponse);
          const gap = this.experimental.detectKnowledgeGaps(finalMessage);
          socket.emit("experimental_metrics", { confidence, bias, gap });


        } catch (error) {
          console.error("❌ Web Chat Stream error:", error);
          socket.emit("stream_end", {
            role: "assistant",
            content: "✨ Something went wrong. Could you check my Groq API keys?",
            timestamp: new Date().toISOString(),
          });
        }

        socket.emit("typing", false);
      });

      // Handle clear history
      socket.on("clear", () => {
        clearHistory("web", sessionId);
        socket.emit("cleared");
        socket.emit("message", {
          role: "assistant",
          content: "✨ Memory cleared. What shall we work on?",
          timestamp: new Date().toISOString(),
        });
      });

      // Handle setting mood
      socket.on("set_mood", (data) => {
        if (data && data.mood) {
          this.llm.mood = data.mood;
          console.log(`🎭 Web client changed Alisa's mood to: ${data.mood}`);
        }
      });

      // Handle custom lore save
      socket.on("save_lore", (data) => {
        if (data && typeof data.lore === "string") {
          this.llm.customLore = data.lore;
          console.log(`📜 Web client updated Alisa's custom system lore.`);
        }
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`🌐 Web client disconnected: ${socket.id}`);
      });
    });

    return new Promise((resolve) => {
      const startServer = (currentPort) => {
        this.server.listen(currentPort, "0.0.0.0", () => {
          this.isReady = true;
          this.config.port = currentPort; // Update config if port changed
          console.log(`\n✨ Web Dashboard: http://localhost:${currentPort}`);
          console.log(`   ${SERVICE_CONNECT_MESSAGES.web}\n`);
          resolve(true);
        }).on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`  ⚠️ Port ${currentPort} is busy (probably an old tab). Trying port ${currentPort + 1}...`);
            startServer(currentPort + 1);
          } else {
            console.error("Web server error:", err);
            resolve(false);
          }
        });
      };
      startServer(port);
    });
  }

  getStatus() { return { platform: "web", connected: this.isReady, port: this.config.port || 3000 }; }
  async stop() { if (this.server) { this.server.close(); this.isReady = false; } }
}
