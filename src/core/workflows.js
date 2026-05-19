// ============================================================
// ⚙️ Custom Slash Commands, Macro Chains, and Template Builders
// ============================================================

import fs from "fs";
import path from "path";

const WORKFLOWS_STATE_FILE = path.join(process.cwd(), "data", "custom_commands.json");

export class WorkflowSuperpowersManager {
  constructor() {
    this.state = this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(WORKFLOWS_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(WORKFLOWS_STATE_FILE, "utf8"));
      }
    } catch (e) {}
    return {
      slashCommands: [
        { trigger: "/roast", prompt: "[MODE: ROAST] Critically evaluate this draft concept and roast its defects:" },
        { trigger: "/socratic", prompt: "[MODE: SOCRATIC] Guide the user using only questions without direct answers:" },
        { trigger: "/mentor", prompt: "[MODE: MENTOR] Respond like a world-class startup founder and code architect:" }
      ],
      macros: [
        { name: "Code Review Chain", steps: ["Audit code syntax", "Refactor for speed", "Generate test cases"] }
      ]
    };
  }

  _saveState() {
    try {
      const dir = path.dirname(WORKFLOWS_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(WORKFLOWS_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {}
  }

  registerSlashCommand(trigger, prompt) {
    // Ensure starts with '/'
    const cleanTrigger = trigger.startsWith("/") ? trigger : `/${trigger}`;
    this.state.slashCommands = this.state.slashCommands.filter(c => c.trigger !== cleanTrigger);
    this.state.slashCommands.push({ trigger: cleanTrigger, prompt });
    this._saveState();
    return this.state.slashCommands;
  }

  registerMacro(name, steps) {
    this.state.macros = this.state.macros.filter(m => m.name !== name);
    this.state.macros.push({ name, steps });
    this._saveState();
    return this.state.macros;
  }

  /**
   * Expand command triggers in prompt text
   */
  processPromptTriggers(text) {
    let cleanText = text;
    let modeModifier = "";

    this.state.slashCommands.forEach(cmd => {
      if (text.startsWith(cmd.trigger)) {
        modeModifier = cmd.prompt + "\n";
        cleanText = text.replace(cmd.trigger, "").trim();
      }
    });

    return { prompt: cleanText, modeModifier };
  }

  /**
   * Formats specialized templates
   */
  static getMeetingPrepPrompt(topic) {
    return `Generate key meeting preparation deliverables for the topic: "${topic}". Include list of potential questions to ask, risk metrics, and draft talking points.`;
  }

  static getEmailGhostPrompt(receivedEmail, toneOption) {
    return `Compose the perfect email reply based on this received message:
Received: "${receivedEmail}"
Tone direction: "${toneOption}"
Make it clear, punchy, and professional.`;
  }
}
