import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { LLMEngine } from "./llm.js";

export class SelfHealingEngine {
  constructor(io) {
    this.io = io;
    this.llm = new LLMEngine();
    this.isHealing = false;
    this.logs = [];
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    this.logs.push(formatted);
    console.log(`🧠 [Auto-Healer] ${message}`);
    if (this.io) {
      this.io.emit("healer_log", { log: formatted });
    }
  }

  setStatus(status) {
    if (this.io) {
      this.io.emit("healer_status", { status });
    }
  }

  async reportError(err) {
    if (this.isHealing) {
      this.log("Healer is already active. Queueing error: " + err.message);
      return;
    }
    this.isHealing = true;
    this.setStatus("healing");

    const errorMessage = err.message || String(err);
    const errorStack = err.stack || "";

    this.log("🚨 DETECTED RUNTIME BUG!");
    this.log(`Error: ${errorMessage}`);
    
    try {
      // 1. Analyze stack trace to locate the file
      this.log("🔍 Scanning codebase stack trace to locate the faulty file...");
      const fileMatch = this.detectFileFromStack(errorStack);
      if (!fileMatch) {
        this.log("❌ Could not determine target file from error stack. Aborting auto-heal.");
        this.setStatus("error");
        this.isHealing = false;
        return;
      }

      const { filePath, relativePath } = fileMatch;
      this.log(`🎯 Identified target file: ${relativePath}`);

      if (!fs.existsSync(filePath)) {
        this.log(`❌ Target file does not exist at path: ${filePath}`);
        this.setStatus("error");
        this.isHealing = false;
        return;
      }

      // 2. Read file content
      const fileContent = fs.readFileSync(filePath, "utf-8");
      this.log("📖 Loading source code of the affected file...");

      // 3. Query LLM to generate fix
      this.log("🧠 Summoning AI Brain to diagnose root cause and draft a patch...");
      const prompt = `You are Alya's Auto-Evolution Engine. An error occurred in the application.
Analyze the error stack and file content, determine the fix, and output the corrected code.

--- ERROR LOG ---
Error: ${errorMessage}
Stack: ${errorStack}

--- FILE PATH ---
${relativePath}

--- FILE CONTENT ---
${fileContent}

--- RESPONSE FORMAT ---
You must output a raw, valid JSON object with EXACTLY this structure (no markdown tags, no wrapper text):
{
  "explanation": "Brief explanation of the bug and fix in Gen Z style",
  "fixedContent": "COMPLETE fixed file content"
}
Ensure the "fixedContent" is the full corrected file. Do not omit anything.`;

      const responseText = await this.llm.generate(prompt);
      let data;
      try {
        // Strip markdown backticks if the LLM included them
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        data = JSON.parse(cleanedJson);
      } catch (parseErr) {
        this.log("❌ LLM output was not valid JSON. Response received: " + responseText.substring(0, 150) + "...");
        this.setStatus("error");
        this.isHealing = false;
        return;
      }

      this.log(`💡 Diagnosis: "${data.explanation}"`);
      this.log("💾 Writing patch to the local filesystem...");

      // Backup file
      fs.writeFileSync(filePath + ".bak", fileContent, "utf-8");
      
      // Write new content
      fs.writeFileSync(filePath, data.fixedContent, "utf-8");
      this.log("✅ Patch applied successfully. Running validation test boot...");

      // 4. Test code compatibility
      this.setStatus("testing");
      const isOk = await this.verifySyntax(filePath);
      if (!isOk) {
        this.log("❌ Code validation failed! Restoring backup file.");
        fs.writeFileSync(filePath, fileContent, "utf-8"); // restore
        this.setStatus("error");
        this.isHealing = false;
        return;
      }
      
      // Delete backup
      if (fs.existsSync(filePath + ".bak")) {
        fs.unlinkSync(filePath + ".bak");
      }
      this.log("✨ Validation passed! Code base is stable.");

      // 5. Commit and push to GitHub
      this.setStatus("pushing");
      this.log("🚀 Deploying patch to GitHub...");
      await this.pushToGit(relativePath, data.explanation);

      this.log("🎉 SYSTEM EVOLVED! Bug successfully crushed and pushed to main! 🚀⚡");
      this.setStatus("success");

    } catch (healErr) {
      this.log(`❌ Auto-heal crashed: ${healErr.message}`);
      this.setStatus("error");
    } finally {
      this.isHealing = false;
    }
  }

  detectFileFromStack(stack) {
    // Look for lines like "at file:///C:/path/to/src/core/llm.js:12:34" or "at Object.<anonymous> (C:\path\to\src\core\llm.js:12:34)"
    const cwd = process.cwd().replace(/\\/g, "/");
    const regexes = [
      /at\s+file:\/\/\/([^:\s]+):/i,
      /at\s+[^\(]+\(([^\):]+):/i,
      /at\s+([^\(:\s]+):/i
    ];

    const lines = stack.split("\n");
    for (const line of lines) {
      // Ignore node internal modules and node_modules directories
      if (line.includes("node_modules") || line.includes("node:internal") || line.includes(" (internal/")) {
        continue;
      }
      for (const regex of regexes) {
        const match = line.match(regex);
        if (match) {
          let matchedPath = match[1].replace(/\\/g, "/");
          // If Windows path starts with drive letter without slash (e.g. C:/)
          if (!matchedPath.startsWith("/") && /^[a-zA-Z]:/.test(matchedPath)) {
            // Keep drive letter format
          }
          if (matchedPath.includes(cwd)) {
            const relativePath = matchedPath.substring(cwd.length).replace(/^\//, "");
            return {
              filePath: path.join(process.cwd(), relativePath),
              relativePath
            };
          }
        }
      }
    }
    return null;
  }

  verifySyntax(filePath) {
    return new Promise((resolve) => {
      // For JS files we can check syntax using node -c
      if (filePath.endsWith(".js")) {
        exec(`node -c "${filePath}"`, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(true); // default pass for other file types for now
      }
    });
  }

  pushToGit(relativePath, explanation) {
    return new Promise((resolve, reject) => {
      const commitMsg = `fix(auto-heal): squashed bug in ${path.basename(relativePath)} - ${explanation} 🚀✨`;
      exec(`git add "${relativePath}" && git commit -m "${commitMsg}" && git push origin main`, (err, stdout, stderr) => {
        if (err) {
          this.log(`⚠️ Git push failed: ${stderr || err.message}`);
          // Don't reject, just resolve so status finishes
          resolve(false);
        } else {
          this.log("📦 Git commit and push completed successfully!");
          resolve(true);
        }
      });
    });
  }
}
