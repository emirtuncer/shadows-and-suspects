// ─── UI Helpers ─────────────────────────────────────────────────────────────

const UI = (() => {
  const NPC_COLORS = ["#5b7fb5", "#b55b7f", "#5ba55b", "#b5a15b", "#8b5bb5"];
  let currentLanguage = "en";

  function getLanguage() {
    return currentLanguage;
  }

  function applyLanguage(lang) {
    currentLanguage = lang;
    const strings = Translations[lang] || Translations.en;

    // Translate all [data-i18n] elements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (strings[key]) el.textContent = strings[key];
    });

    // Translate placeholders [data-i18n-placeholder]
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (strings[key]) el.placeholder = strings[key];
    });
  }

  function showSetupScreen() {
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("game-container").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    initSetupHandlers();
  }

  function hideSetupScreen() {
    document.getElementById("setup-screen").classList.add("hidden");
  }

  function initSetupHandlers() {
    // Count button groups
    document.querySelectorAll(".setup-btn-group").forEach((group) => {
      group.querySelectorAll(".setup-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          group.querySelectorAll(".setup-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
      });
    });

    // Theme cards
    const themeContainer = document.querySelector(".theme-cards");
    themeContainer.querySelectorAll(".theme-card").forEach((card) => {
      card.addEventListener("click", () => {
        themeContainer.querySelectorAll(".theme-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
      });
    });

    // Language cards — apply translation live on change
    const langContainer = document.querySelector(".lang-cards");
    if (langContainer) {
      langContainer.querySelectorAll(".lang-card").forEach((card) => {
        card.addEventListener("click", () => {
          langContainer.querySelectorAll(".lang-card").forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
          applyLanguage(card.dataset.value);
        });
      });
    }
  }

  function getSetupConfig() {
    const npcCount = parseInt(
      document.querySelector('[data-config="npcCount"] .setup-btn.active').dataset.value
    );
    const questCount = parseInt(
      document.querySelector('[data-config="questCount"] .setup-btn.active').dataset.value
    );
    const theme = document.querySelector('.theme-cards .theme-card.active').dataset.value;
    const language = document.querySelector('.lang-cards .lang-card.active')?.dataset.value || "en";
    return { npcCount, questCount, theme, language };
  }

  function showLoading() {
    document.getElementById("loading-screen").classList.remove("hidden", "fade-out");
    document.getElementById("game-container").classList.add("hidden");
  }

  function hideLoading() {
    const loading = document.getElementById("loading-screen");
    loading.classList.add("fade-out");
    setTimeout(() => {
      loading.classList.add("hidden");
      document.getElementById("game-container").classList.remove("hidden");
    }, 800);
  }

  function renderHeader(setting, backstory) {
    document.getElementById("setting-name").textContent = setting.name;
    document.getElementById("setting-description").textContent = setting.description;
    document.getElementById("backstory").textContent = backstory;
  }

  function renderNpcCards(npcs, onSelect) {
    const list = document.getElementById("npc-list");
    list.innerHTML = "";

    npcs.forEach((npc, i) => {
      const card = document.createElement("div");
      card.className = "npc-card";
      card.dataset.npcId = npc.id;

      const initials = npc.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      card.innerHTML = `
        <div class="npc-avatar" style="background: ${NPC_COLORS[i % NPC_COLORS.length]}">
          ${initials}
          <span class="mood-dot" data-mood="neutral"></span>
        </div>
        <div class="npc-info">
          <div class="npc-name">${escapeHtml(npc.name)}</div>
          <div class="npc-role">${escapeHtml(npc.role)}</div>
        </div>
      `;

      card.addEventListener("click", () => onSelect(npc));
      list.appendChild(card);
    });
  }

  function setActiveNpc(npcId) {
    document.querySelectorAll(".npc-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.npcId === npcId);
    });
    document.getElementById("chat-input-area").classList.remove("hidden");
  }

  function setDialogueHeader(name, showAccuse = true) {
    const el = document.getElementById("dialogue-npc-name");
    el.textContent = t("interrogating", { name });
    el.removeAttribute("data-i18n");
    // Show/hide accuse button
    const accuseBtn = document.getElementById("accuse-btn");
    if (showAccuse) {
      accuseBtn.classList.remove("hidden");
      accuseBtn.textContent = t("accuseBtn");
    } else {
      accuseBtn.classList.add("hidden");
    }
  }

  function clearChat() {
    document.getElementById("chat-messages").innerHTML = "";
  }

  function addChatBubble(speaker, text, isPlayer) {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${isPlayer ? "player" : "npc"}`;
    bubble.innerHTML = `<div class="speaker">${escapeHtml(speaker)}</div><span class="bubble-text"></span>`;
    container.appendChild(bubble);
    scrollChat();

    const textSpan = bubble.querySelector(".bubble-text");

    if (isPlayer) {
      textSpan.textContent = text;
      scrollChat();
      return Promise.resolve();
    }

    // Typewriter effect for NPC
    return typewriter(textSpan, text);
  }

  function typewriter(element, text) {
    return new Promise((resolve) => {
      let i = 0;
      const speed = 20;
      function tick() {
        if (i < text.length) {
          element.textContent += text[i];
          i++;
          scrollChat();
          setTimeout(tick, speed);
        } else {
          resolve();
        }
      }
      tick();
    });
  }

  function showTypingIndicator() {
    const container = document.getElementById("chat-messages");
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.id = "typing-indicator";
    indicator.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    container.appendChild(indicator);
    scrollChat();
  }

  function hideTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
  }

  function scrollChat() {
    const container = document.getElementById("chat-messages");
    container.scrollTop = container.scrollHeight;
  }

  function showToast(message, type) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast" + (type === "hint" ? " hint-toast" : "");
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function setInputEnabled(enabled) {
    document.getElementById("chat-input").disabled = !enabled;
    document.getElementById("chat-send").disabled = !enabled;
    if (enabled) {
      document.getElementById("chat-input").focus();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function updateNpcMood(npcId, mood) {
    const card = document.querySelector(`.npc-card[data-npc-id="${npcId}"]`);
    if (!card) return;
    const dot = card.querySelector(".mood-dot");
    if (dot) {
      dot.dataset.mood = mood;
    }
  }

  function showAccuseConfirm(npcName, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-card">
        <h2 class="confirm-title">${escapeHtml(t("accuseBtn"))}</h2>
        <p class="confirm-text">${escapeHtml(t("accuseConfirm", { name: npcName }))}</p>
        <div class="confirm-buttons">
          <button class="confirm-yes">${escapeHtml(t("accuseYes"))}</button>
          <button class="confirm-cancel">${escapeHtml(t("accuseCancel"))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector(".confirm-yes").addEventListener("click", () => {
      overlay.remove();
      onConfirm();
    });
    overlay.querySelector(".confirm-cancel").addEventListener("click", () => {
      overlay.remove();
    });
  }

  function showGameOverScreen(guiltyName) {
    const overlay = document.createElement("div");
    overlay.className = "gameover-overlay";
    overlay.innerHTML = `
      <div class="gameover-card">
        <div class="gameover-badge">&#10060;</div>
        <h1 class="gameover-title">${escapeHtml(t("gameOver"))}</h1>
        <p class="gameover-text">${escapeHtml(t("wrongAccusation", { name: guiltyName }))}</p>
        <button class="gameover-btn" onclick="location.reload()">${escapeHtml(t("newInvestigation"))}</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function showVictoryScreen(guiltyName) {
    const overlay = document.createElement("div");
    overlay.className = "victory-overlay";
    overlay.innerHTML = `
      <div class="victory-card">
        <div class="victory-badge">&#9878;</div>
        <h1 class="victory-title">${escapeHtml(t("caseSolved"))}</h1>
        <p class="victory-text">${escapeHtml(t("confessionObtained", { name: guiltyName }))}</p>
        <button class="victory-btn" onclick="location.reload()">${escapeHtml(t("newInvestigation"))}</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // Restore a full conversation history for an NPC
  function renderConversation(npcName, messages) {
    clearChat();
    messages.forEach((msg) => {
      const container = document.getElementById("chat-messages");
      const bubble = document.createElement("div");
      const isPlayer = msg.role === "player";
      bubble.className = `chat-bubble ${isPlayer ? "player" : "npc"}`;
      const speaker = isPlayer ? "You" : npcName;
      bubble.innerHTML = `<div class="speaker">${escapeHtml(speaker)}</div><span class="bubble-text">${escapeHtml(msg.text)}</span>`;
      container.appendChild(bubble);
    });
    scrollChat();
  }

  return {
    getLanguage,
    applyLanguage,
    showSetupScreen,
    hideSetupScreen,
    getSetupConfig,
    showLoading,
    hideLoading,
    renderHeader,
    renderNpcCards,
    setActiveNpc,
    setDialogueHeader,
    clearChat,
    addChatBubble,
    showTypingIndicator,
    hideTypingIndicator,
    showToast,
    setInputEnabled,
    renderConversation,
    updateNpcMood,
    showAccuseConfirm,
    showGameOverScreen,
    showVictoryScreen,
  };
})();
