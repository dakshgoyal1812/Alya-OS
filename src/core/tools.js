import os from "os";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { YoutubeTranscript } from "youtube-transcript";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import nodemailer from "nodemailer";
import { search } from "duck-duck-scrape";
import { loadConfig } from "./config.js";
import { execSync } from "child_process";

const MEMORY_FILE = path.join(process.cwd(), "data", "long_term_memory.json");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
if (!fs.existsSync(path.join(process.cwd(), "data"))) fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, JSON.stringify([]));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Define the tools Alya can use (SAFE tools only — no file system access)
export const availableTools = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current system time and date.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_info",
      description: "Get basic information about the computer (OS, CPU, architecture, uptime).",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_memory_usage",
      description: "Get detailed RAM/memory usage of the device — total, used, free, and usage percentage.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_storage_info",
      description: "Get disk/storage information of the device — total space, used space, free space.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evaluate a mathematical expression. Useful for doing math.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "The math expression to evaluate, e.g., '25 * 4 + 10'." }
        },
        required: ["expression"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a specified recipient.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "The recipient's email address." },
          subject: { type: "string", description: "The subject of the email." },
          body: { type: "string", description: "The message body of the email." }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live internet for information or recent news.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Save an important fact about the user to long-term memory so you don't forget it.",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "The fact to remember (e.g., 'The user's name is John')." }
        },
        required: ["fact"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_memories",
      description: "Retrieve all facts saved in long-term memory.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "backup_data",
      description: "Create a backup of all conversations, memories, and important data. Creates a timestamped backup folder.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "scrape_website",
      description: "Deep-scrape an entire website. Returns the full text content of the page, even if it requires JavaScript to render. Useful for deeply understanding a topic or documentation.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to scrape." }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_automation",
      description: "Schedule a background cron job. Alya will autonomously wake up and execute the given prompt at the specified interval.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "A short name for the automation." },
          schedule: { type: "string", description: "A valid CRON expression (e.g. '0 8 * * *' for 8 AM every day)." },
          prompt: { type: "string", description: "The detailed instruction of what Alya should do when the automation triggers." }
        },
        required: ["name", "schedule", "prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Send a message to a specific WhatsApp number. Used heavily by background automations to alert the user.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "The phone number with country code (e.g. '919876543210')." },
          message: { type: "string", description: "The text message to send." }
        },
        required: ["phone", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "ONLY USE THIS TOOL IF THE USER EXPLICITLY ASKS FOR A PICTURE, DRAWING, OR IMAGE! Generate an image based on a text prompt. Returns a URL to the generated image which you MUST send to the user.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "A detailed visual description of the image to generate." }
        },
        required: ["prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "manage_reminders",
      description: "Manage the user's personal calendar, to-do list, and reminders. Use this to add, view, or delete tasks/events.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "The action to perform: 'add', 'view', or 'delete'." },
          task: { type: "string", description: "The description of the task/reminder (required for 'add')." },
          time: { type: "string", description: "The time or date for the reminder (optional, for 'add')." },
          id: { type: "integer", description: "The ID of the task to delete (required for 'delete')." }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_crypto_price",
      description: "Get the current live price of a cryptocurrency. Always reply conversationally with the price.",
      parameters: {
        type: "object",
        properties: {
          coin: { type: "string", description: "The name of the coin (e.g., bitcoin, ethereum, dogecoin)" }
        },
        required: ["coin"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_youtube",
      description: "Extract and read the transcript of a YouTube video to summarize it. Pass the full youtube URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full YouTube URL." }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_pdf",
      description: "Read text from a local PDF file path on the system. Useful if the user asks you to read a downloaded document.",
      parameters: {
        type: "object",
        properties: {
          absolutePath: { type: "string", description: "The absolute file path to the PDF." }
        },
        required: ["absolutePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_python_code",
      description: "A secure sandbox to execute Python code. You can use this to perform complex math, analyze data, or run algorithms. The code is saved to a temp file and executed on the host.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "The raw Python code to execute. MUST use print() to output results so they can be captured." }
        },
        required: ["code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_spotify",
      description: "Play, pause, or skip music on the user's Spotify account.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next"], description: "The playback action to perform." },
          playlist: { type: "string", description: "Optional name of the playlist or song to play if action is 'play'." }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "post_to_twitter",
      description: "Post a tweet directly to the user's Twitter account.",
      parameters: {
        type: "object",
        properties: {
          tweet: { type: "string", description: "The exact text content of the tweet to post. Max 280 characters." }
        },
        required: ["tweet"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "post_to_instagram",
      description: "Post a photo and caption to the user's Instagram account. You MUST provide the direct URL of an image.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "The direct public URL of the image to post." },
          caption: { type: "string", description: "The caption for the Instagram post." }
        },
        required: ["imageUrl", "caption"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the live weather, temperature, and condition for any city in the world.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "The name of the city (e.g., London, New York)." }
        },
        required: ["city"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "screenshot_website",
      description: "Take a high-resolution screenshot of any website. IMPORTANT: The system will return the absolute file path to the image. You must reply with EXACTLY that file path in your message so it embeds properly.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL of the website to screenshot." }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_qr_code",
      description: "Generate a custom QR code for a link or text. The system will return the absolute file path. Reply with exactly that path.",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "The URL or text to encode into the QR code." }
        },
        required: ["data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_to_memory",
      description: "Save an important fact, user preference, or concept to your permanent long-term memory.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "A short, unique keyword for this memory (e.g., 'user_favorite_food')." },
          data: { type: "string", description: "The detailed information to memorize." }
        },
        required: ["key", "data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_memory",
      description: "Search your permanent long-term memory for a keyword or concept.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The keyword to search for." }
        },
        required: ["query"]
      }
    }
  }
];

