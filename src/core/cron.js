import cron from "node-cron";
import fs from "fs";
import path from "path";
import { LLMEngine } from "./llm.js";
import { getHistory, addMessage } from "./memory.js";
import { SelfEvolutionEngine } from "./self_evolution.js";
import { EmailAutopilot } from "./email_agent.js";

const AUTOMATION_FILE = path.join(process.cwd(), "data", "automations.json");

if (!fs.existsSync(path.join(process.cwd(), "data"))) {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}
if (!fs.existsSync(AUTOMATION_FILE)) {
  fs.writeFileSync(AUTOMATION_FILE, JSON.stringify([]));
}

// Global active cron jobs
const activeJobs = {};
let llmInstance = null;

/**
 * Initializes and starts all saved cron jobs.
 */
export function startCronJobs(bridges) {
  llmInstance = new LLMEngine();
  
  // Schedule Alya's Daily Self-Evolution Cycle at midnight
  const evolution = new SelfEvolutionEngine();
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("🧬 [Self-Evolution] Initiating scheduled evolution cycle...");
      await evolution.runEvolution();
    } catch (err) {
      console.error("❌ [Self-Evolution] Scheduled cycle crashed:", err.message);
    }
  });
  console.log("🧬 [Self-Evolution] Scheduled daily self-evolution loop at midnight.");

  // Schedule Email Inbox Autopilot (every 15 minutes)
  const emailAgent = new EmailAutopilot();
  cron.schedule("*/15 * * * *", async () => {
    try {
      console.log("✉️ [Inbox-Autopilot] Checking inbox...");
      await emailAgent.checkInbox();
    } catch (err) {
      console.error("❌ [Inbox-Autopilot] Scheduled check failed:", err.message);
    }
  });
  console.log("✉️ [Inbox-Autopilot] Scheduled inbox checking every 15 minutes.");
  
  const automations = JSON.parse(fs.readFileSync(AUTOMATION_FILE, "utf-8"));
  console.log(`\n⚙️  Workflow Automation: Starting ${automations.length} background jobs...`);
  
  for (const job of automations) {
    scheduleJob(job, bridges);
  }
}

/**
 * Schedules a single job dynamically
 */
export function scheduleJob(job, bridges) {
  if (activeJobs[job.id]) {
    activeJobs[job.id].stop(); // Stop existing if we are updating
  }

  console.log(`   -> [Scheduled]: "${job.name}" running on schedule: ${job.cron_expression}`);

  activeJobs[job.id] = cron.schedule(job.cron_expression, async () => {
    console.log(`\n⚙️ [AUTOMATION TRIGGERED]: ${job.name}`);
    
    // Simulate a background thought process
    const history = getHistory("automation", job.id);
    
    try {
      const response = await llmInstance.chat(history, `[BACKGROUND AUTOMATION TRIGGERED: ${job.name}]\n\nInstruction: ${job.prompt}\n\nPlease execute this task using your tools. If you need to send a message to the user, DO NOT reply here. Use the 'send_whatsapp_message' tool to text the user.`);
      
      // Save memory of execution
      addMessage("automation", job.id, "user", `[Automated Trigger: ${job.name}]`);
      addMessage("automation", job.id, "assistant", response);
      
      console.log(`⚙️ [AUTOMATION COMPLETE]: ${job.name}`);
    } catch (err) {
      console.error(`❌ [AUTOMATION FAILED]: ${job.name} - ${err.message}`);
    }
  });
}

/**
 * Adds a new automation job and saves it.
 */
export function addAutomationJob(name, schedule, prompt, bridges) {
  const automations = JSON.parse(fs.readFileSync(AUTOMATION_FILE, "utf-8"));
  
  const newJob = {
    id: `cron_${Date.now()}`,
    name,
    cron_expression: schedule,
    prompt,
    created_at: new Date().toISOString()
  };
  
  automations.push(newJob);
  fs.writeFileSync(AUTOMATION_FILE, JSON.stringify(automations, null, 2));
  
  if (bridges) {
    scheduleJob(newJob, bridges);
  }
  
  return newJob;
}
