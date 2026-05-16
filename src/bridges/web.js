import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { LLMEngine } from "../core/llm.js";
import { getHistory, addMessage, clearHistory, getStats } from "../core/memory.js";
import { getRandomGreeting, SERVICE_CONNECT_MESSAGES } from "../core/personality.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WebBridge {
  constructor(config, bridges = {}) {
    this.config = config;
    this.llm = new LLMEngine();
    this.bridges = bridges;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, { cors: { origin: "*" } });
    this.isReady = false;
  }

  async start() {
    const port = this.config.port || 3000;

    // Serve static files
    this.app.use(express.static(join(__dirname, "..", "..", "web")));
    this.app.use(express.json());

    // API: Health check
    this.app.get("/api/health", async (req, res) => {
      const groqOk = await this.llm.isAvailable();
      const models = groqOk ? await this.llm.listModels() : [];
      res.json({
        status: "ok",
        groqApi: groqOk,
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

      // Handle chat messages
      socket.on("chat", async (data) => {
        const { message } = data;
        if (!message?.trim()) return;

        const history = getHistory("web", sessionId);

        // Stream response
        let fullResponse = "";
        socket.emit("typing", true);

        try {
          fullResponse = await this.llm.chatStream(history, message, (chunk) => {
            socket.emit("stream", { content: chunk });
          });

          addMessage("web", sessionId, "user", message);
          addMessage("web", sessionId, "assistant", fullResponse);

          socket.emit("stream_end", {
            role: "assistant",
            content: fullResponse,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
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

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`🌐 Web client disconnected: ${socket.id}`);
      });
    });

    return new Promise((resolve) => {
      const startServer = (currentPort) => {
        this.server.listen(currentPort, () => {
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
