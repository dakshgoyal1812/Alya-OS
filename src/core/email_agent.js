import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import fs from "fs";
import path from "path";
import { loadConfig } from "./config.js";
import { LLMEngine } from "./llm.js";

const LAST_CHECKED_FILE = path.join(process.cwd(), "data", "last_email_uid.json");

export class EmailAutopilot {
  constructor() {
    this.llm = new LLMEngine();
  }

  log(message) {
    console.log(`✉️ [Inbox-Autopilot] ${message}`);
  }

  async checkInbox() {
    const config = loadConfig();
    if (!config.email || !config.email.enabled || !config.email.user || !config.email.pass) {
      this.log("Email credentials not fully configured in config.json. Skipping check.");
      return;
    }

    const cleanPass = config.email.pass.replace(/\s+/g, "");
    const isGmail = (config.email.service || "gmail").toLowerCase() === "gmail" || config.email.user.endsWith("@gmail.com");

    const imapConfig = {
      imap: {
        user: config.email.user,
        password: cleanPass,
        host: isGmail ? "imap.gmail.com" : (config.email.imapHost || "imap.gmail.com"),
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    try {
      this.log(`Connecting to inbox: ${config.email.user}...`);
      const connection = await imaps.connect(imapConfig);
      await connection.openBox("INBOX");

      // Search for unseen messages
      const searchCriteria = ["UNSEEN"];
      const fetchOptions = {
        bodies: ["HEADER", "TEXT", ""],
        markSeen: true
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      this.log(`Found ${messages.length} unread email(s).`);

      for (const message of messages) {
        const all = message.parts.find(part => part.which === "");
        const id = message.attributes.uid;

        if (all && all.body) {
          const parsed = await simpleParser(all.body);
          const from = parsed.from?.text || "Unknown";
          const subject = parsed.subject || "(No Subject)";
          const text = parsed.text || parsed.html || "(No Content)";

          this.log(`Processing email ID ${id} from "${from}" - Subject: "${subject}"`);

          // Analyze email with LLM
          const prompt = `You are Alya's Inbox Autopilot. An email has arrived. Analyze its urgency, summarize it, and draft a response.
          
          --- EMAIL DETAILS ---
          From: ${from}
          Subject: ${subject}
          Content:
          ${text.substring(0, 4000)}
          
          --- RESPONSE FORMAT ---
          Output a raw, valid JSON object with the following keys:
          {
            "urgency": "high" | "medium" | "low",
            "summary": "1-2 sentence summary of the email",
            "category": "personal" | "work" | "spam" | "billing",
            "draftResponse": "A highly professional and helpful draft reply if a reply is needed, otherwise leave empty."
          }`;

          const analysisText = await this.llm.generate(prompt);
          let analysis = { urgency: "low", summary: "Parsed email", category: "personal", draftResponse: "" };
          try {
            const cleanedJson = analysisText.replace(/```json/g, "").replace(/```/g, "").trim();
            analysis = JSON.parse(cleanedJson);
          } catch (e) {
            this.log("Failed to parse LLM analysis JSON: " + analysisText);
          }

          // If it's a medium or high urgency, send alerts to the user
          if (analysis.urgency === "high" || analysis.urgency === "medium") {
            await this.alertUser(from, subject, analysis);
          }
        }
      }

      connection.end();
      this.log("Inbox check complete.");
    } catch (err) {
      this.log(`Error checking inbox: ${err.message}`);
    }
  }

  async alertUser(from, subject, analysis) {
    const alertMessage = `✉️ *[Alya Inbox Autopilot Alert]* 🚨\n\n` +
      `*From:* ${from}\n` +
      `*Subject:* ${subject}\n` +
      `*Urgency:* ${analysis.urgency.toUpperCase()}\n` +
      `*Category:* ${analysis.category.toUpperCase()}\n` +
      `*Summary:* ${analysis.summary}\n\n` +
      (analysis.draftResponse ? `*Draft Response:* \n_"${analysis.draftResponse}"_\n\n_Type 'approve email ${analysis.category}' to send this reply._` : `_No reply needed._`);

    // Send to Telegram if active
    if (global.bridges && global.bridges.telegram && global.bridges.telegram.isReady) {
      try {
        const conversationsDir = path.join(process.cwd(), "data", "conversations");
        if (fs.existsSync(conversationsDir)) {
          const files = fs.readdirSync(conversationsDir).filter(f => f.startsWith("telegram_"));
          for (const file of files) {
            const chatId = file.replace("telegram_", "").replace(".json", "");
            await global.bridges.telegram.bot.sendMessage(chatId, alertMessage, { parse_mode: "Markdown" });
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
            await global.bridges.whatsapp.client.sendMessage(chatId, alertMessage);
          }
        }
      } catch (e) {
        console.error("Failed to notify user on WhatsApp:", e.message);
      }
    }
  }
}
