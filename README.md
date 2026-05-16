# ✨ Alya — Your Private AI Assistant

> **Private. Local. Always ready.**  
> A personal AI assistant that runs entirely on your devices and connects to all your chat apps.

Alya is a fully local AI assistant powered by [Ollama](https://ollama.com). Message her from **WhatsApp**, **Discord**, **Telegram**, **Slack**, or the built-in **web dashboard with voice chat** — just like talking to a friend.

## ✨ Features

- 🧠 **100% Local** — Powered by Ollama, all data stays on your machine
- 💬 **Multi-Platform** — Chat from WhatsApp, Discord, Telegram, Slack, or the web
- 🎤 **Voice Chat** — Talk to Alya using the web dashboard (works on phones too!)
- 🔒 **Privacy-First** — No data leaves your device. Ever.
- ✨ **Cool Personality** — Elegant, intelligent, and subtly caring
- 📝 **Memory** — Alya remembers your conversations per platform
- ⚡ **Streaming** — Real-time streaming responses in the web UI
- 🛠️ **Guided Setup** — Simple wizard walks you through everything

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** — [Download](https://nodejs.org)
2. **Ollama** — [Download](https://ollama.com)

### Installation

```bash
# Navigate to the project
cd "Agent for Talking"

# Install dependencies
npm install

# Pull an AI model
ollama pull llama3.2

# Run the guided setup wizard
npm run setup

# Start Alya!
npm start
```

### Setup Wizard

The setup wizard (`npm run setup`) walks you through:

1. **Ollama connection** — Tests your local LLM
2. **Web dashboard** — Configure the voice-enabled web UI
3. **Chat platforms** — Connect Discord, Telegram, Slack, and/or WhatsApp

You can re-run setup anytime to change your configuration.

## 📱 Platform Setup Guides

### Web Dashboard (Built-in)
- Starts automatically at `http://localhost:3000`
- **Voice chat**: Click the 🎤 microphone button
- Works on your phone's browser too!

### Discord
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Bot → Copy token
3. Enable **MESSAGE CONTENT** intent
4. Invite bot to your server with `bot` + `applications.commands` scopes
5. DM the bot or @mention it in channels

### Telegram
1. Talk to [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the API token and paste it in setup

### Slack
1. Go to [Slack API](https://api.slack.com/apps) → Create New App
2. Enable **Socket Mode**
3. Add Bot Token Scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`
4. Install to your workspace
5. Copy Bot Token, App Token, and Signing Secret

### WhatsApp
1. Just enable it in setup — no API keys needed!
2. When Alya starts, scan the QR code with WhatsApp
3. Go to WhatsApp → Settings → Linked Devices → Link a Device

## 🎤 Voice on Mobile

The web dashboard works on both **iPhone** and **Android**:

1. Open `http://YOUR_LOCAL_IP:3000` on your phone
2. Tap the microphone button to start voice chat
3. Alya will hear you and respond with text

> **Tip:** Find your local IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

## 🗂️ Project Structure

```
├── setup.js              # 🛠️ Guided setup wizard
├── src/
│   ├── index.js          # 🚀 Main entry point
│   ├── core/
│   │   ├── config.js     # ⚙️ Configuration manager
│   │   ├── llm.js        # 🧠 Ollama integration
│   │   ├── memory.js     # 💾 Conversation memory
│   │   └── personality.js # ✨ Alya's personality
│   └── bridges/
│       ├── discord.js    # 💬 Discord bridge
│       ├── telegram.js   # ✈️ Telegram bridge
│       ├── slack.js      # 💼 Slack bridge
│       ├── whatsapp.js   # 📱 WhatsApp bridge
│       └── web.js        # 🌐 Web dashboard server
├── web/
│   ├── index.html        # 🎨 Dashboard UI
│   ├── style.css         # 🎨 Icy cyan theme styles
│   ├── app.js            # 🎨 Client-side logic
│   └── alya.png          # ✨ Alya's avatar
├── config/               # ⚙️ Generated config (gitignored)
└── data/                 # 💾 Conversation data (gitignored)
```

## 🤖 Commands

All platforms support these commands:

| Command | What it does |
|---------|-------------|
| `!clear` / `/clear` | Clear conversation history |
| `!help` / `/help` | Show help message |
| `!status` / `/status` | Check systems |

## 🔒 Privacy

- All AI inference runs locally via Ollama
- Conversation history is stored in local JSON files
- No data is sent to any external server
- WhatsApp auth uses local Chromium session
- You own everything. ✨

---

*Built with ✨ by Alya.*
