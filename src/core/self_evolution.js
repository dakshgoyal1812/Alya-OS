import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { LLMEngine } from "./llm.js";
import { fileURLToPath } from "url";

const WISHLIST_FILE = path.join(process.cwd(), "data", "evolution_wishlist.json");

export class SelfEvolutionEngine {
  constructor() {
    this.llm = new LLMEngine();
    this.isEvolving = false;
    
    if (!fs.existsSync(path.dirname(WISHLIST_FILE))) {
      fs.mkdirSync(path.dirname(WISHLIST_FILE), { recursive: true });
    }
    if (!fs.existsSync(WISHLIST_FILE)) {
      fs.writeFileSync(WISHLIST_FILE, JSON.stringify([
        {
          id: "tool_crypto_news",
          title: "Crypto News Analyzer",
          description: "A tool to search the web for recent cryptocurrency news, analyze the sentiment (Bullish/Bearish), and summarize it for traders.",
          status: "pending"
        },
        {
          id: "tool_fact_checker",
          title: "AI Fact Checker",
          description: "A tool that cross-checks any user claim against multiple top search results to verify its accuracy and provide sources.",
          status: "pending"
        },
        {
          id: "tool_github_tracker",
          title: "GitHub Repository Tracker",
          description: "A tool to fetch recent commits, issues, and releases from a specified GitHub repo to keep developers updated.",
          status: "pending"
        },
        {
          id: "tool_password_generator",
          title: "Secure Password and Phrase Generator",
          description: "A tool to generate highly secure cryptographic passwords or memorable passphrases with customizable complexity.",
          status: "pending"
        },
        {
          id: "tool_dictionary",
          title: "Etymology & Dictionary Search",
          description: "A tool to retrieve word definitions, synonyms, antonyms, and historical etymology from public APIs.",
          status: "pending"
        }
      ], null, 2));
    }
  }

  log(message) {
    console.log(`🧬 [Self-Evolution] ${message}`);
  }

  /**
   * Run the daily self-evolution process.
   * Scans wishlist, picks one pending feature, builds it, tests it, and pushes it to git.
   */
  async runEvolution() {
    if (this.isEvolving) {
      this.log("Evolution cycle is already running.");
      return;
    }
    this.isEvolving = true;
    this.log("Starting autonomous self-evolution cycle...");

    try {
      const wishlist = JSON.parse(fs.readFileSync(WISHLIST_FILE, "utf8"));
      const nextFeature = wishlist.find(f => f.status === "pending");

      if (!nextFeature) {
        this.log("🎉 No pending features in wishlist! Alya is fully evolved.");
        this.isEvolving = false;
        return;
      }

      this.log(`🎯 Selected Feature to implement: "${nextFeature.title}"`);
      this.log(`📝 Description: ${nextFeature.description}`);

      // Read tools.js to inject the new tool
      const toolsFilePath = path.join(process.cwd(), "src", "core", "tools.js");
      if (!fs.existsSync(toolsFilePath)) {
        throw new Error("tools.js not found in expected path");
      }
      const toolsContent = fs.readFileSync(toolsFilePath, "utf8");

      // Summon LLM to write the new tool function and add its schema definition
      const prompt = `You are Alya's Self-Evolution Engine. Your task is to implement a new feature/tool in Alya's tools file.
Here is the feature description:
Title: ${nextFeature.title}
Description: ${nextFeature.description}

You must write:
1. The tool schema definition (to append to "availableTools" array).
2. The implementation case in the switch-statement of "executeTool" function.

Here is the existing tools.js code:
--- START OF TOOLS.JS ---
${toolsContent}
--- END OF TOOLS.JS ---

Generate the COMPLETE, modified tools.js file with this new tool perfectly integrated.
Ensure the code is valid ES Module JS syntax, doesn't contain errors, and preserves all existing tools and comments.
Do not wrap your output in markdown code blocks. Output ONLY the raw JS code of the entire file.`;

      this.log("🧠 Summoning LLM to write the feature code...");
      const updatedCode = await this.llm.generate(prompt);

      // Clean the response
      let cleanedCode = updatedCode;
      if (cleanedCode.startsWith("```javascript")) {
        cleanedCode = cleanedCode.substring(13);
      } else if (cleanedCode.startsWith("```js")) {
        cleanedCode = cleanedCode.substring(5);
      }
      if (cleanedCode.endsWith("```")) {
        cleanedCode = cleanedCode.substring(0, cleanedCode.length - 3);
      }
      cleanedCode = cleanedCode.trim();

      // Backup tools.js
      const backupPath = toolsFilePath + ".bak";
      fs.writeFileSync(backupPath, toolsContent, "utf8");
      this.log("💾 Backup of tools.js created.");

      // Write updated code
      fs.writeFileSync(toolsFilePath, cleanedCode, "utf8");
      this.log("💾 New tools.js code written. Validating syntax...");

      // Validate syntax
      const syntaxOk = await this.verifySyntax(toolsFilePath);
      if (!syntaxOk) {
        this.log("❌ Code validation failed! Reverting to backup.");
        fs.writeFileSync(toolsFilePath, toolsContent, "utf8");
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        this.isEvolving = false;
        return;
      }

      this.log("✅ Syntax validation passed! Feature successfully implemented.");
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

      // Mark feature as completed in wishlist
      nextFeature.status = "completed";
      nextFeature.completedAt = new Date().toISOString();
      fs.writeFileSync(WISHLIST_FILE, JSON.stringify(wishlist, null, 2), "utf8");

      // Push to Git
      this.log("🚀 Pushing new feature to GitHub...");
      await this.pushToGit(nextFeature.title);

      // Notify the user on bridges
      await this.notifyUser(nextFeature.title, nextFeature.description);

      this.log("🎉 Self-evolution cycle completed successfully!");
    } catch (err) {
      this.log(`❌ Self-evolution crashed: ${err.message}`);
    } finally {
      this.isEvolving = false;
    }
  }