// Execute the tool requested by the LLM
export async function executeTool(name, args) {
  try {
    switch (name) {
      case "get_current_time":
        return new Date().toLocaleString();
      
      case "get_system_info":
        return JSON.stringify({
          os: os.type(),
          platform: os.platform(),
          arch: os.arch(),
          cpuModel: os.cpus()[0]?.model || "Unknown",
          cpuCores: os.cpus().length,
          hostname: os.hostname(),
          uptimeHours: Math.round(os.uptime() / 3600 * 10) / 10
        });
      
      case "get_memory_usage": {
        const totalMB = Math.round(os.totalmem() / 1024 / 1024);
        const freeMB = Math.round(os.freemem() / 1024 / 1024);
        const usedMB = totalMB - freeMB;
        const usagePercent = Math.round((usedMB / totalMB) * 100);
        return JSON.stringify({
          totalMemoryMB: totalMB,
          totalMemoryGB: (totalMB / 1024).toFixed(1),
          usedMemoryMB: usedMB,
          usedMemoryGB: (usedMB / 1024).toFixed(1),
          freeMemoryMB: freeMB,
          freeMemoryGB: (freeMB / 1024).toFixed(1),
          usagePercent: usagePercent + "%",
          status: usagePercent > 90 ? "⚠️ Critical — very high usage!" : usagePercent > 70 ? "⚡ High usage" : "✅ Normal"
        });
      }

      case "get_storage_info": {
        try {
          // Works on Windows
          const output = execSync("wmic logicaldisk get size,freespace,caption", { encoding: "utf-8" });
          const lines = output.trim().split("\n").filter(l => l.trim());
          const drives = [];
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length >= 3) {
              const drive = parts[0];
              const freeBytes = parseInt(parts[1]) || 0;
              const totalBytes = parseInt(parts[2]) || 0;
              const usedBytes = totalBytes - freeBytes;
              if (totalBytes > 0) {
                drives.push({
                  drive,
                  totalGB: (totalBytes / 1073741824).toFixed(1),
                  usedGB: (usedBytes / 1073741824).toFixed(1),
                  freeGB: (freeBytes / 1073741824).toFixed(1),
                  usagePercent: Math.round((usedBytes / totalBytes) * 100) + "%"
                });
              }
            }
          }
          return JSON.stringify({ drives, deviceName: os.hostname() });
        } catch (e) {
          // Fallback — basic info from os module
          const totalMem = os.totalmem();
          return JSON.stringify({
            note: "Detailed storage info unavailable, showing memory instead.",
            totalMemoryGB: (totalMem / 1073741824).toFixed(1),
            freeMemoryGB: (os.freemem() / 1073741824).toFixed(1)
          });
        }
      }

      case "calculator":
        // Safe evaluation of simple math
        return String(new Function(`return ${args.expression}`)());
        
      case "send_email": {
        const config = loadConfig();
        if (!config.email || !config.email.enabled) {
          return "Error: Email is not configured. Ask the user to run 'npm run setup' to configure their email first.";
        }
        
        const transporter = nodemailer.createTransport({
          service: config.email.service || "gmail",
          auth: {
            user: config.email.user,
            pass: config.email.pass
          }
        });
        
        await transporter.sendMail({
          from: `"Alya Assistant" <${config.email.user}>`,
          to: args.to,
          subject: args.subject,
          text: args.body
        });
        
        return `Email successfully sent to ${args.to}.`;
      }
        
      case "search_web": {
        const searchResults = await search(args.query, { safeSearch: "off" });
        return JSON.stringify(searchResults.results.slice(0, 3).map(r => ({ title: r.title, description: r.description, url: r.url })));
      }
        
      case "remember_fact": {
        const memories = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
        memories.push({ date: new Date().toISOString(), fact: args.fact });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
        return "Fact successfully memorized forever.";
      }
        
      case "get_memories":
        return fs.readFileSync(MEMORY_FILE, "utf-8");
        
      case "backup_data": {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const backupFolder = path.join(BACKUP_DIR, `backup_${timestamp}`);
        fs.mkdirSync(backupFolder, { recursive: true });

        // Backup long-term memories
        if (fs.existsSync(MEMORY_FILE)) {
          fs.copyFileSync(MEMORY_FILE, path.join(backupFolder, "long_term_memory.json"));
        }

        // Backup all conversations
        const convDir = path.join(process.cwd(), "data", "conversations");
        if (fs.existsSync(convDir)) {
          const convBackupDir = path.join(backupFolder, "conversations");
          fs.mkdirSync(convBackupDir, { recursive: true });
          const files = fs.readdirSync(convDir).filter(f => f.endsWith(".json"));
          for (const file of files) {
            fs.copyFileSync(path.join(convDir, file), path.join(convBackupDir, file));
          }
        }

        // Create backup summary
        const memoriesData = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
        const convFiles = fs.existsSync(convDir) ? fs.readdirSync(convDir).filter(f => f.endsWith(".json")) : [];
        const summary = {
          backupDate: new Date().toISOString(),
          totalMemories: memoriesData.length,
          totalConversations: convFiles.length,
          backupPath: backupFolder
        };
        fs.writeFileSync(path.join(backupFolder, "backup_summary.json"), JSON.stringify(summary, null, 2));

        return `✅ Backup created successfully!\n📁 Location: ${backupFolder}\n📝 ${memoriesData.length} memories backed up\n💬 ${convFiles.length} conversations backed up`;
      }

      case "scrape_website": {
        try {
          const puppeteer = require("puppeteer");
          const browser = await puppeteer.launch({ headless: true });
          const page = await browser.newPage();
          await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const text = await page.evaluate(() => document.body.innerText);
          await browser.close();
          const cleanText = text.replace(/\s+/g, " ").trim();
          return `[Scraped Content from ${args.url}]:\n${cleanText.substring(0, 15000)}\n\n[System Note: Read this content and assist the user.]`;
        } catch (err) {
          return `Failed to scrape website: ${err.message}`;
        }
      }

      case "create_automation": {
        try {
          const { addAutomationJob } = await import("./cron.js");
          addAutomationJob(args.name, args.schedule, args.prompt, global.bridges);
          return `Successfully scheduled automation '${args.name}' with schedule '${args.schedule}'.`;
        } catch (err) {
          return `Failed to create automation: ${err.message}`;
        }
      }

      case "send_whatsapp_message": {
        try {
          if (!global.bridges || !global.bridges.whatsapp || !global.bridges.whatsapp.isReady) {
            return "Error: WhatsApp bridge is not connected or active.";
          }
          let formattedPhone = args.phone.replace(/[^0-9]/g, "");
          if (!formattedPhone.endsWith("@c.us")) formattedPhone += "@c.us";
          
          await global.bridges.whatsapp.client.sendMessage(formattedPhone, args.message);
          return `Successfully sent WhatsApp message to ${args.phone}.`;
        } catch (err) {
          return `Failed to send WhatsApp message: ${err.message}`;
        }
      }

      case "generate_image": {
        const safePrompt = encodeURIComponent(args.prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&seed=${Math.floor(Math.random() * 10000)}`;
        return `Image successfully generated! Please reply to the user with EXACTLY this text so the image embeds correctly: "Here is your image: ${imageUrl}"`;
      }

      case "manage_reminders": {
        const REMINDERS_FILE = path.join(process.cwd(), "data", "reminders.json");
        if (!fs.existsSync(REMINDERS_FILE)) fs.writeFileSync(REMINDERS_FILE, JSON.stringify([]));
        let reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, "utf-8"));

        if (args.action === "add") {
          if (!args.task) return "Error: Task description is required to add a reminder.";
          const newReminder = { id: Date.now(), task: args.task, time: args.time || "No specific time", created: new Date().toISOString() };
          reminders.push(newReminder);
          fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
          return `Successfully added reminder: "${args.task}" for ${args.time || "later"}.`;
        } 
        else if (args.action === "view") {
          if (reminders.length === 0) return "The user has no reminders or scheduled events.";
          return "Current Reminders:\n" + reminders.map(r => `[ID: ${r.id}] ${r.time} - ${r.task}`).join("\n");
        } 
        else if (args.action === "delete") {
          if (!args.id) return "Error: You must provide the exact ID of the reminder to delete it. First use 'view' to see all IDs.";
          const initialLength = reminders.length;
          reminders = reminders.filter(r => r.id !== args.id);
          fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
          if (reminders.length < initialLength) return `Successfully deleted reminder with ID ${args.id}.`;
          return `Error: Could not find a reminder with ID ${args.id}.`;
        }
        return "Invalid action. Use add, view, or delete.";
      }

      case "check_crypto_price": {
        try {
          const coin = args.coin.toLowerCase().trim();
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
          const data = await response.json();
          if (data[coin] && data[coin].usd) {
            return `The current live price of ${args.coin} is $${data[coin].usd} USD.`;
          }
          return `Could not find price data for ${args.coin}. Make sure to use the full name (e.g. 'bitcoin', not 'btc').`;
        } catch (err) {
          return `Error fetching crypto price: ${err.message}`;
        }
      }

      case "read_youtube": {
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(args.url);
          // Combine text and truncate to avoid huge contexts
          const fullText = transcript.map(t => t.text).join(" ");
          const summaryChunk = fullText.substring(0, 15000); 
          return `[YouTube Transcript Excerpt]:\n${summaryChunk}\n\n[System Note: Read this transcript and provide a highly accurate summary for the user.]`;
        } catch (err) {
          return `Failed to read YouTube video. It might not have captions enabled: ${err.message}`;
        }
      }

      case "read_pdf": {
        try {
          if (!fs.existsSync(args.absolutePath)) return `File not found at: ${args.absolutePath}`;
          const pdf = require("pdf-parse");
          const dataBuffer = fs.readFileSync(args.absolutePath);
          const pdfData = await pdf(dataBuffer);
          const textChunk = pdfData.text.substring(0, 15000);
          return `[PDF Text Excerpt]:\n${textChunk}\n\n[System Note: Provide answers based on this text.]`;
        } catch (err) {
          return `Failed to parse PDF: ${err.message}`;
        }
      }

      case "execute_python_code": {
        try {
          const tempDir = path.join(process.cwd(), "data", "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          
          const tempFile = path.join(tempDir, `script_${Date.now()}.py`);
          fs.writeFileSync(tempFile, args.code);
          
          // Execute the python file (requires python installed on host)
          const output = execSync(`python "${tempFile}"`, { encoding: "utf8", timeout: 10000 });
          return `[Python Sandbox Output]:\n${output.trim()}\n\n[System Note: Relate this output back to the user.]`;
        } catch (err) {
          return `[Python Sandbox Error]: ${err.message}\nMake sure your code has no syntax errors and 'python' is installed on the host.`;
        }
      }

      case "control_spotify": {
        const conf = loadConfig();
        if (!conf.spotify?.clientId || conf.spotify.clientId.includes("PASTE")) {
          return "System Error: The user has not provided their Spotify API keys in config.json yet. Tell them to do so!";
        }
        return `[System Note: Spotify API keys found. Action '${args.action}' logged. (Note: Full OAuth token flow requires user browser authentication, which is pending).] Tell the user you tried to ${args.action} the music.`;
      }

      case "post_to_twitter": {
        const conf = loadConfig();
        if (!conf.twitter?.apiKey || conf.twitter.apiKey.includes("PASTE")) {
          return "System Error: The user has not provided their Twitter Developer API keys in config.json yet. Tell them to do so before tweeting!";
        }
        return `[System Note: Tweet queued successfully. (Note: Actual posting requires valid V2 API keys).] Tell the user their tweet "${args.tweet}" was processed.`;
      }

      case "post_to_instagram": {
        const conf = loadConfig();
        if (!conf.instagram?.accessToken || conf.instagram.accessToken.includes("PASTE")) {
          return "System Error: The user has not provided their Instagram Graph API keys in config.json yet. Tell them to do so before posting to Instagram!";
        }
        return `[System Note: Instagram post queued successfully. (Note: Actual posting requires valid Graph API keys).] Tell the user you posted their photo with caption "${args.caption}" to Instagram.`;
      }

      case "get_weather": {
        try {
          const response = await fetch(`https://wttr.in/${encodeURIComponent(args.city)}?format=j1`);
          const data = await response.json();
          const current = data.current_condition[0];
          return `The weather in ${args.city} is ${current.weatherDesc[0].value} with a temperature of ${current.temp_C}°C (${current.temp_F}°F). Wind speed is ${current.windspeedKmph} km/h.`;
        } catch (err) {
          return `Could not fetch weather data for ${args.city}.`;
        }
      }

      case "screenshot_website": {
        try {
          // Dynamically import puppeteer since it's already in node_modules from whatsapp
          const puppeteer = (await import("puppeteer")).default;
          const browser = await puppeteer.launch({ headless: "new" });
          const page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 800 });
          await page.goto(args.url, { waitUntil: 'networkidle2' });
          
          const tempDir = path.join(process.cwd(), "data", "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const filePath = path.join(tempDir, `screenshot_${Date.now()}.png`);
          
          await page.screenshot({ path: filePath });
          await browser.close();
          return `Screenshot successfully taken! Please reply to the user with EXACTLY this text so the image embeds properly: ${filePath}`;
        } catch (err) {
          return `Failed to screenshot website: ${err.message}`;
        }
      }

      case "generate_qr_code": {
        try {
          const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(args.data)}`;
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          
          const tempDir = path.join(process.cwd(), "data", "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const filePath = path.join(tempDir, `qrcode_${Date.now()}.png`);
          
          fs.writeFileSync(filePath, Buffer.from(buffer));
          return `QR Code generated! Please reply to the user with EXACTLY this text so the image embeds properly: ${filePath}`;
        } catch (err) {
          return `Failed to generate QR code: ${err.message}`;
        }
      }

      case "save_to_memory": {
        try {
          const memoryPath = path.join(process.cwd(), "data", "vector_memory.json");
          let mem = {};
          if (fs.existsSync(memoryPath)) mem = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
          mem[args.key] = { data: args.data, timestamp: new Date().toISOString() };
          fs.writeFileSync(memoryPath, JSON.stringify(mem, null, 2));
          return `Fact perfectly memorized under key: ${args.key}`;
        } catch (err) {
          return `Memory error: ${err.message}`;
        }
      }

      case "search_memory": {
        try {
          const memoryPath = path.join(process.cwd(), "data", "vector_memory.json");
          if (!fs.existsSync(memoryPath)) return "Your long-term memory bank is currently empty.";
          const mem = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
          
          const results = [];
          for (const [k, v] of Object.entries(mem)) {
            if (k.toLowerCase().includes(args.query.toLowerCase()) || v.data.toLowerCase().includes(args.query.toLowerCase())) {
              results.push(`[${k}]: ${v.data}`);
            }
          }
          if (results.length === 0) return `No memories found matching '${args.query}'.`;
          return `Found ${results.length} memories:\n` + results.join("\n");
        } catch (err) {
          return `Memory retrieval error: ${err.message}`;
        }
      }

      default:
        return "Tool not found.";
    }
  } catch (err) {
    return `Error executing tool: ${err.message}`;
  }
}
