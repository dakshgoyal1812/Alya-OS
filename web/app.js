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

  socket.on("voice", (data) => {
    elevenLabsVoicePlayed = true;
    if (synthesis) synthesis.cancel(); // Cancel local browser TTS if ElevenLabs plays

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
      } catch (e) {}
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
          markersEl.innerHTML = data.result.detectedMarkers.map(m => `• ${m}`).join("<br>");
        }
      }
    } catch(e) {}
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

      utterance.onend = () => {
        if (lastMessageWasVoice && !isListening) {
          startListening();
        }
      };

      synthesis.speak(utterance);
    }, 600);
  }

  // --- Fetch Bridge Status & Resources ---
  async function fetchStatus() {
    try {
      const [healthRes, statusRes, systemRes, remindersRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/status"),
        fetch("/api/system"),
        fetch("/api/reminders"),
      ]);
      const health = await healthRes.json();
      const status = await statusRes.json();
      const system = await systemRes.json();
      const remindersData = await remindersRes.json();

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

      // Update System resources
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

      // Update Reminders list
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
                <span class="reminder-text">${rem.text || rem.reminder}</span>
                <span class="reminder-time">⏰ ${schedStr || 'Scheduled'}</span>
              </li>
            `;
          }).join("");
        }
      }
    } catch {
      // Status fetch failed
    }
  }

  // Poll status every 10s
  setInterval(fetchStatus, 10000);

  // ============================================================
  // ✨ HOLOGRAM AVATAR STATE ENGINE
  // ============================================================
  const hologramStatusText = document.getElementById("hologram-status");
  const eyeLeft = document.getElementById("eye-left");
  const eyeRight = document.getElementById("eye-right");
  const mouthLine = document.getElementById("mouth-line");
  const hologramAvatar = document.getElementById("hologram-avatar");

  function setHologramState(state) {
    if (!hologramStatusText) return;
    hologramStatusText.textContent = `System AI: ${state}`;
    
    // Reset classes
    if (hologramAvatar) {
      hologramAvatar.className = "hologram-avatar";
      hologramAvatar.classList.add(state);
    }
    
    if (state === "thinking") {
      if (eyeLeft) eyeLeft.setAttribute("r", "7");
      if (eyeRight) eyeRight.setAttribute("r", "7");
      if (mouthLine) mouthLine.setAttribute("d", "M 30 60 Q 50 50 70 60"); 
    } else if (state === "talking") {
      if (eyeLeft) eyeLeft.setAttribute("r", "5");
      if (eyeRight) eyeRight.setAttribute("r", "5");
      animateHologramMouth();
    } else if (state === "listening") {
      if (eyeLeft) eyeLeft.setAttribute("r", "8");
      if (eyeRight) eyeRight.setAttribute("r", "8");
      if (mouthLine) mouthLine.setAttribute("d", "M 35 60 Q 50 75 65 60"); 
    } else { // idle
      if (eyeLeft) eyeLeft.setAttribute("r", "5");
      if (eyeRight) eyeRight.setAttribute("r", "5");
      if (mouthLine) mouthLine.setAttribute("d", "M 35 65 Q 50 65 65 65"); 
    }
  }

  let mouthAnimationId = null;
  function animateHologramMouth() {
    if (mouthAnimationId) cancelAnimationFrame(mouthAnimationId);
    
    let tick = 0;
    function draw() {
      if (!hologramAvatar || !hologramAvatar.classList.contains("talking")) return;
      tick += 0.25;
      const height = 65 + Math.sin(tick) * 8;
      if (mouthLine) {
        mouthLine.setAttribute("d", `M 35 65 Q 50 ${height} 65 65`);
      }
      mouthAnimationId = requestAnimationFrame(draw);
    }
    draw();
  }

  // Hook voice recorder states to hologram
  const origStartListening = startListening;
  startListening = async function() {
    await origStartListening();
    setHologramState("listening");
  };

  const origStopListening = stopListening;
  stopListening = function() {
    origStopListening();
    setHologramState("idle");
  };

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
            return `<li>${h.habit} <span style="float:right;color:var(--accent-400)">${confPercent}% conf</span></li>`;
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
          <div class="wf-card" id="wf-card-${wf.id}">
            <div class="wf-card-header">
              <h5>${wf.name}</h5>
              <span class="wf-status ${wf.active ? 'active' : 'inactive'}">${wf.active ? 'Active' : 'Inactive'}</span>
            </div>
            <p><strong>Trigger:</strong> ${wf.trigger}</p>
            <p><strong>Actions:</strong> ${wf.actions.join(" ➔ ")}</p>
            <div class="wf-card-actions">
              <button class="btn-wf-action btn-wf-trigger" data-id="${wf.id}">🚀 Run Trigger</button>
              <button class="btn-wf-action btn-wf-toggle" data-id="${wf.id}" data-active="${wf.active ? 'false' : 'true'}">
                ${wf.active ? 'Disable' : 'Enable'}
              </button>
              <button class="btn-wf-action btn-wf-delete" data-id="${wf.id}">❌ Delete</button>
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
    } catch (e) {}
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
    
    let preview = clipboardContent.substring(0, 60) + "...";
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
        out.innerHTML = `<strong>Simulated Outcome (${data.result.timeframe}):</strong><br>${data.result.simulatedOutcome}`;
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
        out.innerHTML = `<strong>Result:</strong> ${data.result.summary}<br><small>Confidence Level: High. Calculation matches risk aversion formulas.</small>`;
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
        out.innerHTML = `<strong>Deception Probability:</strong> ${data.result.deceptionProbability}%<br><strong>Verdict:</strong> ${data.result.verdict}`;
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
        out.innerHTML = `<strong>Created ${data.count} training pairs!</strong><br><small>Data saved to data/experimental_state.json for local model ingestion.</small>`;
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
                [${new Date(t.timestamp).toLocaleTimeString()}] Score: ${t.threatScore}<br>
                Pattern: "${t.matchedPattern}"<br>
                Input: "${t.promptPreview}"
              </div>`;
            }).join("");
            if (statusEl) {
              statusEl.textContent = "⚠️ Intrusion Prevented";
              statusEl.style.color = "#f59e0b";
            }
          }
        }
      }
    } catch (e) {}
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
    } catch(e) {}
  }
  loadExperimentalStats();

  // 12. Inhuman Cognition Engine UI Bindings
  const btnGenerateOracle = document.getElementById("btn-generate-oracle");
  const btnRunPerspectives = document.getElementById("btn-run-perspectives");
  const btnRunConsequences = document.getElementById("btn-run-consequences");
  const btnRunFutureMap = document.getElementById("btn-run-future-map");
  const btnCalculateMortality = document.getElementById("btn-calculate-mortality");
  const btnRunDissections = document.getElementById("btn-run-dissections");

  btnGenerateOracle?.addEventListener("click", async () => {
    const out = document.getElementById("oracle-output");
    out.style.display = "block";
    out.textContent = "🎯 Activating Blind Spot Oracle... parsing subconscious vectors...";

    try {
      const res = await fetch("/api/cognitive/oracle");
      const data = await res.json();
      if (data.success && data.report) {
        const r = data.report;
        out.innerHTML = `
          <strong>Date Generated:</strong> ${new Date(r.generatedAt).toLocaleDateString()}<br>
          <strong>Age Profile:</strong> ${r.ageProfile}<br>
          <strong>Planning Distortion Bias:</strong> ${r.timeDistortionFactor}<br>
          <strong>Subconscious Registry:</strong> ${r.subconsciousKeystrokeRegistry}<br>
          <strong>Avoided Core Fears:</strong> ${r.avoidedFears.join(", ")}<br><br>
          <strong>🧬 Diagnostic Summary:</strong><br>${r.profileSummary}<br><br>
          <strong>🛡️ Key Prescription:</strong><br><em>${r.keyPrescription}</em>
        `;
      }
    } catch (e) {
      out.textContent = "Error generating blind spot report.";
    }
  });

  btnRunPerspectives?.addEventListener("click", async () => {
    const topic = document.getElementById("perspective-topic").value.trim();
    if (!topic) return alert("Enter a topic first!");

    const container = document.getElementById("perspective-wheel-container");
    container.style.display = "flex";
    
    // Set loading
    document.getElementById("lens-monk").textContent = "Loading...";
    document.getElementById("lens-billionaire").textContent = "Loading...";
    document.getElementById("lens-child").textContent = "Loading...";
    document.getElementById("lens-enemy").textContent = "Loading...";
    document.getElementById("lens-future").textContent = "Loading...";
    document.getElementById("lens-socratic").textContent = "Loading...";

    try {
      const res = await fetch("/api/cognitive/perspectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      const data = await res.json();
      if (data.success && data.perspectives) {
        const p = data.perspectives;
        document.getElementById("lens-monk").textContent = p.monk;
        document.getElementById("lens-billionaire").textContent = p.billionaire;
        document.getElementById("lens-child").textContent = p.child;
        document.getElementById("lens-enemy").textContent = p.enemy;
        document.getElementById("lens-future").textContent = p.futureSelf;
        document.getElementById("lens-socratic").textContent = p.socratic;
      }
    } catch (e) {
      container.style.display = "none";
      alert("Error generating perspectives.");
    }
  });

  btnRunConsequences?.addEventListener("click", async () => {
    const decision = document.getElementById("consequence-decision").value.trim();
    if (!decision) return alert("State a decision first!");

    const out = document.getElementById("consequences-output");
    out.style.display = "block";
    out.textContent = "Mapping consequence tiers...";

    try {
      const res = await fetch("/api/cognitive/consequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await res.json();
      if (data.success && data.result) {
        const r = data.result;
        out.innerHTML = r.levels.map(l => {
          return `<strong>Level ${l.level}: ${l.name}</strong><br>${l.description}<br><br>`;
        }).join("");
      }
    } catch (e) {
      out.textContent = "Error mapping consequences.";
    }
  });

  btnRunFutureMap?.addEventListener("click", async () => {
    const decision = document.getElementById("mapper-decision").value.trim();
    if (!decision) return alert("Enter decision first!");

    const out = document.getElementById("future-map-output");
    out.style.display = "block";
    out.textContent = "Running Monte Carlo timeline cascades...";

    try {
      const res = await fetch("/api/cognitive/future", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await res.json();
      if (data.success && data.timeline) {
        out.innerHTML = data.timeline.map(t => {
          return `
            <div style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--cyan-400); font-weight: bold;">${t.scenario} (${t.likelihood}%)</span><br>
              <span>Outcome: ${t.consequences}</span><br>
              <small style="color: #f59e0b;">Primary Risk: ${t.riskFactor}</small>
            </div>
          `;
        }).join("");
      }
    } catch (e) {
      out.textContent = "Error running timeline mapper.";
    }
  });

  btnCalculateMortality?.addEventListener("click", async () => {
    const taskDays = document.getElementById("mortality-task-days").value || 1;
    const out = document.getElementById("mortality-output");
    out.style.display = "block";
    out.textContent = "Calculating days...";

    try {
      const res = await fetch("/api/cognitive/mortality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskDays })
      });
      const data = await res.json();
      if (data.success && data.metrics) {
        const m = data.metrics;
        document.getElementById("mortality-days").textContent = `${m.daysRemaining.toLocaleString()} Days`;
        document.getElementById("mortality-percent").textContent = `${m.percentRemaining}%`;
        
        out.innerHTML = `
          <strong>Mortality Framing Audit:</strong><br>
          • You are currently ${m.age} years old.<br>
          • You have lived approximately ${m.daysLived.toLocaleString()} days.<br>
          • This task demands ${m.taskCostDays} days, which represents <strong>${m.taskCostPercent}%</strong> of your remaining lifetime.<br><br>
          <em>Verdict: Decide if this task is worth sacrificing that proportion of your finite existence.</em>
        `;
      }
    } catch (e) {
      out.textContent = "Error calculating mortality metrics.";
    }
  });

  btnRunDissections?.addEventListener("click", async () => {
    const statement = document.getElementById("dissection-statement").value.trim();
    if (!statement) return alert("Write a statement first!");

    const out = document.getElementById("dissections-output");
    out.style.display = "block";
    out.textContent = "Deconstructing statement premises...";

    try {
      // Get assumptions
      const resA = await fetch("/api/cognitive/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement })
      });
      const dataA = await resA.json();

      // Get contradictions
      const resC = await fetch("/api/cognitive/contradiction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement })
      });
      const dataC = await resC.json();

      let html = "<strong>Micro-Assumption Dissections:</strong><br>";
      if (dataA.success && dataA.assumptions) {
        html += dataA.assumptions.map(a => `• ${a}`).join("<br>") + "<br><br>";
      }

      html += "<strong>Contradiction Genome conflicts:</strong><br>";
      if (dataC.success && dataC.conflicts) {
        if (dataC.conflicts.length === 0) {
          html += "No logical conflicts detected against historical genome log.";
        } else {
          html += dataC.conflicts.map(c => {
            return `
              <div style="color: #f59e0b; border-left: 2px solid #f59e0b; padding-left: 6px; margin: 4px 0;">
                Conflict Match (${c.conflictScore}% confidence)<br>
                A: ${c.nodeA}<br>
                B: ${c.nodeB}<br>
                <strong>Inconsistency:</strong> ${c.mismatchReason}
              </div>
            `;
          }).join("");
        }
      }
      out.innerHTML = html;
    } catch (e) {
      out.textContent = "Error auditing statement.";
    }
  });

  // Initialize sync
  rehydrateStateFromLocal();

  // Poll system sparklines every 2.5s
  setInterval(pollSparklines, 2500);
  pollSparklines();

  // Start 3D loop
  drawDreamspace();
  setHologramState("idle");
})();
