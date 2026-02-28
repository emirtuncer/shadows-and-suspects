// ─── Quest Log Manager ──────────────────────────────────────────────────────

const Quests = (() => {
  // questId -> { title, description, npcName, steps: [{ step, npc_id, action, completed }], currentStep }
  const discovered = new Map();
  let totalQuests = 3;
  let allQuests = [];

  function init(quests, setting, backstory, centralCrime, victim) {
    allQuests = quests;
    totalQuests = quests.length;
    discovered.clear();
    renderBrief(setting, backstory, centralCrime, victim);
    renderList();
    updateCounter();
    initHintButton();
  }

  function renderBrief(setting, backstory, centralCrime, victim) {
    const el = document.getElementById("investigation-brief");
    if (!el || !setting) return;
    el.innerHTML = `
      <div class="brief-label">${escapeHtml(t("investigationBrief"))}</div>
      <div class="brief-setting">${escapeHtml(setting.name)}</div>
      <div class="brief-text">${escapeHtml(backstory || setting.description)}</div>
      ${victim ? `<div class="brief-victim"><span class="brief-victim-label">${escapeHtml(t("victim"))}:</span> ${escapeHtml(victim.name)} — ${escapeHtml(victim.role)}</div>` : ""}
      ${centralCrime ? `<div class="brief-crime"><span class="brief-crime-label">${escapeHtml(t("centralCrime"))}:</span> ${escapeHtml(centralCrime)}</div>` : ""}
    `;
  }

  function initHintButton() {
    const btn = document.getElementById("hint-btn");
    if (!btn) return;
    btn.addEventListener("click", requestHint);
  }

  async function requestHint() {
    const btn = document.getElementById("hint-btn");
    btn.disabled = true;

    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: Scenario.getSessionId() }),
      });

      if (!res.ok) throw new Error("Hint request failed");

      const data = await res.json();
      if (data.hint) {
        UI.showToast(data.hint, "hint");
      } else {
        UI.showToast(t("allCasesOpened"), "hint");
      }
    } catch (err) {
      console.error("Hint error:", err);
      UI.showToast(t("noLeadNow"), "hint");
    }

    setTimeout(() => { btn.disabled = false; }, 2000);
  }

  function handleDiscoveries(discoveredQuests) {
    if (!discoveredQuests || discoveredQuests.length === 0) return;

    discoveredQuests.forEach((quest) => {
      if (discovered.has(quest.id)) return;

      // Find full quest info from the client scenario
      const scenario = Scenario.getScenario();
      const questInfo = scenario.quests.find((q) => q.id === quest.id);
      const npc = questInfo ? Scenario.getNpc(questInfo.npc_id) : null;

      // Build step tracking
      const steps = (questInfo?.steps || []).map((s, i) => ({
        step: s.step,
        npc_id: s.npc_id,
        action: s.action,
        completed: i === 0, // Step 1 is completed on discovery
      }));

      discovered.set(quest.id, {
        title: quest.title,
        description: quest.description || "",
        npcName: npc?.name || "Unknown",
        steps,
        currentStep: steps.length > 1 ? 2 : 1,
      });

      UI.showToast(t("newCase", { title: quest.title }));
    });

    renderList();
    updateCounter();
  }

  function handleQuestProgress(questProgress) {
    if (!questProgress || questProgress.length === 0) return;

    questProgress.forEach(({ questId, step }) => {
      const quest = discovered.get(questId);
      if (!quest) return;

      const stepEntry = quest.steps.find((s) => s.step === step);
      if (stepEntry && !stepEntry.completed) {
        stepEntry.completed = true;
        quest.currentStep = step + 1;

        // Check if all steps completed
        const allDone = quest.steps.every((s) => s.completed);
        if (allDone) {
          UI.showToast(t("caseClosed", { title: quest.title }));
        } else {
          UI.showToast(t("leadConfirmed", { title: quest.title, step }));
        }
      }
    });

    renderList();
  }

  function renderList() {
    const list = document.getElementById("quest-list");
    list.innerHTML = "";

    if (discovered.size === 0) {
      list.innerHTML = `<div class="quest-empty">${escapeHtml(t("noCases"))}</div>`;
      return;
    }

    discovered.forEach((quest, questId) => {
      list.appendChild(renderQuestEntry(questId, quest));
    });
  }

  function renderQuestEntry(questId, quest) {
    const entry = document.createElement("div");
    entry.className = "quest-entry";

    const allDone = quest.steps.every((s) => s.completed);

    let stepsHtml = "";
    if (quest.steps.length > 0) {
      stepsHtml = `<div class="quest-steps">`;
      quest.steps.forEach((s) => {
        const npc = Scenario.getNpc(s.npc_id);
        const npcName = npc ? npc.name : "???";
        const isCompleted = s.completed;
        const isActive = !isCompleted && s.step === quest.currentStep;
        const stateClass = isCompleted ? "completed" : isActive ? "active" : "";
        const icon = isCompleted ? "&#10003;" : s.step;

        stepsHtml += `
          <div class="quest-step ${stateClass}">
            <span class="quest-step-icon">${icon}</span>
            <span>Step ${s.step}: ${escapeHtml(s.action)} (${escapeHtml(npcName)})</span>
          </div>`;
      });
      stepsHtml += `</div>`;
    }

    entry.innerHTML = `
      <div class="quest-title">${escapeHtml(quest.title)}${allDone ? " &#10003;" : ""}</div>
      ${quest.description ? `<div class="quest-desc">${escapeHtml(quest.description)}</div>` : ""}
      <div class="quest-npc">${escapeHtml(t("keyWitness", { name: quest.npcName }))}</div>
      ${stepsHtml}
    `;
    return entry;
  }

  function updateCounter() {
    document.getElementById("quest-counter").textContent =
      t("casesOpened", { discovered: discovered.size, total: totalQuests });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return { init, handleDiscoveries, handleQuestProgress };
})();
