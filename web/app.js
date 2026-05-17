// ============================================================
// ✨ Alya — Web Dashboard Client
// Socket.IO chat + Web Speech API voice
// ============================================================

(function () {
  "use strict";

  // --- Elements ---
  const messagesEl = document.getElementById("messages");
  const welcomeEl = document.getElementById("welcome-screen");
  const inputEl = document.getElementById("message-input");
  const sendBtn = document.getElementById("btn-send");
  const voiceBtn = document.getElementById("btn-voice");
  const voiceIndicator = document.getElementById("voice-indicator");
  const voiceStop = document.getElementById("voice-stop");
  const clearBtn = document.getElementById("btn-clear");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const connStatus = document.getElementById("connection-status");
  const bridgeList = document.getElementById("bridge-list");
  const chips = document.querySelectorAll(".chip");

  // --- Socket.IO ---
  const socket = io();
  let isStreaming = false;
  let streamDiv = null;
  let hasMessages = false;

  // --- Connection ---
  socket.on("connect", () => {
    connStatus.textContent = "Online";
    connStatus.classList.add("online");
    fetchStatus();
  });

  socket.on("disconnect", () => {
    connStatus.textContent = "Disconnected";
    connStatus.classList.remove("online");
  });

  // --- Incoming messages ---
  socket.on("message", (data) => {
    hideWelcome();
    appendMessage("assistant", data.content, data.timestamp);
    speak(data.content);
  });

  // --- Streaming ---
  socket.on("typing", (isTyping) => {
    if (isTyping && !streamDiv) {
      hideWelcome();
      streamDiv = createStreamBubble();
    }
  });

  socket.on("stream", (data) => {
    if (streamDiv) {
      const contentEl = streamDiv.querySelector(".msg-content");
      // Remove typing indicator if present
      const dots = contentEl.querySelector(".typing-indicator");
      if (dots) dots.remove();
      contentEl.innerHTML = formatMarkdown(contentEl.textContent + data.content);
      scrollToBottom();
    }
  });

  socket.on("stream_end", (data) => {
    if (streamDiv) {
      const contentEl = streamDiv.querySelector(".msg-content");
      contentEl.innerHTML = formatMarkdown(data.content);
      const timeEl = streamDiv.querySelector(".msg-time");
      if (timeEl) timeEl.textContent = formatTime(data.timestamp);
      streamDiv = null;
    }
    isStreaming = false;
    speak(data.content);
    scrollToBottom();
  });

  socket.on("cleared", () => {
    // Clear all messages except welcome
    const msgs = messagesEl.querySelectorAll(".message");
    msgs.forEach((m) => m.remove());
    hasMessages = false;
  });

  // --- Voice playback (ElevenLabs) ---
  let currentAudio = null;

  socket.on("voice", (data) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    
    currentAudio = new Audio(data.url);
    currentAudio.play().catch(e => console.error("Audio playback failed:", e));
    
    currentAudio.onended = () => {
      if (lastMessageWasVoice && !isListening) {
        startListening();
      }
    };
  });

  // --- Send Message ---
  function sendMessage(text) {
    const msg = text?.trim() || inputEl.value.trim();
    if (!msg || isStreaming) return;

    hideWelcome();
    appendMessage("user", msg);
    inputEl.value = "";
    inputEl.style.height = "auto";
    isStreaming = true;

    socket.emit("chat", { message: msg });
  }

  sendBtn.addEventListener("click", () => {
    lastMessageWasVoice = false;
    sendMessage();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      lastMessageWasVoice = false;
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  // --- Chip Prompts ---
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.dataset.prompt;
      if (prompt) sendMessage(prompt);
    });
  });

  // --- Clear Chat ---
  clearBtn.addEventListener("click", () => {
    socket.emit("clear");
  });

  // --- Sidebar Toggle (mobile) ---
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (sidebar.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });

  // --- Message Rendering ---
  function appendMessage(role, content, timestamp) {
    hasMessages = true;
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "👤" : "<img src='alya.png' alt='Alya' style='width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;'>"}</div>
      <div>
        <div class="msg-content">${formatMarkdown(content)}</div>
        <div class="msg-time">${formatTime(timestamp)}</div>
      </div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function createStreamBubble() {
    hasMessages = true;
    const div = document.createElement("div");
    div.className = "message assistant";
    div.innerHTML = `
      <div class="msg-avatar"><img src='alya.png' alt='Alya' style='width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;'></div>
      <div>
        <div class="msg-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
        <div class="msg-time"></div>
      </div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function hideWelcome() {
    if (welcomeEl) welcomeEl.style.display = "none";
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function formatTime(ts) {
    if (!ts) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Simple markdown formatter
  function formatMarkdown(text) {
    if (!text) return "";
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/<media>([\s\S]*?)<\/media>/gi, (match, path) => {
        let url = path.trim();
        // If it's a local path, extract just the filename and use /temp/ route
        if (!url.startsWith("http")) {
          const parts = url.split(/[\\\/]/);
          const filename = parts[parts.length - 1];
          url = `/temp/${filename}`;
        }
        return `<img src="${url}" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">') // Convert markdown images
      .replace(/(https:\/\/image\.pollinations\.ai[^\s]+)/g, '<img src="$1" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">') // Auto-embed raw pollinations URLs
      .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
    return html;
  }

  // --- Voice (Web Speech API) ---
  let recognition = null;
  let synthesis = window.speechSynthesis;
  let isListening = false;
  let autoSendTimer = null;
  let lastMessageWasVoice = false;

  // Check support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true; // Don't cut off if the user pauses!
    recognition.interimResults = true;
    recognition.lang = "hi-IN"; // Support Hindi/Hinglish voice input

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      inputEl.value = finalTranscript + interimTranscript;
      
      // Automatically send the message after 2 seconds of silence
      clearTimeout(autoSendTimer);
      if (inputEl.value.trim() !== "") {
        autoSendTimer = setTimeout(() => {
          if (isListening) {
            stopListening();
            lastMessageWasVoice = true;
            sendMessage(inputEl.value);
          }
        }, 2000);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed") {
        stopListening();
        alert("Microphone blocked! Please click the lock icon next to the URL and allow microphone access.");
      }
    };
    
    // Auto-restart if browser tries to kill the mic before the user clicks stop
    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch {}
      }
    };
  } else {
    voiceBtn.style.display = "none";
  }

  voiceBtn.addEventListener("click", () => {
    if (isListening) { 
      stopListening(); 
      // Send the message immediately when they click to stop recording
      if (inputEl.value.trim()) {
        lastMessageWasVoice = true;
        sendMessage(inputEl.value);
      }
    } else { 
      inputEl.value = ""; // Clear input for fresh dictation
      startListening(); 
    }
  });

  voiceStop.addEventListener("click", stopListening);

  function startListening() {
    if (!recognition) return;
    isListening = true;
    voiceBtn.classList.add("recording");
    voiceIndicator.classList.add("active");
    inputEl.placeholder = "Listening...";
    recognition.start();
  }

  function stopListening() {
    if (!recognition) return;
    clearTimeout(autoSendTimer);
    isListening = false;
    voiceBtn.classList.remove("recording");
    voiceIndicator.classList.remove("active");
    inputEl.placeholder = "Message Alya...";
    try { recognition.stop(); } catch {}
  }

  // Text-to-speech for responses (Fallback only)
  function speak(text) {
    // We now use ElevenLabs via socket 'voice' event.
    // This is kept as a fallback if you ever need browser-based TTS.
    return; // Remove this return statement to enable browser TTS fallback

    if (!synthesis || !text) return;
    
    // Clean text for speech
    const cleanText = text
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .trim();

    if (!cleanText) return;

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "hi-IN";
    utterance.rate = 1.0;
    
    const voices = synthesis.getVoices();
    const voice = voices.find(v => v.lang.includes("hi") && v.name.toLowerCase().includes("female")) 
               || voices.find(v => v.lang.includes("hi"));
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      if (lastMessageWasVoice && !isListening) {
        startListening();
      }
    };

    synthesis.speak(utterance);
  }

  // --- Fetch Bridge Status ---
  async function fetchStatus() {
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/status"),
      ]);
      const health = await healthRes.json();
      const status = await statusRes.json();

      // Update Groq API status
      const groqEl = document.getElementById("status-groq");
      const dotEl = groqEl.querySelector(".status-dot");
      const valEl = groqEl.querySelector(".status-value");
      dotEl.className = `status-dot ${health.groqApi ? "online" : "offline"}`;
      valEl.textContent = health.groqApi ? "Connected" : "Offline";

      // Update model
      const modelEl = document.getElementById("status-model");
      const modelDot = modelEl.querySelector(".status-dot");
      const modelVal = modelEl.querySelector(".status-value");
      modelDot.className = `status-dot ${health.groqApi ? "online" : "offline"}`;
      modelVal.textContent = health.model || "—";

      // Update bridges
      const bridgeIcons = {
        discord: "💬", telegram: "✈️", slack: "💼", whatsapp: "📱", web: "🌐",
      };
      bridgeList.innerHTML = "";
      for (const [name, info] of Object.entries(status.bridges)) {
        const item = document.createElement("div");
        item.className = "bridge-item";
        item.innerHTML = `
          <span class="bridge-icon">${bridgeIcons[name] || "🔗"}</span>
          <span class="bridge-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
          <span class="bridge-status ${info.connected ? "online" : "offline"}">${info.connected ? "Live" : "Off"}</span>`;
        bridgeList.appendChild(item);
      }
    } catch {
      // Status fetch failed
    }
  }

  // Poll status every 30s
  setInterval(fetchStatus, 30000);
})();
