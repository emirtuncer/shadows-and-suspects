// ─── Dialogue Manager ───────────────────────────────────────────────────────

const Dialogue = (() => {
  let currentNpcId = null;
  let sending = false;

  // Client-side conversation cache: { npcId: [{ role, text }] }
  const chatHistory = {};

  let gameOver = false;
  let hasAccused = false;

  function init() {
    document.getElementById("chat-send").addEventListener("click", sendMessage);
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.getElementById("accuse-btn").addEventListener("click", () => {
      if (sending || !currentNpcId || gameOver) return;
      const npc = Scenario.getNpc(currentNpcId);
      UI.showAccuseConfirm(npc.name, () => accuse(npc));
    });
  }

  async function accuse(npc) {
    if (sending || gameOver) return;
    sending = true;
    UI.setInputEnabled(false);

    try {
      const res = await fetch("/api/accuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: Scenario.getSessionId(),
          npcId: npc.id,
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();

      // Hide accuse button after any accusation (one chance only)
      hasAccused = true;
      document.getElementById("accuse-btn").classList.add("hidden");

      if (data.correct) {
        UI.showToast(t("correctAccusation"));
        UI.updateNpcMood(npc.id, "nervous");
      } else {
        gameOver = true;
        UI.showGameOverScreen(data.guiltyName);
      }
    } catch (err) {
      console.error("Accuse error:", err);
      UI.showToast(t("systemError"));
    }

    sending = false;
    if (!gameOver) UI.setInputEnabled(true);
  }

  function selectNpc(npc) {
    if (sending) return;

    currentNpcId = npc.id;
    UI.setActiveNpc(npc.id);
    UI.setDialogueHeader(npc.name, !hasAccused);

    // Restore or start conversation
    if (chatHistory[npc.id]) {
      UI.renderConversation(npc.name, chatHistory[npc.id]);
    } else {
      UI.clearChat();
      chatHistory[npc.id] = [];
      // Show greeting
      const greetingMsg = { role: "npc", text: npc.greeting };
      chatHistory[npc.id].push(greetingMsg);
      UI.addChatBubble(npc.name, npc.greeting, false);
    }

    UI.setInputEnabled(true);
  }

  async function sendMessage() {
    if (sending || !currentNpcId) return;

    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    sending = true;
    UI.setInputEnabled(false);

    const npc = Scenario.getNpc(currentNpcId);

    // Add player message
    chatHistory[currentNpcId].push({ role: "player", text });
    UI.addChatBubble("You", text, true);

    // Show typing indicator
    UI.showTypingIndicator();

    try {
      const res = await fetch("/api/dialogue/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: Scenario.getSessionId(),
          npcId: currentNpcId,
          message: text,
        }),
      });

      UI.hideTypingIndicator();

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();

      // Add NPC response
      chatHistory[currentNpcId].push({ role: "npc", text: data.response });
      await UI.addChatBubble(npc.name, data.response, false);

      // Handle quest discoveries
      if (data.discoveredQuests?.length > 0) {
        Quests.handleDiscoveries(data.discoveredQuests);
      }

      // Handle quest step progression
      if (data.questProgress?.length > 0) {
        Quests.handleQuestProgress(data.questProgress);
      }

      // Handle confession
      if (data.confession) {
        UI.showVictoryScreen(npc.name);
      }

      // Update NPC mood indicator
      if (data.mood) {
        UI.updateNpcMood(currentNpcId, data.mood);
      }
    } catch (err) {
      UI.hideTypingIndicator();
      UI.addChatBubble("System", t("systemError"), false);
      console.error("Dialogue error:", err);
    }

    sending = false;
    UI.setInputEnabled(true);
  }

  return { init, selectNpc };
})();
