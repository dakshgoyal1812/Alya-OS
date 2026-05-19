// ============================================================
// ⚙️ AI Workflow Automation Engine (Zapier/n8n Competitor Core)
// Manages trigger hooks, action execution chains, and scheduling.
// ============================================================

import fs from "fs";
import path from "path";

const WORKFLOWS_FILE = path.join(process.cwd(), "data", "workflows.json");

export class AutomationEngine {
  constructor(llmInstance) {
    this.llm = llmInstance;
    this._loadWorkflows();
  }

  _loadWorkflows() {
    try {
      const dataDir = path.dirname(WORKFLOWS_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

      if (fs.existsSync(WORKFLOWS_FILE)) {
        this.workflows = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, "utf8"));
      } else {
        this.workflows = [
          {
            id: 1,
            name: "Morning News Digest",
            trigger: "Every morning at 8:00 AM",
            actions: ["Fetch Tech News", "Format newsletter using AI", "Push notification to discord"],
            active: true
          },
          {
            id: 2,
            name: "System Spec Guard",
            trigger: "RAM usage > 90%",
            actions: ["Generate backup", "Trigger storage cleanup script", "Alert client"],
            active: false
          }
        ];
        this._saveWorkflows();
      }
    } catch (e) {
      this.workflows = [];
    }
  }

  _saveWorkflows() {
    try {
      fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(this.workflows, null, 2));
    } catch (e) {
      console.error("Failed to save workflows:", e.message);
    }
  }

  getWorkflows() {
    this._loadWorkflows();
    return this.workflows;
  }

  createWorkflow(name, trigger, actions) {
    const newWorkflow = {
      id: Date.now(),
      name,
      trigger,
      actions: Array.isArray(actions) ? actions : [actions],
      active: true
    };
    this.workflows.push(newWorkflow);
    this._saveWorkflows();
    return newWorkflow;
  }

  toggleWorkflow(id, active) {
    this.workflows = this.workflows.map(w => {
      if (Number(w.id) === Number(id)) {
        return { ...w, active: !!active };
      }
      return w;
    });
    this._saveWorkflows();
    return true;
  }

  deleteWorkflow(id) {
    this.workflows = this.workflows.filter(w => Number(w.id) !== Number(id));
    this._saveWorkflows();
    return true;
  }

  /**
   * Executes a workflow execution chain.
   */
  async triggerWorkflow(id, onActionStep) {
    const workflow = this.workflows.find(w => Number(w.id) === Number(id));
    if (!workflow) throw new Error("Workflow not found");

    console.log(`🚀 Executing workflow: ${workflow.name}`);
    
    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];
      if (onActionStep) onActionStep({ step: i + 1, total: workflow.actions.length, action, status: "pending" });
      
      // Simulate real-world execution delay
      await new Promise(r => setTimeout(r, 1200));

      if (onActionStep) onActionStep({ step: i + 1, total: workflow.actions.length, action, status: "done" });
    }

    return `Workflow "${workflow.name}" completed successfully.`;
  }
}
