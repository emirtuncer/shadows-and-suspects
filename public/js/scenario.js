// ─── Scenario Manager ───────────────────────────────────────────────────────

const Scenario = (() => {
  let sessionId = null;
  let scenario = null;

  async function generate(config = {}) {
    const res = await fetch("/api/scenario/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("Failed to generate scenario");
    const data = await res.json();
    sessionId = data.sessionId;
    scenario = data.scenario;
    return scenario;
  }

  function getSessionId() {
    return sessionId;
  }

  function getScenario() {
    return scenario;
  }

  function getNpc(npcId) {
    return scenario?.npcs.find((n) => n.id === npcId) || null;
  }

  return { generate, getSessionId, getScenario, getNpc };
})();