  verifySyntax(filePath) {
    return new Promise((resolve) => {
      exec(`node -c "${filePath}"`, (err) => {
        if (err) resolve(false);
        else resolve(true);
      });
    });
  }

  pushToGit(featureTitle) {
    return new Promise((resolve) => {
      const commitMsg = `feat(self-evolution): autonomously added feature - ${featureTitle} 🧬🚀`;
      exec(`git add . && git commit -m "${commitMsg}" && git push origin main`, (err, stdout, stderr) => {
        if (err) {
          this.log(`⚠️ Git push failed: ${stderr || err.message}`);
          resolve(false);
        } else {
          this.log("📦 Git commit and push completed successfully!");
          resolve(true);
        }
      });
    });
  }

  async notifyUser(title, description) {
    const message = `🧬 *[Alya Self-Evolution Notice]* 🚀\n\nHey there! I have autonomously designed, tested, and implemented a new feature for myself!\n\n*Feature Added:* ${title}\n*Description:* ${description}\n\nThis code has been successfully verified and pushed to your GitHub repository!`;
    
    // Send to Telegram if active
    if (global.bridges && global.bridges.telegram && global.bridges.telegram.isReady) {
      try {
        const automations = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "automations.json"), "utf8"));
        // Find the last active chat from automation database or default to global broadcast if possible
        // (Typically we broadcast to the last active conversation chat ID)
        const conversationsDir = path.join(process.cwd(), "data", "conversations");
        if (fs.existsSync(conversationsDir)) {
          const files = fs.readdirSync(conversationsDir).filter(f => f.startsWith("telegram_"));
          for (const file of files) {
            const chatId = file.replace("telegram_", "").replace(".json", "");
            await global.bridges.telegram.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
          }
        }
      } catch (e) {
        console.error("Failed to notify user on Telegram:", e.message);
      }
    }

    // Send to WhatsApp if active
    if (global.bridges && global.bridges.whatsapp && global.bridges.whatsapp.isReady) {
      try {
        const conversationsDir = path.join(process.cwd(), "data", "conversations");
        if (fs.existsSync(conversationsDir)) {
          const files = fs.readdirSync(conversationsDir).filter(f => f.startsWith("whatsapp_"));
          for (const file of files) {
            const chatId = file.replace("whatsapp_", "").replace(".json", "");
            await global.bridges.whatsapp.client.sendMessage(chatId, message);
          }
        }
      } catch (e) {
        console.error("Failed to notify user on WhatsApp:", e.message);
      }
    }
  }
}

const entryFile = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
const thisFile = fileURLToPath(import.meta.url);
if (entryFile && (thisFile === entryFile || fs.realpathSync(thisFile) === entryFile)) {
  console.log("🧬 Starting Alya Autonomous Self-Evolution Loop...");
  const evolution = new SelfEvolutionEngine();
  evolution.runEvolution().then(() => {
    console.log("🧬 Evolution process completed.");
    process.exit(0);
  }).catch((err) => {
    console.error("🧬 Evolution process crashed:", err);
    process.exit(1);
  });
}
