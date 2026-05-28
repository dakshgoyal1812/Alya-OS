// ============================================================
// ✨ Alya — Web Dashboard Client
// Socket.IO chat + Web Speech API voice
// ============================================================

(function () {
  "use strict";

  // --- Security Helpers ---
  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeUrl(url) {
    if (!url) return "";
    url = url.trim().replace(/["'\s]/g, "");
    if (/^(https?:\/\/|\/)/i.test(url)) {
      return url;
    }
    return "";
  }

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

  // Image & Document Upload Elements
  const attachBtn = document.getElementById("btn-attach");
  const attachPopover = document.getElementById("attach-popover");
  const popoverAttachImage = document.getElementById("popover-attach-image");
  const popoverAttachDoc = document.getElementById("popover-attach-doc");
  const fileInput = document.getElementById("image-upload");
  const docFileInput = document.getElementById("file-upload");
  const previewContainer = document.getElementById("image-preview-container");
  const previewImg = document.getElementById("image-preview");
  const cancelImgBtn = document.getElementById("btn-cancel-image");

  // Document File Preview Elements
  const filePreviewContainer = document.getElementById("file-preview-container");
  const filePreviewName = document.getElementById("file-preview-name");
  const filePreviewSize = document.getElementById("file-preview-size");
  const btnCancelFile = document.getElementById("btn-cancel-file");

  // Audio Canvas Visualizer
  const voiceCanvas = document.getElementById("voice-canvas");

  // --- Socket.IO ---
  const socket = io({ transports: ["websocket", "polling"] });
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
    isStreaming = false;
    streamDiv = null;
    if (sendBtn) sendBtn.disabled = false;
  });

  // --- Auto-Healer Logs & Status ---
  const healerLogs = document.getElementById("healer-logs");
  const healerStatusBadge = document.getElementById("healer-status-badge");

  socket.on("healer_log", (data) => {
    if (healerLogs) {
      healerLogs.textContent += data.log + "\n";
      healerLogs.scrollTop = healerLogs.scrollHeight;
    }
  });

  socket.on("healer_status", (data) => {
    if (healerStatusBadge) {
      healerStatusBadge.className = `healer-status-badge ${data.status}`;
      const statusTexts = {
        idle: "System Idle",
        healing: "Healing...",
        testing: "Testing...",
        pushing: "Pushing...",
        success: "Success",
        error: "Error"
      };
      healerStatusBadge.textContent = statusTexts[data.status] || data.status;
    }
  });

  socket.on("healer_history", (data) => {
    if (healerLogs) {
      healerLogs.textContent = data.logs.join("\n") + (data.logs.length ? "\n" : "");
      healerLogs.scrollTop = healerLogs.scrollHeight;
    }
    if (healerStatusBadge) {
      healerStatusBadge.className = `healer-status-badge ${data.status}`;
      const statusTexts = {
        idle: "System Idle",
        healing: "Healing...",
        testing: "Testing...",
        pushing: "Pushing...",
        success: "Success",
        error: "Error"
      };
      healerStatusBadge.textContent = statusTexts[data.status] || data.status;
    }
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
      setHologramState("talking");
      const contentEl = streamDiv.querySelector(".msg-text-body");
      // Remove typing indicator if present
      const dots = contentEl.querySelector(".typing-indicator");
      if (dots) dots.remove();
      contentEl.innerHTML = formatMarkdown(contentEl.textContent + data.content);
      scrollToBottom();
    }
  });

  socket.on("stream_end", (data) => {
    if (streamDiv) {
      const contentEl = streamDiv.querySelector(".msg-text-body");
      contentEl.innerHTML = formatMarkdown(data.content);
      const timeEl = streamDiv.querySelector(".msg-time");
      if (timeEl) timeEl.textContent = formatTime(data.timestamp);
      streamDiv = null;
    }
    isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
    speak(data.content);
    scrollToBottom();
    setHologramState("idle");
  });

  socket.on("cleared", () => {
    // Clear all messages except welcome
    const msgs = messagesEl.querySelectorAll(".message");
    msgs.forEach((m) => m.remove());
    hasMessages = false;
  });

  // --- Voice playback (ElevenLabs) ---
  let currentAudio = null;
  let elevenLabsVoicePlayed = false;

  function restartWakeWordIfEnabled() {
    if (isWakeWordEnabled && wakeWordRecognition && !isListening && !isStreaming) {
      try { wakeWordRecognition.start(); } catch {}
    }
  }

  socket.on("voice", (data) => {
    elevenLabsVoicePlayed = true;
    if (synthesis) synthesis.cancel(); // Cancel local browser TTS if ElevenLabs plays

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    
    currentAudio = new Audio(data.url);
    if (typeof voiceOrbController !== "undefined" && voiceOrbController.active) {
      voiceOrbController.setState("speaking", "Alya speaking...");
    }
    setHologramState("talking");
    currentAudio.play().catch(e => console.error("Audio playback failed:", e));
    
    currentAudio.onended = () => {
      setHologramState("idle");
      hideCaptionsDelayed();
      if (typeof voiceOrbController !== "undefined" && voiceOrbController.active) {
        voiceOrbController.setState("idle");
      }
      if (lastMessageWasVoice && !isListening) {
        startListening();
      } else {
        restartWakeWordIfEnabled();
      }
    };
  });

  // Attachment State
  let attachedImageBase64 = null;
  let attachedImageMime = null;
  let attachedDocText = null;
  let attachedDocName = null;
  let docChunks = [];

  function clearAttachment() {
    attachedImageBase64 = null;
    attachedImageMime = null;
    attachedDocText = null;
    attachedDocName = null;
    docChunks = [];
    if (fileInput) fileInput.value = "";
    if (docFileInput) docFileInput.value = "";
    if (previewContainer) previewContainer.style.display = "none";
    if (previewImg) previewImg.src = "";
    if (filePreviewContainer) filePreviewContainer.style.display = "none";
  }

  // --- Attachment Popover & Upload Handling ---
  if (attachBtn) {
    attachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = attachPopover.style.display === "flex";
      attachPopover.style.display = isVisible ? "none" : "flex";
    });

    // Hide popover when clicking anywhere else
    document.addEventListener("click", () => {
      if (attachPopover) attachPopover.style.display = "none";
    });
  }

  if (popoverAttachImage && fileInput) {
    popoverAttachImage.addEventListener("click", () => {
      clearAttachment();
      fileInput.click();
    });
  }

  if (popoverAttachDoc && docFileInput) {
    popoverAttachDoc.addEventListener("click", () => {
      clearAttachment();
      docFileInput.click();
    });
  }

  // Handle Image upload selection
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          attachedImageBase64 = event.target.result.split(",")[1];
          attachedImageMime = file.type;
          previewImg.src = event.target.result;
          previewContainer.style.display = "inline-block";
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Handle Document upload selection (RAG Chunking)
  if (docFileInput) {
    docFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        attachedDocName = file.name;
        const sizeKB = (file.size / 1024).toFixed(1) + " KB";
        
        const reader = new FileReader();
        reader.onload = (event) => {
          attachedDocText = event.target.result;
          
          // Chunking implementation: split by double newline (paragraphs) or ~800 character limits
          const paragraphs = attachedDocText.split(/\n\s*\n/);
          docChunks = [];
          
          paragraphs.forEach(para => {
            const cleanPara = para.trim();
            if (cleanPara.length > 0) {
              if (cleanPara.length <= 1000) {
                docChunks.push(cleanPara);
              } else {
                // Split large paragraphs into smaller chunks of ~800 characters
                let start = 0;
                while (start < cleanPara.length) {
                  docChunks.push(cleanPara.substring(start, start + 800));
                  start += 800;
                }
              }
            }
          });
          
          console.log(`📄 Document loaded: ${attachedDocName}. Created ${docChunks.length} search chunks for RAG.`);
          
          if (filePreviewName) filePreviewName.textContent = attachedDocName;
          if (filePreviewSize) filePreviewSize.textContent = sizeKB;
          if (filePreviewContainer) filePreviewContainer.style.display = "flex";
        };
        reader.readAsText(file);
      }
    });
  }

  if (cancelImgBtn) {
    cancelImgBtn.addEventListener("click", clearAttachment);
  }
  if (btnCancelFile) {
    btnCancelFile.addEventListener("click", clearAttachment);
  }

  // Drag and drop images
  const chatMain = document.querySelector(".chat-main");
  if (chatMain) {
    chatMain.addEventListener("dragover", (e) => {
      e.preventDefault();
      chatMain.style.background = "rgba(6, 182, 212, 0.05)";
    });
    chatMain.addEventListener("dragleave", (e) => {
      e.preventDefault();
      chatMain.style.background = "";
    });
    chatMain.addEventListener("drop", (e) => {
      e.preventDefault();
      chatMain.style.background = "";
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          attachedImageBase64 = event.target.result.split(",")[1];
          attachedImageMime = file.type;
          previewImg.src = event.target.result;
          previewContainer.style.display = "inline-block";
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // --- RAG Text Context Query Helper ---
  function queryDocumentRAG(query, chunks, topK = 3) {
    if (!chunks || chunks.length === 0) return "";
    
    const tokenize = (text) => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(t => t.length > 2 && !["the", "and", "you", "for", "with", "this", "that"].includes(t));
    };

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return chunks.slice(0, topK).join("\n\n");

    const scored = chunks.map(chunk => {
      const chunkTokens = tokenize(chunk);
      const intersection = queryTokens.filter(t => chunkTokens.includes(t));
      const score = intersection.length;
      return { chunk, score };
    });

    const sorted = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.chunk);

    if (sorted.length === 0) {
      return chunks.slice(0, topK).join("\n\n");
    }
    return sorted.join("\n\n");
  }

  // --- Send Message ---
  function sendMessage(text) {
    const msg = text?.trim() || inputEl.value.trim();
    if (!msg && !attachedImageBase64) return;
    if (isStreaming) return;

    hideWelcome();
    if (msg) {
      appendMessage("user", msg);
      scanEmotionalUndercurrent(msg);
    } else if (attachedImageBase64) {
      appendMessage("user", "[Attached Image]");
    }

    inputEl.value = "";
    inputEl.style.height = "auto";
    isStreaming = true;
    if (sendBtn) sendBtn.disabled = true;

    // Build payload message with RAG context if document is uploaded
    let payloadMessage = msg || "";
    if (docChunks.length > 0 && msg) {
      const context = queryDocumentRAG(msg, docChunks, 3);
      payloadMessage = `[RAG Retrieval Context - Document: "${attachedDocName}"]\n${context}\n\nUser Question: ${msg}`;
    }

    // Get Alya OS control center configurations
    const options = {
      routingMode: document.getElementById("select-routing")?.value || "intelligence",
      thinkingMode: document.getElementById("select-thinking")?.value || "normal",
      swarmMode: document.getElementById("check-swarm")?.checked || false,
      cognitiveState: document.getElementById("select-cognitive-state")?.value || "focus"
    };

    setHologramState("thinking");

    socket.emit("chat", { 
      message: payloadMessage, 
      image: attachedImageBase64, 
      mimeType: attachedImageMime,
      options: options
    });

    clearAttachment();
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

  // Track subconscious deletions
  let backspaceCount = 0;
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      backspaceCount++;
      const delEl = document.getElementById("typing-deletions");
      if (delEl) delEl.textContent = backspaceCount;
      debounceSubconsciousLog();
    }
  });

  let debounceTimeout = null;
  function debounceSubconsciousLog() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const text = inputEl.value;
      try {
        const res = await fetch("/api/cognitive/subconscious", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deletedCount: backspaceCount, text })
        });
        const data = await res.json();
        if (data.success && data.result) {
          const avoidedEl = document.getElementById("typing-avoided");
          if (avoidedEl) {
            avoidedEl.textContent = data.result.avoidedTopics.length > 0 
              ? data.result.avoidedTopics.join(", ") 
              : "None";
          }
        }
      } catch (e) {
        console.warn("API failed:", e);
      }
    }, 2000);
  }

  async function scanEmotionalUndercurrent(text) {
    if (!text) return;
    try {
      const res = await fetch("/api/cognitive/undercurrent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (data.success && data.result) {
        const moodEl = document.getElementById("undercurrent-mood");
        const markersEl = document.getElementById("undercurrent-markers");
        if (moodEl) moodEl.textContent = data.result.undercurrentMood;
        if (markersEl) {
          markersEl.innerHTML = data.result.detectedMarkers.map(m => `• ${escapeHTML(m)}`).join("<br>");
        }
      }
    } catch(e) {
      console.warn("API failed:", e);
    }
  }

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
  function generateInnerMonologueHtml() {
    const cogMode = document.getElementById("select-cognitive-state")?.value || "focus";
    const routingMode = document.getElementById("select-routing")?.value || "intelligence";
    const thinkingMode = document.getElementById("select-thinking")?.value || "normal";
    
    let selfReflection = "";
    let priority = "MEDIUM";
    let confidence = 85;
    
    if (cogMode === "research") {
      selfReflection = "Scanning episodic memory partitions and scheduling recursive RAG search threads...";
      priority = "HIGH";
      confidence = 94;
    } else if (cogMode === "coding") {
      selfReflection = "Initiating Python sandbox compiler simulator. Verifying AST constraints...";
      priority = "CRITICAL";
      confidence = 98;
    } else if (cogMode === "creative") {
      selfReflection = "Relaxing constraints. Searching relationship linkage nodes for high similarity clusters...";
      priority = "LOW";
      confidence = 88;
    } else {
      selfReflection = "Awaiting prompt inputs. Maintaining high-priority feedback loops...";
      priority = "HIGH";
      confidence = 92;
    }

    return `
      <details class="inner-monologue-container" open>
        <summary>💭 Artificial Inner Monologue</summary>
        <div class="monologue-content">
          <p><strong>Self-Reflection:</strong> ${selfReflection}</p>
          <p><strong>Operating Mode:</strong> <span class="cog-mode">${cogMode.toUpperCase()}</span> | Route: <code>${routingMode}</code> | Think: <code>${thinkingMode}</code></p>
          <p><strong>Priority Evaluation:</strong> <span class="priority-label high">${priority}</span></p>
          <p><strong>Alternate Simulations:</strong> 3 outcomes simulated. Selecting optimal execution paths.</p>
          <div class="confidence-bar-wrapper">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:2px;">
              <span>Confidence Index:</span>
              <span>${confidence}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width: ${confidence}%; background:#22d3ee;"></div></div>
          </div>
        </div>
      </details>
    `;
  }

  function appendMessage(role, content, timestamp) {
    hasMessages = true;
    const div = document.createElement("div");
    div.className = `message ${role}`;
    
    let innerMonologue = "";
    if (role === "assistant") {
      innerMonologue = generateInnerMonologueHtml();
    }

    div.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "👤" : "<img src='alya.png' alt='Alya' style='width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;'>"}</div>
      <div>
        <div class="msg-content">
          ${innerMonologue}
          <div class="msg-text-body">${formatMarkdown(content)}</div>
        </div>
        <div class="msg-time">${formatTime(timestamp)}</div>
      </div>`;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function createStreamBubble() {
    hasMessages = true;
    const div = document.createElement("div");
    div.className = "message assistant";
    
    const innerMonologue = generateInnerMonologueHtml();

    div.innerHTML = `
      <div class="msg-avatar"><img src='alya.png' alt='Alya' style='width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;'></div>
      <div>
        <div class="msg-content">
          ${innerMonologue}
          <div class="msg-text-body"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
        </div>
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
        url = sanitizeUrl(url);
        if (!url) return "";
        return `<img src="${url}" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        const safeSrc = sanitizeUrl(src);
        if (!safeSrc) return "";
        const safeAlt = escapeHTML(alt);
        return `<img src="${safeSrc}" alt="${safeAlt}" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;
      }) // Convert markdown images
      .replace(/(https:\/\/image\.pollinations\.ai[^\s]+)/g, (match, url) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) return "";
        return `<img src="${safeUrl}" style="max-width:100%; border-radius:8px; margin-top:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;
      }) // Auto-embed raw pollinations URLs
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
  let wakeWordRecognition = null;
  let isWakeWordEnabled = false;

  // Web Audio Visualizer state
  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let canvasCtx = null;
  let isVisualizing = false;
  let micStreamForVisualizer = null;

  // Check support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "hi-IN";

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
      if (inputEl.value.trim()) {
        lastMessageWasVoice = true;
        sendMessage(inputEl.value);
      }
    } else { 
      inputEl.value = "";
      startListening(); 
    }
  });

  voiceStop.addEventListener("click", stopListening);

  async function startListening() {
    if (!recognition) return;
    
    // Set language dynamically based on persona
    const selectPersona = document.getElementById("select-persona");
    const currentMood = selectPersona ? selectPersona.value : "normal";
    const hasHindi = currentMood === "normal" || currentMood === "roast" || currentMood === "study";
    recognition.lang = hasHindi ? "hi-IN" : "en-US";

    isListening = true;
    voiceBtn.classList.add("recording");
    voiceIndicator.classList.add("active");
    inputEl.placeholder = "Listening...";
    recognition.start();

    // Start wave visualizer
    try {
      micStreamForVisualizer = await navigator.mediaDevices.getUserMedia({ audio: true });
      startVisualizer(micStreamForVisualizer);
    } catch (e) {
      console.warn("Could not get media stream for visualizer:", e);
    }
  }

  function stopListening() {
    if (!recognition) return;
    clearTimeout(autoSendTimer);
    isListening = false;
    voiceBtn.classList.remove("recording");
    voiceIndicator.classList.remove("active");
    inputEl.placeholder = "Message Alya...";
    try { recognition.stop(); } catch {}

    // Stop wave visualizer
    stopVisualizer();
    if (micStreamForVisualizer) {
      micStreamForVisualizer.getTracks().forEach(track => track.stop());
      micStreamForVisualizer = null;
    }
    
    restartWakeWordIfEnabled();
  }

  function startVisualizer(stream) {
    try {
      if (!voiceCanvas) return;
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 256;
      audioSource = audioContext.createMediaStreamSource(stream);
      audioSource.connect(audioAnalyser);

      canvasCtx = voiceCanvas.getContext("2d");
      voiceCanvas.width = voiceCanvas.offsetWidth * (window.devicePixelRatio || 1);
      voiceCanvas.height = voiceCanvas.offsetHeight * (window.devicePixelRatio || 1);

      isVisualizing = true;
      drawWave();
    } catch (e) {
      console.error("Failed to start voice wave visualizer:", e);
    }
  }

  function drawWave() {
    if (!isVisualizing || !canvasCtx) return;
    requestAnimationFrame(drawWave);

    const width = voiceCanvas.width;
    const height = voiceCanvas.height;
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioAnalyser.getByteTimeDomainData(dataArray);

    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.lineWidth = 3 * (window.devicePixelRatio || 1);
    canvasCtx.strokeStyle = "#22d3ee";
    canvasCtx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  function stopVisualizer() {
    isVisualizing = false;
    if (audioSource) {
      audioSource.disconnect();
      audioSource = null;
    }
    if (canvasCtx && voiceCanvas) {
      canvasCtx.clearRect(0, 0, voiceCanvas.width, voiceCanvas.height);
    }
  }

  // Text-to-speech for responses (Fallback only)
  function speak(text) {
    elevenLabsVoicePlayed = false;

    // Check if ElevenLabs socket audio plays within 600ms
    setTimeout(() => {
      if (elevenLabsVoicePlayed) return;

      if (!synthesis || !text) return;
      
      const cleanText = text
        .replace(/<[^>]+>/g, '')
        .replace(/[*_~`]/g, '')
        .trim();

      if (!cleanText) return;

      synthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Simple language detection (Hindi vs English)
      const hasHindi = /[\u0900-\u097F]/.test(cleanText);
      utterance.lang = hasHindi ? "hi-IN" : "en-US";
      utterance.rate = 1.0;
      
      const voices = synthesis.getVoices();
      let voice = null;
      if (hasHindi) {
        voice = voices.find(v => v.lang.includes("hi") && v.name.toLowerCase().includes("female")) 
             || voices.find(v => v.lang.includes("hi"));
      } else {
        voice = voices.find(v => v.lang.includes("en") && v.name.toLowerCase().includes("google"))
             || voices.find(v => v.lang.includes("en") && v.name.toLowerCase().includes("natural"))
             || voices.find(v => v.lang.includes("en"));
      }
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setHologramState("talking");
        displayCaptions(cleanText);
        if (typeof voiceOrbController !== "undefined" && voiceOrbController.active) {
          voiceOrbController.setState("speaking", cleanText);
        }
      };

      utterance.onend = () => {
        setHologramState("idle");
        hideCaptionsDelayed();
        if (typeof voiceOrbController !== "undefined" && voiceOrbController.active) {
          voiceOrbController.setState("idle");
        }
        if (lastMessageWasVoice && !isListening) {
          startListening();
        } else {
          restartWakeWordIfEnabled();
        }
      };

      synthesis.speak(utterance);
    }, 600);
  }

  // --- Fetch Bridge Status & Resources ---
  async function safeFetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn(`[Alya OS] Failed fetching API endpoint: ${url}`);
      return null;
    }
  }

  async function fetchStatus() {
    if (socket && !socket.connected) return;
    // 1. Fetch Health Data
    const health = await safeFetchJson("/api/health");
    if (health) {
      // Update Groq API status
      const groqEl = document.getElementById("status-groq");
      if (groqEl) {
        const dotEl = groqEl.querySelector(".status-dot");
        const valEl = groqEl.querySelector(".status-value");
        if (dotEl) dotEl.className = `status-dot ${health.groqApi ? "online" : "offline"}`;
        if (valEl) valEl.textContent = health.groqApi ? "Connected" : "Offline";
      }

      // Update Gemini API status
      const geminiEl = document.getElementById("status-gemini");
      if (geminiEl) {
        const dotEl = geminiEl.querySelector(".status-dot");
        const valEl = geminiEl.querySelector(".status-value");
        if (dotEl) dotEl.className = `status-dot ${health.geminiApi ? "online" : "offline"}`;
        if (valEl) valEl.textContent = health.geminiApi ? "Connected" : "Offline";
      }

      // Update OpenRouter status
      const openrouterEl = document.getElementById("status-openrouter");
      if (openrouterEl) {
        const dotEl = openrouterEl.querySelector(".status-dot");
        const valEl = openrouterEl.querySelector(".status-value");
        if (dotEl) dotEl.className = `status-dot ${health.openrouterApi ? "online" : "offline"}`;
        if (valEl) valEl.textContent = health.openrouterApi ? "Connected" : "Offline";
      }

      // Update model
      const modelEl = document.getElementById("status-model");
      if (modelEl) {
        const modelDot = modelEl.querySelector(".status-dot");
        const modelVal = modelEl.querySelector(".status-value");
        const anyOnline = health.groqApi || health.geminiApi || health.openrouterApi;
        if (modelDot) modelDot.className = `status-dot ${anyOnline ? "online" : "offline"}`;
        if (modelVal) modelVal.textContent = health.model || "—";
      }
    }

    // 2. Fetch Bridge Statuses
    const status = await safeFetchJson("/api/status");
    if (status && status.bridges) {
      const bridgeIcons = {
        discord: "💬", telegram: "✈️", slack: "💼", whatsapp: "📱", web: "🌐",
      };
      if (bridgeList) {
        bridgeList.innerHTML = "";
        for (const [name, info] of Object.entries(status.bridges)) {
          const item = document.createElement("div");
          const isClickableWa = name === "whatsapp" && !info.connected;
          item.className = `bridge-item ${isClickableWa ? "clickable" : ""}`;
          if (isClickableWa) {
            item.title = "Click to Link WhatsApp Bridge";
            item.addEventListener("click", openWhatsAppQR);
          }
          item.innerHTML = `
            <span class="bridge-icon">${bridgeIcons[name] || "🔗"}</span>
            <span class="bridge-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
            <span class="bridge-status ${info.connected ? "online" : "offline"}">${info.connected ? "Live" : "Off"}</span>`;
          bridgeList.appendChild(item);
        }
      }
    }

    // 3. Fetch System Resource Gauges
    const system = await safeFetchJson("/api/system");
    if (system) {
      const cpuCoresEl = document.getElementById("cpu-cores");
      const systemOsEl = document.getElementById("system-os");
      const ramUsedEl = document.getElementById("ram-used");
      const ramTotalEl = document.getElementById("ram-total");
      const ramPercentEl = document.getElementById("ram-percent");
      const ramProgress = document.getElementById("ram-progress");

      if (cpuCoresEl) cpuCoresEl.textContent = system.cpuCores || "-";
      if (systemOsEl) systemOsEl.textContent = (system.platform === "win32" ? "Windows" : system.platform) || "-";
      if (ramUsedEl) ramUsedEl.textContent = system.usedRAM || "0 GB";
      if (ramTotalEl) ramTotalEl.textContent = system.totalRAM || "0 GB";
      
      const ramPercent = system.ramPercent || 0;
      if (ramPercentEl) ramPercentEl.textContent = `${ramPercent}%`;
      if (ramProgress) {
        ramProgress.setAttribute("stroke-dasharray", `${ramPercent}, 100`);
      }
    }

    // 4. Fetch Reminders List
    const remindersData = await safeFetchJson("/api/reminders");
    const remindersList = document.getElementById("reminders-list");
    if (remindersList && remindersData && remindersData.reminders) {
      if (remindersData.reminders.length === 0) {
        remindersList.innerHTML = `<li class="reminder-empty">No active reminders</li>`;
      } else {
        remindersList.innerHTML = remindersData.reminders.map(rem => {
          const dateStr = rem.date ? new Date(rem.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
          const timeStr = rem.time || '';
          const schedStr = [dateStr, timeStr].filter(Boolean).join(' at ');
          return `
            <li class="reminder-item">
              <span class="reminder-text">${escapeHTML(rem.text || rem.reminder)}</span>
              <span class="reminder-time">⏰ ${escapeHTML(schedStr || 'Scheduled')}</span>
            </li>
          `;
        }).join("");
      }
    }
  }

  // Poll status every 10s
  setInterval(fetchStatus, 10000);
  fetchStatus(); // Fetch immediately on page load

  // --- Theme Selection ---
  const themeSelect = document.getElementById("select-theme");
  if (themeSelect) {
    const savedTheme = localStorage.getItem("alya-theme") || "dark";
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    themeSelect.addEventListener("change", (e) => {
      const selected = e.target.value;
      localStorage.setItem("alya-theme", selected);
      applyTheme(selected);
    });
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-light", "theme-cyberpunk", "theme-sage", "theme-sakura");
    if (theme !== "dark") {
      document.body.classList.add(`theme-${theme}`);
    }
  }

  // ============================================================
  // ============================================================
  // ✨ HOLOGRAM AVATAR STATE ENGINE (Redesigned as Video Call System)
  // ============================================================
  const hologramStatusText = document.getElementById("hologram-status");
  const hologramAvatar = document.getElementById("hologram-avatar");
  const eyeLeft = document.getElementById("eye-left");
  const eyeRight = document.getElementById("eye-right");
  const mouthLine = document.getElementById("mouth-line");

  // Video-Call Elements
  const mouthCavity = document.getElementById("mouth-cavity");
  const mouthTongue = document.getElementById("mouth-tongue");
  const mouthTeeth = document.getElementById("mouth-teeth");
  const mouthLips = document.getElementById("mouth-lips");
  const hudCaptionsOverlay = document.getElementById("hud-captions-overlay");
  const captionsText = document.getElementById("captions-text");
  
  const btnCallMute = document.getElementById("btn-call-mute");
  const btnCallVideo = document.getElementById("btn-call-video");
  const btnCallScreen = document.getElementById("btn-call-screen");
  const btnCallHangup = document.getElementById("btn-call-hangup");
  const pipVideo = document.getElementById("user-pip-video");
  const pipWindow = document.getElementById("user-pip-window");

  let isWebcamActive = false;
  let isScreenActive = false;
  let webcamStream = null;
  let screenStream = null;
  let callMuted = false;
  let callActive = true;
  let callDuration = 0;
  let callTimerId = null;
  let captionsTimeout = null;

  // Real-time SVG Mouth Morphing for Lip-Sync
  function updateMouthPaths(amp) {
    if (!mouthCavity || !mouthLips) return;

    if (amp <= 0.05) {
      // Closed Mouth (cute small line matching avatar)
      mouthCavity.setAttribute("d", "M 32 50 Q 50 53 68 50 Z");
      mouthCavity.setAttribute("fill", "none");
      mouthLips.setAttribute("d", "M 32 50 Q 50 53 68 50");
      if (mouthTongue) {
        mouthTongue.setAttribute("d", "M 36 50 Q 50 50 64 50 Z");
        mouthTongue.style.display = "none";
      }
      if (mouthTeeth) {
        mouthTeeth.setAttribute("d", "M 34 50 Q 50 50 66 50");
        mouthTeeth.style.display = "none";
      }
    } else {
      // Open Mouth
      const topY = 50 - amp * 6;
      const bottomY = 50 + amp * 18;
      const leftX = 32 - amp * 25 * 0.1;
      const rightX = 68 + amp * 25 * 0.1;

      // Inner cavity
      mouthCavity.setAttribute("d", `M ${leftX} 50 Q 50 ${topY} ${rightX} 50 Q 50 ${bottomY} ${leftX} 50 Z`);
      mouthCavity.setAttribute("fill", "#7a1f2d");

      // Lips outline
      mouthLips.setAttribute("d", `M ${leftX} 50 Q 50 ${topY} ${rightX} 50 Q 50 ${bottomY} ${leftX} 50 Z`);

      // Teeth shape at the top
      if (mouthTeeth) {
        const teethY = topY + 1.8;
        mouthTeeth.setAttribute("d", `M ${leftX + 2} ${teethY} Q 50 ${teethY + 2 + amp * 2} ${rightX - 2} ${teethY}`);
        mouthTeeth.style.display = "block";
      }

      // Tongue shape at the bottom
      if (mouthTongue) {
        const tongueTopY = bottomY - 3 - amp * 3;
        mouthTongue.setAttribute("d", `M ${leftX + 3} ${tongueTopY} Q 50 ${tongueTopY - 2} ${rightX - 3} ${tongueTopY} Q 50 ${bottomY - 1} ${leftX + 3} ${tongueTopY} Z`);
        mouthTongue.style.display = "block";
      }
    }
  }

  // Floating Captions/Subtitles
  function displayCaptions(text) {
    if (!hudCaptionsOverlay || !captionsText) return;
    if (captionsTimeout) clearTimeout(captionsTimeout);
    
    // Clean text from markdown tags
    const cleanText = text
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`#]/g, '')
      .trim();

    if (!cleanText) {
      hudCaptionsOverlay.style.opacity = "0";
      return;
    }

    captionsText.textContent = cleanText;
    hudCaptionsOverlay.style.opacity = "1";
  }

  function hideCaptionsDelayed() {
    if (captionsTimeout) clearTimeout(captionsTimeout);
    captionsTimeout = setTimeout(() => {
      if (hudCaptionsOverlay) hudCaptionsOverlay.style.opacity = "0";
    }, 4500);
  }

  // Call Duration Timer
  function startCallTimer() {
    if (callTimerId) clearInterval(callTimerId);
    callDuration = 0;
    const timerEl = document.getElementById("call-duration-timer");
    if (!timerEl) return;
    timerEl.textContent = "00:00";
    callTimerId = setInterval(() => {
      callDuration++;
      const mins = String(Math.floor(callDuration / 60)).padStart(2, "0");
      const secs = String(callDuration % 60).padStart(2, "0");
      timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerId) {
      clearInterval(callTimerId);
      callTimerId = null;
    }
  }

  // User Webcam (PiP) Stream
  async function startWebcam() {
    try {
      if (isScreenActive) stopScreenShare();
      
      const constraints = { video: { width: { ideal: 160 }, height: { ideal: 120 } } };
      webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (pipVideo) {
        pipVideo.srcObject = webcamStream;
        pipVideo.onloadedmetadata = () => pipVideo.play();
      }
      isWebcamActive = true;
      if (btnCallVideo) btnCallVideo.classList.add("active");
      if (pipWindow) pipWindow.classList.add("camera-on");
      displayCaptions("Camera feed activated");
      hideCaptionsDelayed();
    } catch (e) {
      console.warn("Could not start camera feed:", e);
      displayCaptions("Camera access blocked by user/OS");
      hideCaptionsDelayed();
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    isWebcamActive = false;
    if (btnCallVideo) btnCallVideo.classList.remove("active");
    if (pipWindow) pipWindow.classList.remove("camera-on");
    if (pipVideo) pipVideo.srcObject = null;
  }

  // Screen Share Stream
  async function startScreenShare() {
    try {
      if (isWebcamActive) stopWebcam();

      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (pipVideo) {
        pipVideo.srcObject = screenStream;
        pipVideo.onloadedmetadata = () => pipVideo.play();
      }
      isScreenActive = true;
      if (btnCallScreen) btnCallScreen.classList.add("active");
      if (pipWindow) pipWindow.classList.add("camera-on");
      
      // Auto shutdown screenshare when user stops sharing via browser bar
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
      
      displayCaptions("Sharing screen stream...");
      hideCaptionsDelayed();
    } catch (e) {
      console.warn("Could not start screen sharing:", e);
    }
  }

  function stopScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    isScreenActive = false;
    if (btnCallScreen) btnCallScreen.classList.remove("active");
    if (pipWindow) pipWindow.classList.remove("camera-on");
    if (pipVideo) pipVideo.srcObject = null;
  }

  // Bind Buttons
  if (btnCallMute) {
    btnCallMute.addEventListener("click", () => {
      callMuted = !callMuted;
      btnCallMute.classList.toggle("active", callMuted);
      btnCallMute.title = callMuted ? "Unmute Microphone" : "Mute Microphone";
      btnCallMute.innerHTML = callMuted ? '<span class="btn-icon">🔇</span>' : '<span class="btn-icon">🎙️</span>';
      
      // Attempt mute/unmute visualizer stream
      if (micStreamForVisualizer) {
        micStreamForVisualizer.getAudioTracks().forEach(t => t.enabled = !callMuted);
      }
      displayCaptions(callMuted ? "Microphone muted" : "Microphone unmuted");
      hideCaptionsDelayed();
    });
  }

  if (btnCallVideo) {
    btnCallVideo.addEventListener("click", async () => {
      if (isWebcamActive) {
        stopWebcam();
      } else {
        await startWebcam();
      }
    });
  }

  if (btnCallScreen) {
    btnCallScreen.addEventListener("click", async () => {
      if (isScreenActive) {
        stopScreenShare();
      } else {
        await startScreenShare();
      }
    });
  }

  if (btnCallHangup) {
    btnCallHangup.addEventListener("click", () => {
      if (callActive) {
        // Hang Up Call
        callActive = false;
        btnCallHangup.classList.add("active");
        btnCallHangup.title = "Reconnect Call";
        btnCallHangup.innerHTML = '<span class="btn-icon">🔄</span>';
        stopWebcam();
        stopScreenShare();
        stopCallTimer();
        setHologramState("idle");
        displayCaptions("Call disconnected");
        if (hologramStatusText) hologramStatusText.textContent = "System AI: Offline";
      } else {
        // Re-establish Call
        callActive = true;
        btnCallHangup.classList.remove("active");
        btnCallHangup.title = "End Call";
        btnCallHangup.innerHTML = '<span class="btn-icon">📞</span>';
        startCallTimer();
        displayCaptions("Call reconnected");
        hideCaptionsDelayed();
        setHologramState("idle");
      }
    });
  }

  // State Engine Switcher
  function setHologramState(state) {
    if (!hologramStatusText) return;
    if (callActive) {
      hologramStatusText.textContent = `System AI: ${state}`;
    }
    
    // Set class on avatar frame
    if (hologramAvatar) {
      hologramAvatar.className = "hologram-avatar";
      hologramAvatar.classList.add(state);
    }
    
    // Standard dummy logic compatibility
    if (state === "thinking") {
      if (eyeLeft) eyeLeft.setAttribute("r", "7");
      if (eyeRight) eyeRight.setAttribute("r", "7");
      if (mouthLine) mouthLine.setAttribute("d", "M 30 60 Q 50 50 70 60");
      updateMouthPaths(0);
    } else if (state === "talking") {
      if (eyeLeft) eyeLeft.setAttribute("r", "5");
      if (eyeRight) eyeRight.setAttribute("r", "5");
      animateHologramMouth();
    } else if (state === "listening") {
      if (eyeLeft) eyeLeft.setAttribute("r", "8");
      if (eyeRight) eyeRight.setAttribute("r", "8");
      if (mouthLine) mouthLine.setAttribute("d", "M 35 60 Q 50 75 65 60");
      updateMouthPaths(0);
    } else { // idle
      if (eyeLeft) eyeLeft.setAttribute("r", "5");
      if (eyeRight) eyeRight.setAttribute("r", "5");
      if (mouthLine) mouthLine.setAttribute("d", "M 35 65 Q 50 65 65 65");
      updateMouthPaths(0);
    }
  }

  let mouthAnimationId = null;
  function animateHologramMouth() {
    if (mouthAnimationId) cancelAnimationFrame(mouthAnimationId);
    
    let tick = 0;
    let pauseTimer = 0;
    let currentAmp = 0;
    
    function draw() {
      if (!hologramAvatar || !hologramAvatar.classList.contains("talking")) {
        updateMouthPaths(0);
        return;
      }
      
      tick += 0.25;
      pauseTimer += 0.016; // Increments at ~60fps
      
      let targetAmp = 0;
      
      // Pause mouth movement every 1.6 seconds for 0.25s (speech rhythm simulation)
      const cycleTime = pauseTimer % 1.6;
      if (cycleTime > 1.35) {
        targetAmp = 0;
      } else {
        // Natural vowel cadence oscillation
        targetAmp = Math.abs(Math.sin(tick * 0.38)) * (0.35 + Math.random() * 0.65);
      }
      
      // Smooth interpolation for fluid lip movements
      currentAmp += (targetAmp - currentAmp) * 0.28;
      
      updateMouthPaths(currentAmp);
      mouthAnimationId = requestAnimationFrame(draw);
    }
    draw();
  }

  // Hook voice recorder states to new video-call system
  const origStartListening = startListening;
  startListening = async function() {
    await origStartListening();
    setHologramState("listening");
    displayCaptions("Listening...");
  };

  const origStopListening = stopListening;
  stopListening = function() {
    origStopListening();
    setHologramState("idle");
    displayCaptions("");
  };

  // Launch initial systems
  window.displayCaptions = displayCaptions;
  window.hideCaptionsDelayed = hideCaptionsDelayed;
  startCallTimer();

  // ============================================================
  // 🧬 3D NEURAL COGNITIVE SPACE MIND-MAP UNIVERSE
  // ============================================================
  let nodes = [
    { name: "User", x: -80, y: -40, z: 20, color: "#10b981", size: 14 },
    { name: "Alya OS", x: 0, y: 0, z: 0, color: "#06b6d4", size: 18 },
    { name: "Local Host OS", x: 70, y: 50, z: -30, color: "#f59e0b", size: 12 },
    { name: "Llama 3.3", x: -60, y: 60, z: -60, color: "#a855f7", size: 12 },
    { name: "Episodic Bank", x: 80, y: -60, z: 40, color: "#ec4899", size: 10 },
    { name: "Semantic Bank", x: 20, y: 80, z: 80, color: "#3b82f6", size: 10 },
    { name: "Emotional Guard", x: -40, y: -80, z: -40, color: "#ef4444", size: 10 },
  ];

  let links = [
    { source: 0, target: 1, label: "Creator" },
    { source: 1, target: 2, label: "Runs On" },
    { source: 1, target: 3, label: "Powered by" },
    { source: 1, target: 4, label: "Stores" },
    { source: 1, target: 5, label: "Indexes" },
    { source: 1, target: 6, label: "Monitors" },
  ];

  let angleX = 0.003;
  let angleY = 0.005;

  function rotate3D() {
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    nodes.forEach(n => {
      const y1 = n.y * cosX - n.z * sinX;
      const z1 = n.z * cosX + n.y * sinX;
      n.y = y1;
      n.z = z1;
    });

    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    nodes.forEach(n => {
      const x1 = n.x * cosY - n.z * sinY;
      const z1 = n.z * cosY + n.x * sinY;
      n.x = x1;
      n.z = z1;
    });
  }

  function drawDreamspace() {
    const canvas = document.getElementById("dreamspace-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const fov = 300;

    ctx.clearRect(0, 0, width, height);

    // Rotate
    rotate3D();

    // Draw links
    links.forEach(l => {
      const s = nodes[l.source];
      const t = nodes[l.target];
      if (!s || !t) return;

      const scaleS = fov / (fov + s.z);
      const scaleT = fov / (fov + t.z);

      const sx = cx + s.x * scaleS;
      const sy = cy + s.y * scaleS;
      const tx = cx + t.x * scaleT;
      const ty = cy + t.y * scaleT;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      const alpha = Math.max(0.1, Math.min(0.8, (2 - (s.z + t.z) / 200) / 2));
      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha * 0.4})`;
      ctx.lineWidth = 1 * Math.min(scaleS, scaleT);
      ctx.stroke();

      if (alpha > 0.5) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
        ctx.font = `${8 * Math.min(scaleS, scaleT)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(l.label, (sx + tx) / 2, (sy + ty) / 2);
      }
    });

    // Draw nodes sorted by depth
    const sorted = [...nodes].map((n, idx) => ({ ...n, origIndex: idx }));
    sorted.sort((a, b) => b.z - a.z);

    sorted.forEach(n => {
      const scale = fov / (fov + n.z);
      const x = cx + n.x * scale;
      const y = cy + n.y * scale;
      const size = n.size * scale;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 10 * scale;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = `bold ${Math.max(8, 10 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(n.name, x, y - size - 4);
    });

    requestAnimationFrame(drawDreamspace);
  }

  async function fetchCognitiveData() {
    try {
      const res = await fetch("/api/cognitive");
      const data = await res.json();
      
      if (data.emotionalState) {
        const e = data.emotionalState;
        const stressFill = document.getElementById("stress-fill");
        const frustrationFill = document.getElementById("frustration-fill");
        const excitementFill = document.getElementById("excitement-fill");
        const confusionFill = document.getElementById("confusion-fill");
        
        if (stressFill) stressFill.style.width = `${(e.stress || 0) * 100}%`;
        if (frustrationFill) frustrationFill.style.width = `${(e.frustration || 0) * 100}%`;
        if (excitementFill) excitementFill.style.width = `${(e.excitement || 0) * 100}%`;
        if (confusionFill) confusionFill.style.width = `${(e.confusion || 0) * 100}%`;
      }

      const habitsList = document.getElementById("db-habits-list");
      if (habitsList) {
        if (!data.habits || data.habits.length === 0) {
          habitsList.innerHTML = `<li class="habit-empty">No habits mapped yet</li>`;
        } else {
          habitsList.innerHTML = data.habits.map(h => {
            const confPercent = Math.round((h.confidence || 0) * 100);
            return `<li>${escapeHTML(h.habit)} <span style="float:right;color:var(--accent-400)">${confPercent}% conf</span></li>`;
          }).join("");
        }
      }

      if (data.relationships && data.relationships.length > 0) {
        const baseNodes = [
          { name: "User", x: (Math.random() - 0.5)*180, y: (Math.random() - 0.5)*180, z: (Math.random() - 0.5)*180, color: "#10b981", size: 14 },
          { name: "Alya OS", x: 0, y: 0, z: 0, color: "#06b6d4", size: 18 }
        ];
        const baseLinks = [];

        data.relationships.forEach(r => {
          let fromIdx = baseNodes.findIndex(n => n.name === r.from);
          if (fromIdx === -1) {
            baseNodes.push({ name: r.from, x: (Math.random() - 0.5)*180, y: (Math.random() - 0.5)*180, z: (Math.random() - 0.5)*180, color: "#e2e8f0", size: 10 });
            fromIdx = baseNodes.length - 1;
          }
          let toIdx = baseNodes.findIndex(n => n.name === r.to);
          if (toIdx === -1) {
            baseNodes.push({ name: r.to, x: (Math.random() - 0.5)*180, y: (Math.random() - 0.5)*180, z: (Math.random() - 0.5)*180, color: "#94a3b8", size: 10 });
            toIdx = baseNodes.length - 1;
          }
          baseLinks.push({ source: fromIdx, target: toIdx, label: r.relation });
        });

        nodes = baseNodes;
        links = baseLinks;
      }
    } catch (err) {
      console.error("Failed to load cognitive database:", err);
    }
  }

  // ============================================================
  // ⚙️ WORKFLOW AUTOMATION ENGINE FRONTEND
  // ============================================================
  async function fetchWorkflows() {
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      const listEl = document.getElementById("workflows-list");
      if (!listEl) return;

      if (!data.workflows || data.workflows.length === 0) {
        listEl.innerHTML = `<div style="grid-column:1/-1" class="reminder-empty">No active automation workflows configured.</div>`;
      } else {
        listEl.innerHTML = data.workflows.map(wf => `
          <div class="wf-card" id="wf-card-${escapeHTML(wf.id)}">
            <div class="wf-card-header">
              <h5>${escapeHTML(wf.name)}</h5>
              <span class="wf-status ${wf.active ? 'active' : 'inactive'}">${wf.active ? 'Active' : 'Inactive'}</span>
            </div>
            <p><strong>Trigger:</strong> ${escapeHTML(wf.trigger)}</p>
            <p><strong>Actions:</strong> ${wf.actions.map(escapeHTML).join(" ➔ ")}</p>
            <div class="wf-card-actions">
              <button class="btn-wf-action btn-wf-trigger" data-id="${escapeHTML(wf.id)}">🚀 Run Trigger</button>
              <button class="btn-wf-action btn-wf-toggle" data-id="${escapeHTML(wf.id)}" data-active="${wf.active ? 'false' : 'true'}">
                ${wf.active ? 'Disable' : 'Enable'}
              </button>
              <button class="btn-wf-action btn-wf-delete" data-id="${escapeHTML(wf.id)}">❌ Delete</button>
            </div>
          </div>
        `).join("");

        // Bind clicks
        listEl.querySelectorAll(".btn-wf-trigger").forEach(btn => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            btn.textContent = "⏳ Simulating...";
            try {
              const runRes = await fetch("/api/workflows/trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
              });
              if (runRes.ok) {
                btn.textContent = "✅ Success";
                setTimeout(() => btn.textContent = "🚀 Run Trigger", 2000);
              }
            } catch {
              btn.textContent = "❌ Failed";
            }
          });
        });

        listEl.querySelectorAll(".btn-wf-toggle").forEach(btn => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const active = btn.getAttribute("data-active") === "true";
            const toggleRes = await fetch("/api/workflows/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, active })
            });
            if (toggleRes.ok) fetchWorkflows();
          });
        });

        listEl.querySelectorAll(".btn-wf-delete").forEach(btn => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Delete this workflow rule?")) {
              const delRes = await fetch("/api/workflows/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
              });
              if (delRes.ok) fetchWorkflows();
            }
          });
        });
      }
    } catch (e) {
      console.error("Failed to fetch workflows:", e);
    }
  }

  // Create workflow submit
  const btnCreateWf = document.getElementById("btn-create-wf");
  if (btnCreateWf) {
    btnCreateWf.addEventListener("click", async () => {
      const name = document.getElementById("wf-name").value.trim();
      const trigger = document.getElementById("wf-trigger").value.trim();
      const actionsText = document.getElementById("wf-actions").value.trim();

      if (!name || !trigger || !actionsText) {
        alert("Please fill in all workflow rule fields.");
        return;
      }

      const actions = actionsText.split(",").map(a => a.trim()).filter(Boolean);

      try {
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, trigger, actions })
        });
        if (res.ok) {
          document.getElementById("wf-name").value = "";
          document.getElementById("wf-trigger").value = "";
          document.getElementById("wf-actions").value = "";
          fetchWorkflows();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // ============================================================
  // ⚡ NAVIGATION TABS INITIALIZATION
  // ============================================================
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.add("active");

      if (tabId === "dreamspace-pane") {
        fetchCognitiveData();
      } else if (tabId === "automation-pane") {
        fetchWorkflows();
      }
    });
  });

  // ============================================================
  // 📊 SYSTEM REAL-TIME RESOURCE SPARKLINE PLOTTER
  // ============================================================
  const cpuSparklineHist = new Array(30).fill(0);
  const ramSparklineHist = new Array(30).fill(0);

  async function pollSparklines() {
    try {
      const res = await fetch("/api/system");
      if (!res.ok) return;
      const data = await res.json();
      
      const cpuVal = data.cpuPercent || 0;
      const ramVal = data.ramPercent || 0;

      const cpuPercentLbl = document.getElementById("cpu-percent-lbl");
      const ramPercentLbl = document.getElementById("ram-percent-lbl");
      if (cpuPercentLbl) cpuPercentLbl.textContent = `${cpuVal}%`;
      if (ramPercentLbl) ramPercentLbl.textContent = `${ramVal}%`;

      cpuSparklineHist.shift();
      cpuSparklineHist.push(cpuVal);

      ramSparklineHist.shift();
      ramSparklineHist.push(ramVal);

      drawSparkline("cpu-sparkline", cpuSparklineHist);
      drawSparkline("ram-sparkline", ramSparklineHist);
    } catch (e) {
      // Ignore errors
    }
  }

  function drawSparkline(canvasId, historyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(6, 182, 212, 0.35)");
    gradient.addColorStop(1, "rgba(6, 182, 212, 0)");

    ctx.beginPath();
    const step = width / (historyData.length - 1);
    historyData.forEach((val, i) => {
      const y = height - (val / 100) * (height - 4) - 2;
      const x = i * step;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(6, 182, 212, 0.4)";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // ============================================================
  // ⚡ CREATOR & CODER STUDIO CLIENT LOGIC
  // ============================================================
  const studioTopic = document.getElementById("studio-topic");
  const studioPlatform = document.getElementById("studio-platform");
  const studioOutput = document.getElementById("studio-output");
  
  const builderFilename = document.getElementById("builder-filename");
  const builderCode = document.getElementById("builder-code");
  const builderOutput = document.getElementById("builder-output");

  const coderFilepath = document.getElementById("coder-filepath");
  const coderContent = document.getElementById("coder-content");
  const coderOutput = document.getElementById("coder-output");

  const ctrlX = document.getElementById("ctrl-x");
  const ctrlY = document.getElementById("ctrl-y");
  const ctrlExe = document.getElementById("ctrl-exe");
  const ctrlKeys = document.getElementById("ctrl-keys");
  const ctrlOutput = document.getElementById("ctrl-output");
  const screenshotPreview = document.getElementById("ctrl-screenshot-preview");
  const screenshotImg = document.getElementById("live-screenshot-img");

  async function callDirectTool(toolName, args) {
    try {
      const res = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: toolName, args })
      });
      const data = await res.json();
      return data.success ? data.result : `Error: ${data.error}`;
    } catch (e) {
      return `Connection failure: ${e.message}`;
    }
  }

  // 📱 AI Content Studio
  document.getElementById("btn-studio-generate")?.addEventListener("click", async () => {
    if (!studioTopic.value.trim()) return alert("Please specify a topic first!");
    studioOutput.style.display = "block";
    studioOutput.textContent = "💡 Running Influencer Content Synthesizer...";
    const result = await callDirectTool("influencer_studio", {
      topic: studioTopic.value,
      platform: studioPlatform.value
    });
    studioOutput.textContent = result;
  });

  document.getElementById("btn-studio-viral")?.addEventListener("click", async () => {
    if (!studioTopic.value.trim()) return alert("Please specify a topic first!");
    studioOutput.style.display = "block";
    studioOutput.textContent = "📊 Scanning YouTube, Instagram & X trends for virality score...";
    const result = await callDirectTool("influencer_studio", {
      topic: studioTopic.value + " viral trend prediction search",
      platform: studioPlatform.value
    });
    studioOutput.textContent = result;
  });

  // 💻 HTML App Builder
  document.getElementById("btn-builder-deploy")?.addEventListener("click", async () => {
    const filename = builderFilename.value.trim() || "landing_page.html";
    const promptOrCode = builderCode.value.trim();
    if (!promptOrCode) return alert("Please enter custom HTML code or template prompt!");
    
    builderOutput.style.display = "block";
    builderOutput.textContent = "⚙️ Rendering custom template files & deploying local server...";
    
    let htmlCode = promptOrCode;
    if (!promptOrCode.toLowerCase().includes("<html")) {
      htmlCode = `<!DOCTYPE html>
<html>
<head>
  <title>Alya App Studio - Generated Landing</title>
  <style>
    body { background: #0a0f1d; color: #e2e8f0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: #111827; border: 1px solid #1f2937; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    h1 { color: #06b6d4; margin-top: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✨ Generated App Interface</h1>
    <p>${promptOrCode}</p>
    <button onclick="alert('Demo interactive state!')" style="background:#06b6d4; color:#fff; border:none; padding:10px 20px; border-radius:6px; cursor:pointer;">Action Button</button>
  </div>
</body>
</html>`;
    }

    const result = await callDirectTool("app_builder", { filename, code: htmlCode });
    builderOutput.textContent = result;
  });

  // 💻 Autonomous Coder Copilot
  document.getElementById("btn-coder-read")?.addEventListener("click", async () => {
    const filePath = coderFilepath.value.trim();
    if (!filePath) return alert("Please specify target file path!");
    coderOutput.style.display = "block";
    coderOutput.textContent = "🔍 Loading workspace file lines...";
    const result = await callDirectTool("autonomous_coder", { filePath, action: "read" });
    coderOutput.textContent = result;
  });

  document.getElementById("btn-coder-analyze")?.addEventListener("click", async () => {
    const filePath = coderFilepath.value.trim();
    if (!filePath) return alert("Please specify target file path!");
    coderOutput.style.display = "block";
    coderOutput.textContent = "🛡️ Starting codebase parser & JS Function static dry-run checks...";
    const result = await callDirectTool("autonomous_coder", { filePath, action: "analyze" });
    coderOutput.textContent = result;
  });

  document.getElementById("btn-coder-write")?.addEventListener("click", async () => {
    const filePath = coderFilepath.value.trim();
    const content = coderContent.value;
    if (!filePath || !content) return alert("Please specify file path and provide contents to write!");
    coderOutput.style.display = "block";
    coderOutput.textContent = "💾 Committing in-place modifications to file...";
    const result = await callDirectTool("autonomous_coder", { filePath, action: "write", content });
    coderOutput.textContent = result;
  });

  // 🖥️ Windows Remote System Control
  document.getElementById("btn-ctrl-screenshot")?.addEventListener("click", async () => {
    ctrlOutput.style.display = "block";
    ctrlOutput.textContent = "📸 Capturing host screen buffer...";
    const result = await callDirectTool("take_screenshot", {});
    ctrlOutput.textContent = result;
    
    screenshotPreview.style.display = "block";
    screenshotImg.src = "/screenshot.png?t=" + Date.now();
  });

  document.getElementById("btn-ctrl-click")?.addEventListener("click", async () => {
    const x = parseInt(ctrlX.value) || 0;
    const y = parseInt(ctrlY.value) || 0;
    ctrlOutput.style.display = "block";
    ctrlOutput.textContent = `🖱️ Setting cursor position to X: ${x}, Y: ${y} and sending click...`;
    const result = await callDirectTool("mouse_control", { x, y, click: true });
    ctrlOutput.textContent = result;
  });

  document.getElementById("btn-ctrl-keys")?.addEventListener("click", async () => {
    const text = ctrlKeys.value;
    if (!text) return alert("Specify keystroke values!");
    ctrlOutput.style.display = "block";
    ctrlOutput.textContent = `⌨️ Triggering keyboard text payload: "${text}"`;
    const result = await callDirectTool("keyboard_type", { text });
    ctrlOutput.textContent = result;
  });

  document.getElementById("btn-ctrl-exe")?.addEventListener("click", async () => {
    const command = ctrlExe.value.trim();
    if (!command) return alert("Specify target executable command!");
    ctrlOutput.style.display = "block";
    ctrlOutput.textContent = `🚀 Invoking Start-Process command: "${command}"`;
    const result = await callDirectTool("open_application", { command });
    ctrlOutput.textContent = result;
  });

  // ============================================================
  // ⚡ ADITIONAL PREMIUM CORE LOGIC
  // ============================================================

  // 1. Render Free Tier State Persistence Backup & Sync
  async function backupStateToLocal() {
    try {
      const res = await fetch("/api/state/sync");
      const data = await res.json();
      localStorage.setItem("alya_render_sync", JSON.stringify(data));
    } catch (e) {
      console.warn("State backup failed:", e);
    }
  }

  async function rehydrateStateFromLocal() {
    try {
      const cached = localStorage.getItem("alya_render_sync");
      if (cached) {
        await fetch("/api/state/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: cached
        });
        console.log("🧬 Render local state re-hydrated successfully.");
      }
    } catch (e) {
      console.warn("State re-hydration failed:", e);
    }
  }

  // 2. Cognitive State Socket events
  socket.on("cognitive_state", (data) => {
    const loadFill = document.getElementById("cognitive-load-fill");
    const loadTxt = document.getElementById("txt-cognitive-load");
    const fatigueTxt = document.getElementById("txt-fatigue-status");
    const styleTxt = document.getElementById("txt-dominant-style");

    if (loadFill && loadTxt) {
      const loadVal = data.contradictionCount > 0 ? 0.75 : 0.25;
      loadFill.style.width = `${loadVal * 100}%`;
      loadTxt.textContent = loadVal > 0.5 ? `High (${loadVal})` : `Low (${loadVal})`;
    }
    if (fatigueTxt) {
      if (data.fatigueAlert) {
        fatigueTxt.textContent = "Fatigued (Suggest Break!)";
        fatigueTxt.style.color = "#ef4444";
      } else {
        fatigueTxt.textContent = "Calm";
        fatigueTxt.style.color = "#10b981";
      }
    }
    if (styleTxt) {
      styleTxt.textContent = data.dominantStyle || "analytical";
    }

    if (data.contradictionMsg) {
      appendSystemMessage(`⚠️ **Contradiction Detected**: ${data.contradictionMsg}`);
    }
  });

  // Helper to print system warnings in chat
  function appendSystemMessage(text) {
    const container = document.getElementById("messages");
    if (!container) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = "message system-warning";
    msgDiv.style.background = "rgba(239, 68, 68, 0.1)";
    msgDiv.style.borderLeft = "4px solid #ef4444";
    msgDiv.style.padding = "10px";
    msgDiv.style.margin = "8px 0";
    msgDiv.style.borderRadius = "4px";
    msgDiv.style.color = "#f87171";
    msgDiv.style.fontSize = "13px";
    msgDiv.textContent = text;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  // 3. GDPR Selective Purge Mode
  document.getElementById("btn-forget-purge")?.addEventListener("click", async () => {
    const input = document.getElementById("forget-keywords");
    if (!input.value.trim()) return alert("Enter keywords to purge!");
    const keywords = input.value.split(",").map(k => k.trim());
    
    try {
      const res = await fetch("/api/memory/forget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords })
      });
      const data = await res.json();
      if (data.success) {
        alert("✨ Matching memory nodes purged successfully!");
        input.value = "";
        backupStateToLocal();
      }
    } catch (e) {
      alert("Purge failed: " + e.message);
    }
  });

  // 4. Custom Slash Commands
  document.getElementById("btn-create-slash")?.addEventListener("click", async () => {
    const trigger = document.getElementById("slash-cmd-trigger").value.trim();
    const prompt = document.getElementById("slash-cmd-prompt").value.trim();
    if (!trigger || !prompt) return alert("Fill in trigger and prompt!");

    try {
      const res = await fetch("/api/workflows/slash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger, prompt })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Slash command ${trigger} registered!`);
        document.getElementById("slash-cmd-trigger").value = "";
        document.getElementById("slash-cmd-prompt").value = "";
        backupStateToLocal();
      }
    } catch (e) {
      alert("Failed to register command.");
    }
  });

  // 5. Time Capsule Scheduler
  document.getElementById("btn-capsule-schedule")?.addEventListener("click", async () => {
    const msg = document.getElementById("capsule-msg").value.trim();
    const date = document.getElementById("capsule-date").value;
    if (!msg || !date) return alert("Specify message and delivery date!");

    try {
      const res = await fetch("/api/timecapsule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, deliverDate: date })
      });
      const data = await res.json();
      if (data.success) {
        alert("⏳ Time Capsule sealed and scheduled!");
        document.getElementById("capsule-msg").value = "";
        document.getElementById("capsule-date").value = "";
        backupStateToLocal();
      }
    } catch (e) {
      alert("Failed to schedule capsule.");
    }
  });

  // 6. JS Execution Sandbox
  const sandboxCode = document.getElementById("sandbox-code");
  const sandboxOutput = document.getElementById("sandbox-output");
  document.getElementById("btn-sandbox-run")?.addEventListener("click", async () => {
    const code = sandboxCode.value.trim();
    if (!code) return alert("Write JS sandbox code first!");
    sandboxOutput.style.display = "block";
    sandboxOutput.textContent = "⚙️ Executing sandbox code...";

    const result = await callDirectTool("run_code_sandbox", { code });
    sandboxOutput.textContent = result;
  });

  // 7. Global Mood Theme Switcher (Emotion-Reactive UI)
  const globalMoodSelect = document.getElementById("select-global-mood");
  globalMoodSelect?.addEventListener("change", () => {
    const mood = globalMoodSelect.value;
    // Apply visual styling themes
    document.documentElement.style.setProperty("--accent-500", "#06b6d4"); // Reset default
    document.body.className = document.body.className.replace(/theme-\S+/g, "");

    if (mood === "roast") {
      document.documentElement.style.setProperty("--accent-500", "#ef4444"); // Red glow
      document.body.classList.add("theme-roast");
    } else if (mood === "socratic") {
      document.documentElement.style.setProperty("--accent-500", "#eab308"); // Gold glow
      document.body.classList.add("theme-socratic");
    } else if (mood === "therapy") {
      document.documentElement.style.setProperty("--accent-500", "#10b981"); // Forest Green glow
      document.body.classList.add("theme-therapy");
    } else if (mood === "mentor") {
      document.documentElement.style.setProperty("--accent-500", "#8b5cf6"); // Purple glow
      document.body.classList.add("theme-mentor");
    }
    
    // Notify server of mood change options
    socket.emit("set_mood", { mood });
  });

  // 8. Custom lore prompt save
  document.getElementById("btn-save-lore")?.addEventListener("click", () => {
    const lore = document.getElementById("custom-prompt-lore").value.trim();
    if (!lore) return alert("Write a prompt first!");
    socket.emit("save_lore", { lore });
    alert("✨ Personality Lore Engine updated!");
    backupStateToLocal();
  });

  // 9. Clipboard Watcher & Proactive helper
  let lastClipboard = "";
  setInterval(async () => {
    try {
      if (document.hasFocus() && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastClipboard && text.length > 5) {
          lastClipboard = text;
          // Trigger proactive suggestion if it looks like URL or code
          if (text.startsWith("http") || text.includes("function") || text.includes("const ")) {
            showProactiveSuggestion(text);
          }
        }
      }
    } catch (e) {
      console.warn("API failed:", e);
    }
  }, 3000);

  function showProactiveSuggestion(clipboardContent) {
    const container = document.getElementById("messages");
    if (!container) return;
    
    const div = document.createElement("div");
    div.className = "message proactive-suggestion";
    div.style.background = "rgba(6, 182, 212, 0.1)";
    div.style.borderLeft = "4px solid #06b6d4";
    div.style.padding = "10px";
    div.style.margin = "8px 0";
    div.style.borderRadius = "4px";
    div.style.fontSize = "12px";
    div.style.color = "#a5f3fc";
    
    let preview = escapeHTML(clipboardContent.substring(0, 60) + "...");
    div.innerHTML = `💡 **Clipboard Watcher**: Detected item: \`${preview}\`. <button id="btn-helper-ask" style="background:#06b6d4; border:none; padding:2px 8px; border-radius:4px; color:#000; font-size:10px; cursor:pointer;">Ask Alya to review this</button>`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    
    div.querySelector("#btn-helper-ask")?.addEventListener("click", () => {
      const input = document.getElementById("user-input");
      if (input) {
        input.value = `Explain or review this item from my clipboard: ${clipboardContent}`;
        div.remove();
        input.focus();
      }
    });
  }

  // 10. Idle Check-In Trigger
  let idleTimer = 0;
  document.addEventListener("keypress", () => { idleTimer = 0; });
  document.addEventListener("mousemove", () => { idleTimer = 0; });
  
  setInterval(() => {
    idleTimer++;
    if (idleTimer === 30) {
      // Proactive check-in from Alya
      socket.emit("chat", {
        message: "Hello Master, I noticed you have been idle. Is there any task or code review I can assist with? ✨",
        options: { isProactive: true }
      });
    }
  }, 1000);

  // 11. Experimental Mind & AR Lab Actions
  const btnSimulateTimeline = document.getElementById("btn-simulate-timeline");
  const btnCalculateRegret = document.getElementById("btn-calculate-regret");
  const btnScanDeception = document.getElementById("btn-scan-deception");
  const btnGenerateFinetune = document.getElementById("btn-generate-finetune");

  btnSimulateTimeline?.addEventListener("click", async () => {
    const decision = document.getElementById("timeline-decision").value.trim();
    const years = document.getElementById("timeline-years").value || 2;
    if (!decision) return alert("Describe a critical decision first!");

    const out = document.getElementById("timeline-output");
    out.style.display = "block";
    out.textContent = "🌌 Simulating timeline branches across multiverse cascades...";

    try {
      const res = await fetch("/api/experimental/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, yearsAgo: years })
      });
      const data = await res.json();
      if (data.success) {
        out.innerHTML = `<strong>Simulated Outcome (${escapeHTML(data.result.timeframe)}):</strong><br>${escapeHTML(data.result.simulatedOutcome)}`;
      }
    } catch (e) {
      out.textContent = "Error running multiverse branches.";
    }
  });

  btnCalculateRegret?.addEventListener("click", async () => {
    const decision = document.getElementById("regret-decision").value.trim();
    if (!decision) return alert("State your career/life choice first!");

    const out = document.getElementById("regret-output");
    out.style.display = "block";
    out.textContent = "🛡️ Computing Bezos Regret Minimization Framework scores...";

    try {
      const res = await fetch("/api/experimental/regret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await res.json();
      if (data.success) {
        out.innerHTML = `<strong>Result:</strong> ${escapeHTML(data.result.summary)}<br><small>Confidence Level: High. Calculation matches risk aversion formulas.</small>`;
      }
    } catch (e) {
      out.textContent = "Error calculating regret score.";
    }
  });

  btnScanDeception?.addEventListener("click", async () => {
    const text = document.getElementById("deception-text").value.trim();
    if (!text) return alert("Paste target statement text first!");

    const out = document.getElementById("deception-output");
    out.style.display = "block";
    out.textContent = "🕵️ Scanning stress qualifiers and deception markers...";

    try {
      const res = await fetch("/api/experimental/deception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (data.success) {
        out.innerHTML = `<strong>Deception Probability:</strong> ${escapeHTML(data.result.deceptionProbability)}%<br><strong>Verdict:</strong> ${escapeHTML(data.result.verdict)}`;
      }
    } catch (e) {
      out.textContent = "Error scanning statement.";
    }
  });

  btnGenerateFinetune?.addEventListener("click", async () => {
    const out = document.getElementById("finetune-output");
    out.style.display = "block";
    out.textContent = "🧬 Generating synthetic Q&A fine-tuning sets...";

    try {
      const res = await fetch("/api/experimental/finetune", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.success) {
        out.innerHTML = `<strong>Created ${escapeHTML(data.count)} training pairs!</strong><br><small>Data saved to data/experimental_state.json for local model ingestion.</small>`;
      }
    } catch (e) {
      out.textContent = "Error simulating fine-tuning.";
    }
  });

  // Socket triggers for XP and Self-Evolving AI Metrics
  socket.on("xp_earned", (data) => {
    const lvlEl = document.getElementById("gamification-level");
    const xpEl = document.getElementById("gamification-xp");
    const fillEl = document.getElementById("gamification-xp-fill");
    const streakEl = document.getElementById("gamification-streak");
    const skillsEl = document.getElementById("gamification-skills");

    if (lvlEl) lvlEl.textContent = `Level ${data.level}`;
    if (xpEl) xpEl.textContent = `${data.totalXp % 200} / 200 XP (Total: ${data.totalXp})`;
    if (fillEl) fillEl.style.width = `${((data.totalXp % 200) / 200) * 100}%`;
    if (streakEl) streakEl.textContent = `${data.streak} Day${data.streak > 1 ? "s" : ""} 🔥`;

    if (skillsEl && data.unlockedSkills) {
      skillsEl.innerHTML = "";
      data.unlockedSkills.forEach(skill => {
        const span = document.createElement("span");
        span.style.fontSize = "11px";
        span.style.background = "rgba(6, 182, 212, 0.1)";
        span.style.color = "var(--cyan-400)";
        span.style.padding = "3px 8px";
        span.style.borderRadius = "4px";
        span.style.border = "1px solid rgba(6, 182, 212, 0.2)";
        span.textContent = skill;
        skillsEl.appendChild(span);
      });
    }
  });

  socket.on("experimental_metrics", (data) => {
    const confText = document.getElementById("metric-confidence");
    const confFill = document.getElementById("metric-confidence-fill");
    const biasText = document.getElementById("metric-bias");
    const gapText = document.getElementById("metric-gap");

    if (confText && confFill) {
      confText.textContent = `${data.confidence}%`;
      confFill.style.width = `${data.confidence}%`;
      if (data.confidence < 70) {
        confFill.style.background = "#f59e0b"; // Warning gold
      } else {
        confFill.style.background = "#10b981"; // Secure green
      }
    }

    if (biasText) {
      if (data.bias.hasBias) {
        biasText.textContent = `Absolutist Phrase detected (${data.bias.score}% intensity)`;
        biasText.style.color = "#f59e0b";
      } else {
        biasText.textContent = "Neutral (0%)";
        biasText.style.color = "#10b981";
      }
    }

    if (gapText) {
      if (data.gap.hasGap) {
        gapText.textContent = `Gap detected: "${data.gap.topic}"`;
        gapText.style.color = "#ef4444";
      } else {
        gapText.textContent = "None";
        gapText.style.color = "var(--text-300)";
      }
    }
  });

  // Socket triggers for AI Firewall & Security routing
  socket.on("security_routing", (data) => {
    const modelEl = document.getElementById("routing-model");
    const latencyEl = document.getElementById("routing-latency");
    const queryCostEl = document.getElementById("routing-query-cost");
    const totalCostEl = document.getElementById("routing-total-cost");

    if (modelEl) modelEl.textContent = data.optimalModel;
    if (latencyEl) latencyEl.textContent = data.estimatedLatency;
    if (queryCostEl) queryCostEl.textContent = `$${data.estimatedCostUSD.toFixed(5)} USD`;
    if (totalCostEl) totalCostEl.textContent = `$${data.accumulatedStats.totalCostUSD.toFixed(4)} USD`;
    
    // Auto refresh logs when threats occur
    loadSecurityStats();
  });

  async function loadSecurityStats() {
    try {
      const res = await fetch("/api/security/stats");
      const data = await res.json();
      if (data.success) {
        const totalCostEl = document.getElementById("routing-total-cost");
        if (totalCostEl && data.costStats) {
          totalCostEl.textContent = `$${data.costStats.totalCostUSD.toFixed(4)} USD`;
        }

        const logsEl = document.getElementById("firewall-logs");
        const statusEl = document.getElementById("firewall-status");
        if (logsEl) {
          if (!data.threats || data.threats.length === 0) {
            logsEl.innerHTML = `<div style="color: var(--text-400); text-align: center;">No intrusion threats logged.</div>`;
            if (statusEl) {
              statusEl.textContent = "🛡️ Secure & Encrypted";
              statusEl.style.color = "#10b981";
            }
          } else {
            logsEl.innerHTML = data.threats.map(t => {
              return `<div style="color: #ef4444; border-bottom: 1px solid rgba(239, 68, 68, 0.15); padding: 4px 0; line-height:1.2;">
                [${escapeHTML(new Date(t.timestamp).toLocaleTimeString())}] Score: ${escapeHTML(t.threatScore)}<br>
                Pattern: "${escapeHTML(t.matchedPattern)}"<br>
                Input: "${escapeHTML(t.promptPreview)}"
              </div>`;
            }).join("");
            if (statusEl) {
              statusEl.textContent = "⚠️ Intrusion Prevented";
              statusEl.style.color = "#f59e0b";
            }
          }
        }
      }
    } catch (e) {
      console.warn("API failed:", e);
    }
  }

  // Query experimental stats on mount
  async function loadExperimentalStats() {
    try {
      loadSecurityStats();
      const res = await fetch("/api/experimental/stats");
      const data = await res.json();
      if (data.success && data.state) {
        // Trigger simulated socket updates to fill UI
        const state = data.state;
        const fakeSocketData = {
          level: state.level,
          totalXp: state.xp,
          streak: state.streak,
          unlockedSkills: state.unlockedSkills
        };
        // Reuse XP renderer
        const lvlEl = document.getElementById("gamification-level");
        const xpEl = document.getElementById("gamification-xp");
        const fillEl = document.getElementById("gamification-xp-fill");
        const streakEl = document.getElementById("gamification-streak");
        const skillsEl = document.getElementById("gamification-skills");

        if (lvlEl) lvlEl.textContent = `Level ${fakeSocketData.level}`;
        if (xpEl) xpEl.textContent = `${fakeSocketData.totalXp % 200} / 200 XP (Total: ${fakeSocketData.totalXp})`;
        if (fillEl) fillEl.style.width = `${((fakeSocketData.totalXp % 200) / 200) * 100}%`;
        if (streakEl) streakEl.textContent = `${fakeSocketData.streak} Day${fakeSocketData.streak > 1 ? "s" : ""} 🔥`;

        if (skillsEl && fakeSocketData.unlockedSkills) {
          skillsEl.innerHTML = "";
          fakeSocketData.unlockedSkills.forEach(skill => {
            const span = document.createElement("span");
            span.style.fontSize = "11px";
            span.style.background = "rgba(6, 182, 212, 0.1)";
            span.style.color = "var(--cyan-400)";
            span.style.padding = "3px 8px";
            span.style.borderRadius = "4px";
            span.style.border = "1px solid rgba(6, 182, 212, 0.2)";
            span.textContent = skill;
            skillsEl.appendChild(span);
          });
        }
      }
    } catch(e) {
      console.warn("API failed:", e);
    }
  }
  loadExperimentalStats();

  // Layer Navigation switcher
  document.querySelectorAll(".sub-layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-layer-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const targetId = btn.getAttribute("data-layer");
      document.querySelectorAll(".sub-layer-pane").forEach(pane => {
        pane.style.display = pane.id === targetId ? "block" : "none";
      });
    });
  });

  // Layer 1 Event Listeners
  document.getElementById("btn-analyze-unsaid")?.addEventListener("click", async () => {
    const out = document.getElementById("unsaid-output");
    out.style.display = "block";
    out.textContent = "Scanning keystroke registers and deleted draft indices...";
    try {
      const res = await fetch("/api/cognitive/layer1/unsaid/analysis");
      const data = await res.json();
      if (data.success && data.analysis) {
        const a = data.analysis;
        out.innerHTML = `<strong>Total Deleted Drafts:</strong> ${escapeHTML(a.totalDeletedDrafts)}<br><strong>Diagnosis:</strong> ${escapeHTML(a.diagnosis)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error scanning drafts.";
    }
  });

  document.getElementById("btn-run-parallel-self")?.addEventListener("click", async () => {
    const out = document.getElementById("parallel-self-output");
    out.style.display = "block";
    out.textContent = "Rebuilding simulated schema of self at age 16 vs now...";
    try {
      const res = await fetch("/api/cognitive/layer1/parallel");
      const data = await res.json();
      if (data.success && data.conversation) {
        out.innerHTML = data.conversation.map(c => `<strong>${escapeHTML(c.speaker)}:</strong> ${escapeHTML(c.text)}`).join("<br><br>");
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running simulator.";
    }
  });

  document.getElementById("btn-detect-reality")?.addEventListener("click", async () => {
    const val = document.getElementById("reality-statements").value.trim();
    const statements = val ? val.split(",").map(s => s.trim()) : [];
    const out = document.getElementById("reality-output-box");
    out.style.display = "block";
    out.textContent = "Calculating probability indices against objective reality profiles...";
    try {
      const res = await fetch("/api/cognitive/layer1/reality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statements })
      });
      const data = await res.json();
      if (data.success && data.result) {
        out.innerHTML = `<strong>Accuracy Score:</strong> ${escapeHTML(data.result.accuracyProbability)}%<br><strong>Verdict:</strong> ${escapeHTML(data.result.verdict)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error verifying statements.";
    }
  });

  document.getElementById("btn-run-iceberg")?.addEventListener("click", async () => {
    const problem = document.getElementById("iceberg-problem").value.trim();
    if (!problem) return alert("Describe your surface problem first.");
    const out = document.getElementById("iceberg-output");
    out.style.display = "block";
    out.textContent = "Drilling down 7 layers of subtext...";
    try {
      const res = await fetch("/api/cognitive/layer1/iceberg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem })
      });
      const data = await res.json();
      if (data.success && data.iceberg) {
        out.innerHTML = data.iceberg.map(l => `<strong>Layer ${escapeHTML(l.layer)} [${escapeHTML(l.label)}]:</strong> ${escapeHTML(l.description)}`).join("<br><br>");
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error analyzing iceberg layers.";
    }
  });

  // Layer 2 Event Listeners
  document.getElementById("btn-consult-mentors")?.addEventListener("click", async () => {
    const question = document.getElementById("mentor-question").value.trim();
    if (!question) return alert("Pose a question to the board first.");
    const out = document.getElementById("mentors-output");
    out.style.display = "block";
    out.textContent = "Summoning board members into virtual thread...";
    try {
      const res = await fetch("/api/cognitive/layer2/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await res.json();
      if (data.success && data.feedback) {
        const fb = data.feedback;
        out.innerHTML = `
          <strong>🚀 Elon Musk:</strong> ${escapeHTML(fb.elonMusk)}<br><br>
          <strong>🧘 Marcus Aurelius:</strong> ${escapeHTML(fb.marcusAurelius)}<br><br>
          <strong>⚓ Naval Ravikant:</strong> ${escapeHTML(fb.navalRavikant)}<br><br>
          <strong>🍎 Steve Jobs:</strong> ${escapeHTML(fb.steveJobs)}<br><br>
          <strong>⚛️ Richard Feynman:</strong> ${escapeHTML(fb.richardFeynman)}
        `;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error consulting mentor board.";
    }
  });

  document.getElementById("btn-build-palace")?.addEventListener("click", async () => {
    const topic = document.getElementById("palace-topic").value.trim();
    const val = document.getElementById("palace-concepts").value.trim();
    const concepts = val ? val.split(",").map(c => c.trim()) : [];
    if (!topic || !concepts.length) return alert("Specify topic and concepts.");
    const out = document.getElementById("palace-output");
    out.style.display = "block";
    out.textContent = "Laying down spatial anchors in the Roman Villa blueprint...";
    try {
      const res = await fetch("/api/cognitive/layer2/palace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, concepts })
      });
      const data = await res.json();
      if (data.success && data.palace) {
        const p = data.palace;
        let html = `<strong>Palace Location:</strong> ${escapeHTML(p.palaceLocation)}<br><br>`;
        html += p.rooms.map(r => `<strong>${escapeHTML(r.room)}:</strong> ${escapeHTML(r.anchorObject)}<br><em>${escapeHTML(r.recallPrompt)}</em>`).join("<br><br>");
        out.innerHTML = html;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error building memory palace.";
    }
  });

  document.getElementById("btn-run-nostalgia")?.addEventListener("click", async () => {
    const pastTopic = document.getElementById("nostalgia-topic").value.trim();
    if (!pastTopic) return alert("Specify a memory era first.");
    const out = document.getElementById("nostalgia-output");
    out.style.display = "block";
    out.textContent = "Contrasting romanticized recall with historical statement index...";
    try {
      const res = await fetch("/api/cognitive/layer2/nostalgia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastTopic })
      });
      const data = await res.json();
      if (data.success && data.report) {
        const r = data.report;
        out.innerHTML = `<strong>Nostalgic Narrative:</strong> ${escapeHTML(r.romanticizedMemory)}<br><br><strong>Actual Metrics:</strong> ${escapeHTML(r.actualGenomeMetrics)}<br><br><strong>Verdict:</strong> <em style="color:#ef4444">${escapeHTML(r.verdict)}</em>`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error checking nostalgia filters.";
    }
  });

  // Layer 3 Event Listeners
  document.getElementById("btn-run-chaos")?.addEventListener("click", async () => {
    const situation = document.getElementById("chaos-situation").value.trim();
    if (!situation) return alert("Describe your bottleneck first.");
    const out = document.getElementById("chaos-output");
    out.style.display = "block";
    out.textContent = "Computing chaos multiplier cascades...";
    try {
      const res = await fetch("/api/cognitive/layer3/chaos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation })
      });
      const data = await res.json();
      if (data.success && data.lever) {
        out.innerHTML = `<strong>1% Action Lever:</strong> ${escapeHTML(data.lever.leverAction)}<br><strong>Impact ROI:</strong> ${escapeHTML(data.lever.leverageMultiplier)}<br><strong>Expected Cascade:</strong> ${escapeHTML(data.lever.expectedCascade)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error calculating chaos leverage.";
    }
  });

  document.getElementById("btn-run-inversion")?.addEventListener("click", async () => {
    const goal = document.getElementById("inversion-goal").value.trim();
    if (!goal) return alert("Enter your target goal first.");
    const out = document.getElementById("inversion-output");
    out.style.display = "block";
    out.textContent = "Applying Charlie Munger inversion algorithm...";
    try {
      const res = await fetch("/api/cognitive/layer3/inversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal })
      });
      const data = await res.json();
      if (data.success && data.plan) {
        const p = data.plan;
        let html = `<strong>How to Guarantee Absolute Failure:</strong><br>`;
        html += p.failureGuarantees.map(g => `• ${escapeHTML(g)}`).join("<br>") + `<br><br>`;
        html += `<strong>Inverted Action Plan (To Succeed):</strong><br>`;
        html += p.invertedActionPlan.map(a => `• ${escapeHTML(a)}`).join("<br>");
        out.innerHTML = html;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running inversion engine.";
    }
  });

  document.getElementById("btn-run-overton")?.addEventListener("click", async () => {
    const belief = document.getElementById("overton-belief").value.trim();
    if (!belief) return alert("State a current belief first.");
    const out = document.getElementById("overton-output");
    out.style.display = "block";
    out.textContent = "Locating belief boundaries and shifting windows...";
    try {
      const res = await fetch("/api/cognitive/layer3/overton", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belief })
      });
      const data = await res.json();
      if (data.success && data.shift) {
        out.innerHTML = `<strong>Current Window:</strong> ${escapeHTML(data.shift.acceptableBelief)}<br><br><strong>Boundary Concept:</strong> ${escapeHTML(data.shift.boundaryIdea)}<br><br><strong>Weekly Overton Discomfort Action:</strong> <em style="color:#a855f7;">${escapeHTML(data.shift.uncomfortableActionStep)}</em>`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error shifting Overton window.";
    }
  });

  document.getElementById("btn-run-signalnoise")?.addEventListener("click", async () => {
    const val = document.getElementById("signalnoise-items").value.trim();
    const items = val ? val.split(",").map(i => i.trim()) : [];
    const out = document.getElementById("signalnoise-output");
    out.style.display = "block";
    out.textContent = "Filtering noise vectors from focus channels...";
    try {
      const res = await fetch("/api/cognitive/layer3/signalnoise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.success && data.classification) {
        out.innerHTML = data.classification.map(c => `<strong>${escapeHTML(c.item)}:</strong> ${escapeHTML(c.classification)}`).join("<br>");
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error filtering noise.";
    }
  });

  // Layer 4 Event Listeners
  document.getElementById("btn-run-check10")?.addEventListener("click", async () => {
    const decision = document.getElementById("check-decision").value.trim();
    if (!decision) return alert("State a decision first.");
    const out = document.getElementById("check10-output");
    out.style.display = "block";
    out.textContent = "Scaling decision through 10m/10m/10y timelines...";
    try {
      const res = await fetch("/api/cognitive/layer4/check10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await res.json();
      if (data.success && data.check) {
        const c = data.check;
        out.innerHTML = `
          <strong>In 10 Minutes:</strong> ${escapeHTML(c.in10Minutes)}<br><br>
          <strong>In 10 Months:</strong> ${escapeHTML(c.in10Months)}<br><br>
          <strong>In 10 Years:</strong> ${escapeHTML(c.in10Years)}
        `;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running gut check.";
    }
  });

  document.getElementById("btn-log-ledger")?.addEventListener("click", async () => {
    const area = document.getElementById("ledger-area").value.trim();
    const hours = parseFloat(document.getElementById("ledger-hours").value) || 0;
    const energy = parseFloat(document.getElementById("ledger-energy").value) || 0;
    const ROI = parseFloat(document.getElementById("ledger-roi").value) || 0;
    const out = document.getElementById("ledger-output");
    out.style.display = "block";
    out.textContent = "Recording ledger allocation...";
    try {
      const res = await fetch("/api/cognitive/layer4/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, hours, energy, ROI })
      });
      const data = await res.json();
      if (data.success && data.ledger) {
        out.innerHTML = `<strong>Ledger Entry Recorded!</strong><br>Total historical logs: ${escapeHTML(data.ledger.length)} entries.`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error logging to ledger.";
    }
  });

  document.getElementById("btn-run-deathbed")?.addEventListener("click", async () => {
    const worry = document.getElementById("deathbed-worry").value.trim();
    if (!worry) return alert("State a worry first.");
    const out = document.getElementById("deathbed-output-box");
    out.style.display = "block";
    out.textContent = "Filtering stress indices through mortality end-state...";
    try {
      const res = await fetch("/api/cognitive/layer4/deathbed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worry })
      });
      const data = await res.json();
      if (data.success && data.filter) {
        out.innerHTML = `<strong>Deathbed Significance Score:</strong> ${escapeHTML(data.filter.deathbedSignificanceScore)}/100<br><br><strong>Verdict:</strong> ${escapeHTML(data.filter.verdict)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error verifying significance.";
    }
  });

  document.getElementById("btn-run-gratitude")?.addEventListener("click", async () => {
    const out = document.getElementById("gratitude-output");
    out.style.display = "block";
    out.textContent = "Recalling forgotten assets...";
    try {
      const res = await fetch("/api/cognitive/layer4/gratitude");
      const data = await res.json();
      if (data.success && data.gratitude) {
        const g = data.gratitude;
        out.innerHTML = `<strong>Current Asset:</strong> ${escapeHTML(g.currentAsset)}<br><strong>Forgotten Past Dream:</strong> ${escapeHTML(g.pastDesire)}<br><br><strong>Reset Verdict:</strong> <em>${escapeHTML(g.baselineReset)}</em>`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error checking gratitude baseline.";
    }
  });

  // Layer 5 Event Listeners
  document.getElementById("btn-run-premortem")?.addEventListener("click", async () => {
    const planName = document.getElementById("premortem-plan").value.trim();
    if (!planName) return alert("Specify a plan first.");
    const out = document.getElementById("premortem-output");
    out.style.display = "block";
    out.textContent = "Simulating absolute failure patterns...";
    try {
      const res = await fetch("/api/cognitive/layer5/premortem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName })
      });
      const data = await res.json();
      if (data.success && data.preMortem) {
        const p = data.preMortem;
        let html = `<strong>Plan Status:</strong> <span style="color:#ef4444;">${escapeHTML(p.assumedStatus)}</span><br><br>`;
        html += `<strong>Why it failed (Post-Mortem Analysis):</strong><br>`;
        html += p.postMortemReasons.map(r => `• ${escapeHTML(r)}`).join("<br>") + "<br><br>";
        html += `<strong>Preventative Actions:</strong><br>`;
        html += p.preventativeMitigations.map(m => `• ${escapeHTML(m)}`).join("<br>");
        out.innerHTML = html;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running pre-mortem.";
    }
  });

  document.getElementById("btn-run-destructor")?.addEventListener("click", async () => {
    const idea = document.getElementById("destructor-idea").value.trim();
    if (!idea) return alert("Write an idea first.");
    const out = document.getElementById("destructor-output");
    out.style.display = "block";
    out.textContent = "Initiating logical Socratic demolition sweep...";
    try {
      const res = await fetch("/api/cognitive/layer5/destructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea })
      });
      const data = await res.json();
      if (data.success && data.destruction) {
        const d = data.destruction;
        let html = `<strong>Flaw Detections:</strong><br>`;
        html += d.logicalFlaws.map(f => `• ${escapeHTML(f)}`).join("<br>") + "<br><br>";
        html += `<strong>Surviving Truth:</strong> <span style="color:#10b981;">${escapeHTML(d.survivingTruth)}</span>`;
        out.innerHTML = html;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error testing idea.";
    }
  });

  document.getElementById("btn-run-risks")?.addEventListener("click", async () => {
    const val = document.getElementById("risk-worries").value.trim();
    const worries = val ? val.split(",").map(w => w.trim()) : [];
    const out = document.getElementById("risks-output");
    out.style.display = "block";
    out.textContent = "Scaling worries against real-world existential threats...";
    try {
      const res = await fetch("/api/cognitive/layer5/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worries })
      });
      const data = await res.json();
      if (data.success && data.ranked) {
        out.innerHTML = data.ranked.map(r => `<strong>${escapeHTML(r.worry)}:</strong> Risk ${escapeHTML(r.actualStatisticalRisk)} (${escapeHTML(r.suggestedAttentionAllocation)})`).join("<br>");
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error ranking risks.";
    }
  });

  document.getElementById("btn-run-identity")?.addEventListener("click", async () => {
    const out = document.getElementById("identity-output");
    out.style.display = "block";
    out.textContent = "Stripping labels...";
    try {
      const res = await fetch("/api/cognitive/layer5/identity");
      const data = await res.json();
      if (data.success && data.test) {
        out.innerHTML = data.test.steps.map(s => `• ${escapeHTML(s)}`).join("<br>");
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running identity stress test.";
    }
  });

  // Layer 6 Event Listeners
  document.getElementById("btn-run-dissolve")?.addEventListener("click", async () => {
    const situation = document.getElementById("dissolve-situation").value.trim();
    if (!situation) return alert("State a blaming scenario first.");
    const out = document.getElementById("dissolve-output");
    out.style.display = "block";
    out.textContent = "Dissolving ego buffers...";
    try {
      const res = await fetch("/api/cognitive/layer6/dissolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation })
      });
      const data = await res.json();
      if (data.success && data.rawRaw) {
        out.innerHTML = `<strong>Ego Excuse:</strong> ${escapeHTML(data.rawRaw.egoProtectiveNarrative)}<br><br><strong>Raw Reality:</strong> ${escapeHTML(data.rawRaw.dissolvedRawReality)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error running ego dissolution.";
    }
  });

  document.getElementById("btn-log-predict")?.addEventListener("click", async () => {
    const predictionText = document.getElementById("predict-text").value.trim();
    const probability = parseFloat(document.getElementById("predict-prob").value) || 50;
    const out = document.getElementById("predict-output");
    out.style.display = "block";
    out.textContent = "Logging prediction vector to the behavior ledger...";
    try {
      const res = await fetch("/api/cognitive/layer6/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionText, probability })
      });
      const data = await res.json();
      if (data.success) {
        out.innerHTML = `<strong>Prediction Logged!</strong><br>Behavior registered for continuous audit tracking.`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error logging prediction.";
    }
  });

  document.getElementById("btn-run-final")?.addEventListener("click", async () => {
    const val = document.getElementById("final-options").value.trim();
    const options = val ? val.split(",").map(o => o.trim()) : [];
    const out = document.getElementById("final-output");
    out.style.display = "block";
    out.textContent = "Selecting absolute conviction vector...";
    try {
      const res = await fetch("/api/cognitive/layer6/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options })
      });
      const data = await res.json();
      if (data.success && data.choice) {
        out.innerHTML = `<strong>Conviction Choice:</strong> ${escapeHTML(data.choice.finalConvictionChoice)}<br><br><strong>Reasoning:</strong> ${escapeHTML(data.choice.reasoning)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error resolving final answer.";
    }
  });

  document.getElementById("btn-run-collective")?.addEventListener("click", async () => {
    const out = document.getElementById("collective-output");
    out.style.display = "block";
    out.textContent = "Fetching global user pattern alignment...";
    try {
      const res = await fetch("/api/cognitive/layer6/feed");
      const data = await res.json();
      if (data.success && data.feed) {
        const f = data.feed;
        out.innerHTML = `<strong>Global Users Analyzed:</strong> ${escapeHTML(f.globalUsersAnalyzed)}<br><strong>Matching Pattern Nodes:</strong> ${escapeHTML(f.matchingPatternCount)}<br><br><strong>Historical Verdict:</strong> ${escapeHTML(f.parallelLivesVerdict)}`;
      }
    } catch(e) {
      console.warn("API failed:", e);
      out.textContent = "Error pooling collective unconscious.";
    }
  });

  // 13. Privacy Fortress State Persistence and Execution
  const checkZeroKnowledge = document.getElementById("check-zero-knowledge");
  const checkDecoyMode = document.getElementById("check-decoy-mode");
  const checkGhostProtocol = document.getElementById("check-ghost-protocol");

  if (checkZeroKnowledge) {
    checkZeroKnowledge.checked = localStorage.getItem("zero_knowledge_mode") === "true";
    checkZeroKnowledge.addEventListener("change", (e) => {
      localStorage.setItem("zero_knowledge_mode", e.target.checked);
      if (e.target.checked) {
        showStatusNotification("🔒 Zero Knowledge: Local encryption active.");
      }
    });
  }

  if (checkDecoyMode) {
    checkDecoyMode.checked = localStorage.getItem("decoy_mode") === "true";
    
    const applyDecoyUI = (active) => {
      if (active) {
        document.body.classList.add("decoy-active");
        showStatusNotification("🛡️ Decoy Safe Mode active. Standard chat environment loaded.");
        const alyaStatus = document.getElementById("routing-model");
        if (alyaStatus) alyaStatus.textContent = "Alya Standard (Decoy)";
      } else {
        document.body.classList.remove("decoy-active");
        const alyaStatus = document.getElementById("routing-model");
        if (alyaStatus) alyaStatus.textContent = "Llama-3.3-70B";
      }
    };
    
    applyDecoyUI(checkDecoyMode.checked);

    checkDecoyMode.addEventListener("change", (e) => {
      localStorage.setItem("decoy_mode", e.target.checked);
      applyDecoyUI(e.target.checked);
    });
  }

  if (checkGhostProtocol) {
    checkGhostProtocol.checked = localStorage.getItem("ghost_protocol") === "true";
    checkGhostProtocol.addEventListener("change", (e) => {
      localStorage.setItem("ghost_protocol", e.target.checked);
      if (e.target.checked) {
        showStatusNotification("👻 Ghost Protocol active. Session log local cache deactivated.");
      }
    });
  }

  function showStatusNotification(message) {
    const firewallLogs = document.getElementById("firewall-logs");
    if (firewallLogs) {
      const logDiv = document.createElement("div");
      logDiv.style.color = "var(--accent-400)";
      logDiv.style.marginBottom = "4px";
      logDiv.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      // Remove placeholder text if present
      if (firewallLogs.textContent.includes("No intrusion threats logged")) {
        firewallLogs.textContent = "";
      }
      firewallLogs.prepend(logDiv);
    }
  }

  // Initialize sync
  rehydrateStateFromLocal();

  // Poll system sparklines every 2.5s
  setInterval(pollSparklines, 2500);
  pollSparklines();

  // --- WhatsApp QR Code Popup ---
  let qrPollInterval = null;

  function openWhatsAppQR() {
    const modal = document.getElementById("qr-modal");
    const qrImage = document.getElementById("qr-image");
    const qrStatus = document.getElementById("qr-status");
    
    modal.style.display = "flex";
    qrImage.style.display = "none";
    qrStatus.style.display = "block";
    qrStatus.textContent = "Requesting QR code from Alya bridge...";
    
    pollQR();
    if (qrPollInterval) clearInterval(qrPollInterval);
    qrPollInterval = setInterval(pollQR, 5000);
  }

  function closeWhatsAppQR() {
    const modal = document.getElementById("qr-modal");
    modal.style.display = "none";
    if (qrPollInterval) {
      clearInterval(qrPollInterval);
      qrPollInterval = null;
    }
  }

  document.getElementById("btn-close-qr").addEventListener("click", closeWhatsAppQR);

  async function pollQR() {
    const qrImage = document.getElementById("qr-image");
    const qrStatus = document.getElementById("qr-status");
    
    try {
      const statusRes = await fetch("/api/status");
      const statusData = await statusRes.json();
      const isConnected = statusData.bridges?.whatsapp?.connected;
      
      if (isConnected) {
        qrStatus.textContent = "✅ WhatsApp Connected Successfully!";
        qrImage.style.display = "none";
        setTimeout(closeWhatsAppQR, 2000);
        return;
      }
      
      const qrRes = await fetch("/api/whatsapp/qr");
      if (qrRes.status === 200) {
        qrImage.src = `/api/whatsapp/qr?t=${Date.now()}`;
        qrImage.style.display = "block";
        qrStatus.style.display = "none";
      } else {
        const errData = await qrRes.json();
        qrStatus.textContent = errData.error || "QR code initializing...";
        qrImage.style.display = "none";
      }
    } catch (e) {
      qrStatus.textContent = "Error loading QR. Retrying...";
      qrImage.style.display = "none";
    }
  }

  // ============================================================
  // 🖥️ ALYA OS WORKSPACE & LIFE OS SYSTEM
  // ============================================================
  let lifeOSState = {
    tasks: [],
    goals: [],
    notes: "",
    xp: 0,
    level: 1,
    streak: 1,
    lastStreakUpdate: ""
  };

  const btnToggleWorkspace = document.getElementById("btn-toggle-workspace");
  const workspaceRightPanel = document.getElementById("workspace-right-panel");
  const workspaceNotes = document.getElementById("workspace-notes");
  const notesStatus = document.getElementById("notes-status");
  const selectPersona = document.getElementById("select-persona");
  const checkEco = document.getElementById("check-eco");
  
  // Workspace Tab buttons and panes
  const wTabButtons = document.querySelectorAll(".w-tab-btn");
  const wTabPanes = document.querySelectorAll(".w-tab-pane");

  // Code Sandbox Playground
  const btnRunSandbox = document.getElementById("btn-run-sandbox");
  // sandboxCode is already declared above
  const sandboxPreviewFrame = document.getElementById("sandbox-preview-frame");

  // Life OS elements
  const lifeosLevel = document.getElementById("lifeos-level");
  const lifeosXp = document.getElementById("lifeos-xp");
  const lifeosStreak = document.getElementById("lifeos-streak");
  const lifeosXpFill = document.getElementById("lifeos-xp-fill");
  const btnGenDailySummary = document.getElementById("btn-gen-daily-summary");
  const aiDailySummaryText = document.getElementById("ai-daily-summary-text");
  
  const inputNewGoal = document.getElementById("input-new-goal");
  const btnAddGoal = document.getElementById("btn-add-goal");
  const lifeosGoalsList = document.getElementById("lifeos-goals-list");
  
  const inputNewTask = document.getElementById("input-new-task");
  const btnAddTask = document.getElementById("btn-add-task");
  const lifeosTasksList = document.getElementById("lifeos-tasks-list");

  // AI Browser elements
  const browserUrl = document.getElementById("browser-url");
  const btnBrowserRead = document.getElementById("btn-browser-read");
  const browserOutput = document.getElementById("browser-output");

  // Auto-detect mobile devices and turn on Eco Mode by default
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobileDevice && checkEco) {
    checkEco.checked = true;
    document.body.classList.add("eco-mode");
    console.log("🍃 Eco Mode activated automatically on mobile/low-end device.");
  }

  // Toggling Eco Mode manually
  if (checkEco) {
    checkEco.addEventListener("change", (e) => {
      if (e.target.checked) {
        document.body.classList.add("eco-mode");
      } else {
        document.body.classList.remove("eco-mode");
      }
    });
  }

  // Persona switching
  if (selectPersona) {
    selectPersona.addEventListener("change", (e) => {
      const mood = e.target.value;
      socket.emit("set_mood", { mood });
      
      // Inject introduction bubble
      const introMessages = {
        normal: "Right away, Master! I am back to my gentle self. What can I do for you? ✨",
        coding: "💻 Coding Agent initialized! Workspace compiler is synced and local JS sandbox is ready. Ask me to write, debug or analyze any code, Master!",
        research: "🔍 Research Agent ready! I can scour the web, analyze documents, read video transcripts, and write reports for you.",
        study: "📚 Study Mode active! Let's prep for exams, make study cards, run active recall quizzes, and memorize together. What subject are we studying today, Master?",
        youtube: "🎥 YouTube Creator Engine loaded. Give me a topic and let's craft a viral hook, high-retention script, and tags!",
        instagram: "🤳 Social Media Reels Studio initialized. Let's design viral hooks, captions, and script concepts to get you trending!",
        resume: "📄 Executive Talent & Resume Mode. Let's optimize your career highlights, write strong cover letters, and prepare for interviews.",
        roast: "🔥 ROAST MODE ENABLED. Main toh aapki intelligence test karne ke liye ready hoon, Master! Let's see what you've got.",
        genz: "⚡ GEN Z MODE ACTIVATED! No cap, I am ready to serve the absolute best rizz, coding, and answers, fr fr. What's the vibe today? 🚀"
      };
      
      const content = introMessages[mood] || "App mode selected. How can I serve you, Master?";
      
      // Emit a message bubble locally to show Alya shifted
      appendMessage("assistant", content, new Date().toISOString());
      speak(content);
    });
  }

  // Toggle Workspace mode
  if (btnToggleWorkspace) {
    btnToggleWorkspace.addEventListener("click", () => {
      if (workspaceRightPanel.style.display === "none") {
        workspaceRightPanel.style.display = "flex";
        btnToggleWorkspace.classList.add("active");
        btnToggleWorkspace.style.background = "var(--accent-500)";
        loadLifeOS();
      } else {
        workspaceRightPanel.style.display = "none";
        btnToggleWorkspace.classList.remove("active");
        btnToggleWorkspace.style.background = "";
      }
    });
  }

  // Workspace Tab buttons
  wTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      wTabButtons.forEach(b => b.classList.remove("active"));
      wTabPanes.forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-wtab");
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Trigger manual heal
  const btnTriggerHeal = document.getElementById("btn-trigger-heal");
  const healerErrorInput = document.getElementById("healer-error-input");
  if (btnTriggerHeal && healerErrorInput) {
    btnTriggerHeal.addEventListener("click", () => {
      const errorText = healerErrorInput.value.trim();
      if (!errorText) return;
      socket.emit("trigger_heal", { errorText });
      healerErrorInput.value = "";
    });
  }

  // Global window error catcher to auto-report console errors to the healer
  window.addEventListener("error", (event) => {
    const errorMsg = event.error ? event.error.message : event.message;
    const errorStack = event.error ? event.error.stack : `${errorMsg} at ${event.filename}:${event.lineno}:${event.colno}`;
    socket.emit("trigger_heal", { errorText: `Browser Error: ${errorMsg}\nStack: ${errorStack}` });
  });

  // Notes Auto-save with debouncing
  let notesTimeout = null;
  if (workspaceNotes) {
    workspaceNotes.addEventListener("input", () => {
      notesStatus.textContent = "Writing...";
      if (notesTimeout) clearTimeout(notesTimeout);
      notesTimeout = setTimeout(async () => {
        lifeOSState.notes = workspaceNotes.value;
        const success = await saveLifeOSState();
        notesStatus.textContent = success ? "Saved to Second Brain" : "Save failed";
      }, 1000);
    });
  }

  // Sandbox Compiler
  if (btnRunSandbox && sandboxCode && sandboxPreviewFrame) {
    btnRunSandbox.addEventListener("click", () => {
      const code = sandboxCode.value;
      sandboxPreviewFrame.srcdoc = code;
    });
  }

  // Web Browser url scrape handler
  if (btnBrowserRead) {
    btnBrowserRead.addEventListener("click", () => {
      const url = browserUrl.value;
      if (!url) return;
      
      browserOutput.textContent = `Requesting Alya to scrape and analyze: ${url}...`;
      
      // Redirect prompt into chat input
      const msgInput = document.getElementById("message-input");
      if (msgInput) {
        msgInput.value = `Alya, please fetch, scrape, and summarize the contents of this website: ${url}`;
        
        // Show status message in the chat
        appendMessage("user", `Alya, scrape and summarize: ${url}`);
        
        // Options
        const options = {
          routingMode: document.getElementById("select-routing")?.value || "intelligence",
          thinkingMode: document.getElementById("select-thinking")?.value || "normal",
          swarmMode: document.getElementById("check-swarm")?.checked || false,
          cognitiveState: document.getElementById("select-cognitive-state")?.value || "focus"
        };
        
        socket.emit("chat", { 
          message: msgInput.value, 
          options: options
        });
        
        msgInput.value = "";
        
        // Go back to the conversation tab to see the live tool calling in action!
        setTimeout(() => {
          const chatTab = document.querySelector('[data-tab="chat-pane"]');
          if (chatTab) chatTab.click();
        }, 300);
      }
    });
  }

  // Fetch Life OS data
  async function loadLifeOS() {
    try {
      const res = await fetch("/api/life-os");
      if (res.status === 200) {
        lifeOSState = await res.json();
        renderLifeOS();
      }
    } catch (e) {
      console.error("Error loading Life OS:", e);
    }
  }

  // Save Life OS data
  async function saveLifeOSState() {
    try {
      const res = await fetch("/api/life-os/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lifeOSState)
      });
      return res.status === 200;
    } catch (e) {
      console.error("Error saving Life OS state:", e);
      return false;
    }
  }

  // Render Tasks, Goals, Stats to the UI
  function renderLifeOS() {
    // Level & XP
    if (lifeosLevel) lifeosLevel.textContent = lifeOSState.level;
    if (lifeosXp) lifeosXp.textContent = `${lifeOSState.xp}/${lifeOSState.level * 200}`;
    if (lifeosStreak) lifeosStreak.textContent = `${lifeOSState.streak} Day${lifeOSState.streak > 1 ? 's' : ''} 🔥`;
    
    if (lifeosXpFill) {
      const percentage = Math.min(100, (lifeOSState.xp / (lifeOSState.level * 200)) * 100);
      lifeosXpFill.style.width = `${percentage}%`;
    }

    // Notes
    if (workspaceNotes && document.activeElement !== workspaceNotes) {
      workspaceNotes.value = lifeOSState.notes || "";
    }

    // Render Goals
    if (lifeosGoalsList) {
      lifeosGoalsList.innerHTML = "";
      if (lifeOSState.goals.length === 0) {
        lifeosGoalsList.innerHTML = `<li class="lifeos-item" style="color: var(--text-muted); justify-content: center;">No goals set</li>`;
      } else {
        lifeOSState.goals.forEach(goal => {
          const li = document.createElement("li");
          li.className = "lifeos-item";
          li.innerHTML = `
            <div class="lifeos-item-left">
              <span>🎯 ${escapeHTML(goal.text)}</span>
            </div>
            <button class="delete-goal-btn" data-id="${escapeHTML(goal.id)}">&times;</button>
          `;
          lifeosGoalsList.appendChild(li);
        });
      }
    }

    // Render Tasks
    if (lifeosTasksList) {
      lifeosTasksList.innerHTML = "";
      if (lifeOSState.tasks.length === 0) {
        lifeosTasksList.innerHTML = `<li class="lifeos-item" style="color: var(--text-muted); justify-content: center;">No tasks scheduled</li>`;
      } else {
        lifeOSState.tasks.forEach(task => {
          const li = document.createElement("li");
          li.className = `lifeos-item ${task.completed ? 'completed' : ''}`;
          li.innerHTML = `
            <div class="lifeos-item-left">
              <input type="checkbox" class="task-checkbox" data-id="${escapeHTML(task.id)}" ${task.completed ? 'checked' : ''} />
              <span>${escapeHTML(task.text)}</span>
            </div>
            <button class="delete-task-btn" data-id="${escapeHTML(task.id)}">&times;</button>
          `;
          lifeosTasksList.appendChild(li);
        });
      }
    }

    // Rebind task list event listeners
    document.querySelectorAll(".task-checkbox").forEach(chk => {
      chk.addEventListener("change", async (e) => {
        const id = e.target.getAttribute("data-id");
        const isChecked = e.target.checked;
        const task = lifeOSState.tasks.find(t => t.id === id);
        
        if (task) {
          task.completed = isChecked;
          if (isChecked) {
            // Task complete, reward 10 XP
            lifeOSState.xp += 10;
            if (lifeOSState.xp >= lifeOSState.level * 200) {
              lifeOSState.xp -= lifeOSState.level * 200;
              lifeOSState.level += 1;
              
              // Trigger Level Up voice response
              const msg = `Congratulations Master! You have leveled up to Level ${lifeOSState.level}! Your productivity is soaring! ✨`;
              appendMessage("assistant", msg);
              speak(msg);
            }
          }
          await saveLifeOSState();
          renderLifeOS();
        }
      });
    });

    document.querySelectorAll(".delete-task-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-id");
        lifeOSState.tasks = lifeOSState.tasks.filter(t => t.id !== id);
        await saveLifeOSState();
        renderLifeOS();
      });
    });

    document.querySelectorAll(".delete-goal-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-id");
        lifeOSState.goals = lifeOSState.goals.filter(g => g.id !== id);
        await saveLifeOSState();
        renderLifeOS();
      });
    });
  }

  // Add Goal click
  if (btnAddGoal && inputNewGoal) {
    btnAddGoal.addEventListener("click", async () => {
      const text = inputNewGoal.value.trim();
      if (!text) return;
      
      lifeOSState.goals.push({
        id: Date.now().toString(),
        text,
        createdAt: new Date().toISOString()
      });
      inputNewGoal.value = "";
      await saveLifeOSState();
      renderLifeOS();
    });
    
    inputNewGoal.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        btnAddGoal.click();
      }
    });
  }

  // Add Task click
  if (btnAddTask && inputNewTask) {
    btnAddTask.addEventListener("click", async () => {
      const text = inputNewTask.value.trim();
      if (!text) return;
      
      lifeOSState.tasks.push({
        id: Date.now().toString(),
        text,
        completed: false,
        createdAt: new Date().toISOString()
      });
      inputNewTask.value = "";
      await saveLifeOSState();
      renderLifeOS();
    });
    
    inputNewTask.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        btnAddTask.click();
      }
    });
  }

  // Generate Daily Summary
  if (btnGenDailySummary && aiDailySummaryText) {
    btnGenDailySummary.addEventListener("click", async () => {
      aiDailySummaryText.textContent = "Alya is analyzing your Second Brain memory files to optimize scheduling...";
      try {
        const res = await fetch("/api/life-os/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (res.status === 200) {
          const data = await res.json();
          aiDailySummaryText.textContent = data.summary;
        } else {
          aiDailySummaryText.textContent = "Could not generate summary at this time.";
        }
      } catch (e) {
        aiDailySummaryText.textContent = "Error communicating with AI engine.";
      }
    });
  }

  // ============================================================
  // 🎙️ JARVIS VOICE ORB ASSISTANT
  // ============================================================
  const voiceOrbController = {
    active: false,
    state: "idle", // "idle", "listening", "thinking", "speaking"
    recognition: null,
    
    init() {
      const btnTriggerOrb = document.getElementById("btn-trigger-orb");
      const btnCloseOrb = document.getElementById("btn-close-orb");
      const orbOverlay = document.getElementById("orb-overlay");
      const orbCore = document.querySelector(".orb-core");
      
      if (!btnTriggerOrb || !orbOverlay) return;
      
      btnTriggerOrb.addEventListener("click", () => {
        orbOverlay.style.display = "flex";
        this.active = true;
        this.setState("idle");
      });
      
      btnCloseOrb.addEventListener("click", () => {
        orbOverlay.style.display = "none";
        this.active = false;
        this.stopListening();
      });
      
      if (orbCore) {
        orbCore.addEventListener("click", () => {
          if (this.state === "idle" || this.state === "speaking") {
            this.startListening();
          } else if (this.state === "listening") {
            this.stopListening();
          }
        });
      }
    },
    
    setState(state, extraText = "") {
      this.state = state;
      const orbStatus = document.getElementById("orb-status");
      const orbTranscription = document.getElementById("orb-transcription");
      const orbCore = document.querySelector(".orb-core");
      const orbGlowPulse = document.querySelector(".orb-glow-pulse");
      
      if (!orbStatus) return;
      
      if (state === "idle") {
        orbStatus.textContent = "Tap Orb to Speak";
        orbTranscription.textContent = extraText || "System ready, Master.";
        if (orbCore) orbCore.style.transform = "scale(1)";
        if (orbGlowPulse) orbGlowPulse.style.animationDuration = "3s";
      } else if (state === "listening") {
        orbStatus.textContent = "Listening...";
        orbTranscription.textContent = "Go ahead, Master. I am listening.";
        if (orbCore) orbCore.style.transform = "scale(1.15)";
        if (orbGlowPulse) orbGlowPulse.style.animationDuration = "1s";
      } else if (state === "thinking") {
        orbStatus.textContent = "Processing...";
        orbTranscription.textContent = "Thinking...";
        if (orbGlowPulse) orbGlowPulse.style.animationDuration = "0.5s";
      } else if (state === "speaking") {
        orbStatus.textContent = "Speaking";
        orbTranscription.textContent = extraText || "...";
        if (orbCore) orbCore.style.transform = "scale(1.05)";
        if (orbGlowPulse) orbGlowPulse.style.animationDuration = "1.5s";
      }
    },
    
    startListening() {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        this.setState("idle", "Speech recognition not supported in this browser.");
        return;
      }
      
      this.setState("listening");
      
      if (!this.recognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        
        const selectPersona = document.getElementById("select-persona");
        const currentMood = selectPersona ? selectPersona.value : "normal";
        const hasHindi = currentMood === "normal" || currentMood === "roast" || currentMood === "study";
        this.recognition.lang = hasHindi ? "hi-IN" : "en-US";
        
        this.recognition.onresult = (event) => {
          const text = event.results[0][0].transcript;
          this.setState("thinking");
          
          const messageInput = document.getElementById("message-input");
          if (messageInput) {
            messageInput.value = text;
            
            // Send options
            const options = {
              routingMode: document.getElementById("select-routing")?.value || "intelligence",
              thinkingMode: document.getElementById("select-thinking")?.value || "normal",
              swarmMode: document.getElementById("check-swarm")?.checked || false,
              cognitiveState: document.getElementById("select-cognitive-state")?.value || "focus"
            };
            
            lastMessageWasVoice = true;
            
            socket.emit("chat", { 
              message: text, 
              options: options
            });
            
            messageInput.value = "";
          }
        };
        
        this.recognition.onerror = (event) => {
          console.error("Speech Recognition Error:", event.error);
          this.setState("idle", `Error: ${event.error}`);
        };
        
        this.recognition.onend = () => {
          if (this.state === "listening") {
            this.setState("idle");
          }
        };
      }
      
      this.recognition.start();
    },
    
    stopListening() {
      if (this.recognition) {
        this.recognition.stop();
      }
      this.setState("idle");
    }
  };

  // --- Wake Word Background Listener ---
  function initWakeWord() {
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = "en-US";

    wakeWordRecognition.onresult = (event) => {
      if (isListening || isStreaming) return;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        if (transcript.includes("alya") || transcript.includes("alia") || transcript.includes("arya") || transcript.includes("halya")) {
          console.log("🧬 Wake word detected!");
          triggerWakeWordActivation();
          break;
        }
      }
    };

    wakeWordRecognition.onend = () => {
      if (isWakeWordEnabled && !isListening && !isStreaming) {
        try { wakeWordRecognition.start(); } catch {}
      }
    };
  }

  function triggerWakeWordActivation() {
    if (wakeWordRecognition) {
      try { wakeWordRecognition.stop(); } catch {}
    }
    
    // Play sci-fi chime
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
    
    setTimeout(() => {
      startListening();
    }, 200);
  }

  const wakeWordCheckbox = document.getElementById("check-wakeword");
  if (wakeWordCheckbox) {
    wakeWordCheckbox.addEventListener("change", (e) => {
      isWakeWordEnabled = e.target.checked;
      if (isWakeWordEnabled) {
        if (!wakeWordRecognition) initWakeWord();
        try { wakeWordRecognition.start(); } catch {}
        console.log("Wake word detection enabled.");
      } else {
        if (wakeWordRecognition) {
          try { wakeWordRecognition.stop(); } catch {}
        }
        console.log("Wake word detection disabled.");
      }
    });
  }

  // Initialize Voice Orb Controller
  voiceOrbController.init();

  // Start 3D loop
  drawDreamspace();
  setHologramState("idle");
})();
