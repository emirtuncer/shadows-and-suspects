// ─── App Entry Point ────────────────────────────────────────────────────────

(function () {
  Dialogue.init();
  UI.showSetupScreen();

  document.getElementById("begin-btn").addEventListener("click", async () => {
    const config = UI.getSetupConfig();
    UI.applyLanguage(config.language);

    UI.hideSetupScreen();
    UI.showLoading();

    try {
      const scenario = await Scenario.generate(config);

      UI.renderHeader(scenario.setting, scenario.backstory);
      UI.renderNpcCards(scenario.npcs, (npc) => Dialogue.selectNpc(npc));
      Quests.init(scenario.quests, scenario.setting, scenario.backstory, scenario.central_crime, scenario.victim);

      UI.hideLoading();
    } catch (err) {
      console.error("Failed to start game:", err);
      document.querySelector(".loading-text").textContent =
        "Failed to generate world. Please refresh to try again.";
    }
  });
})();
