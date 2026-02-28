require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const { Mistral } = require("@mistralai/mistralai");

const app = express();
const PORT = process.env.PORT || 3000;

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// In-memory session store: sessionId -> { scenario, conversations: { npcId: messages[] } }
const sessions = new Map();

app.use(express.json());
app.use(express.static("public"));

// ─── Scenario Generation ────────────────────────────────────────────────────

const LANGUAGE_NAMES = {
  en: "English", tr: "Turkish", es: "Spanish", fr: "French", de: "German",
};

function buildScenarioPrompt(npcCount, questCount, theme, language) {
  const npcIds = Array.from({ length: npcCount }, (_, i) => `npc_${i + 1}`);
  const npcIdList = npcIds.join(", ");

  const themeInstruction = theme
    ? `- The setting MUST be themed around: "${theme}" — make it vivid and specific to this theme`
    : "- The setting should be atmospheric and suspenseful — think noir detective fiction";

  const questIds = Array.from({ length: questCount }, (_, i) => `quest_${i + 1}`);

  return `You are a detective mystery scenario generator. Create a unique mystery scenario for an interrogation-based detective game.

The player is a detective. They interrogate persons of interest to uncover cases, collect evidence, and ultimately identify and extract a confession from the guilty party.

CRITICAL: The npcs array MUST have EXACTLY ${npcCount} objects. The quests array MUST have EXACTLY ${questCount} objects.
NPC ids to use: ${npcIdList}
Quest ids to use: ${questIds.join(", ")}

IMPORTANT: Exactly ONE NPC is the guilty party — the person who committed the central crime. The other NPCs are witnesses, suspects with alibis, or people with their own secrets. The guilty NPC's "secret" should be that they committed the crime. Other NPCs' knowledge and quest clues should gradually point toward the guilty NPC when pieced together.

Return a JSON object. Here is ONE example NPC and ONE example quest to show the structure — but you must create ${npcCount} NPCs and ${questCount} quests total:
{
  "setting": { "name": "Location Name", "description": "2-3 sentences", "atmosphere": "One sentence" },
  "backstory": "1-2 sentence detective briefing about the central crime",
  "central_crime": "A clear 1-2 sentence description of what crime was committed",
  "victim": { "name": "Full Name of the victim", "role": "Their job/position (e.g. Owner of the lounge, Famous painter)", "description": "1-2 sentences about who they were, their personality, why people had strong feelings about them" },
  "guilty_npc_id": "npc_2",
  "confession_evidence": ["Key fact 1 that proves guilt", "Key fact 2 that proves guilt", "Key fact 3 that proves guilt"],
  "timeline": [
    { "time": "8:00 PM", "event": "Dinner begins in the main hall", "witnesses": ["npc_1", "npc_3"] },
    { "time": "9:15 PM", "event": "Loud argument heard from the study", "witnesses": ["npc_2"] },
    { "time": "10:00 PM", "event": "The body is discovered in the cellar", "witnesses": ["npc_1", "npc_4"] }
  ],
  "npcs": [
    { "id": "npc_1", "name": "Name", "role": "Role (e.g. Bar Owner, Secretary)", "personality": "2-3 traits and speaking style", "secret": "What they hide", "relationship_to_victim": "First-person 2-3 sentences about how they knew the victim personally — e.g. I worked for him for 5 years. He was tough but fair. He helped me when I was in trouble.", "whereabouts": "I was in the kitchen preparing desserts from 8 PM until the police arrived", "greeting": "1-2 sentences, in character, first person", "knowledge": ["I was at [place] at [time] and I saw [specific detail]...", "I heard [specific sound/conversation] around [time] from [location]...", "I noticed [specific detail] when I was [doing what] at [time]...", "Something I know about the victim — a personal memory or observation", "Something I noticed about another NPC that night"], "appearance": "Brief description", "dialogue_responses": [{"topic": "what_happened", "response": "A natural in-character 2-3 sentence response about what they witnessed"}, {"topic": "about_victim", "response": "Their personal memories and feelings about the victim — using the victim's actual name"}, {"topic": "pressed_for_details", "response": "Their reaction when the detective pushes harder — annoyed, nervous, or defensive"}, {"topic": "about_npc_2", "response": "What they say about another NPC they have opinions on"}, {"topic": "challenged", "response": "Their defensive reaction when the detective doubts them or accuses them"}, {"topic": "specific_event_topic", "response": "Their account of a specific event from the timeline they witnessed"}] }
  ],
  "quests": [
    { "id": "quest_1", "title": "Case Title", "trigger_topic": "suspicious topic to ask about", "npc_id": "npc_1", "description": "2-3 sentences about the case", "resolution_hint": "How to solve it", "steps": [{ "step": 1, "npc_id": "npc_1", "action": "Discover this case from this person", "dialogue_hint": "What they say to direct you to step 2" }, { "step": 2, "npc_id": "npc_2", "action": "Follow up with this different person", "dialogue_hint": "What they reveal" }], "clue_phrases": ["Something someone might let slip", "Another subtle hint"] }
  ]
}

REMEMBER: Generate ${npcCount} npcs (${npcIdList}) and ${questCount} quests (${questIds.join(", ")}). Do NOT stop at fewer.

Requirements:
- THE VICTIM: The "victim" object MUST have a specific full name, a role/job, and a description of who they were. The victim is NOT one of the NPCs — they are dead. All NPCs knew the victim personally.
- Each NPC MUST have a "relationship_to_victim" field: a first-person 2-3 sentence description of how they personally knew the victim (e.g. boss, friend, rival, owed money to, had an affair with, etc.). Every NPC's relationship must be different and specific.
- guilty_npc_id MUST be one of the NPC ids (${npcIdList})
- confession_evidence must contain exactly 3 pieces of evidence that, when presented to the guilty NPC, would corner them into confessing
- The guilty NPC's knowledge should contain subtle inconsistencies or half-truths that a skilled detective can catch
- Other NPCs' knowledge should contain observations that indirectly implicate the guilty NPC (e.g. "I saw them near the scene", "Their alibi doesn't add up")
- At least one quest should lead to evidence that directly implicates the guilty NPC
- timeline MUST have 4-6 events with specific times. Each event lists which NPC ids witnessed it. Not every NPC sees every event. The victim's name should appear in the timeline events.
- Each NPC MUST have a "whereabouts" field: a first-person 1-sentence summary of where they were and what they were doing during the key timeframe
- NPC COOPERATION: NPCs are witnesses being interrogated. Innocent NPCs WANT to help solve the case — they should share what they know when asked. Only the guilty NPC should be evasive/deflecting. NPCs should NOT say "it's not my business" about a murder they witnessed.
- CRITICAL KNOWLEDGE RULES:
  - Each NPC's knowledge items MUST ONLY describe things they could personally witness based on the timeline and their whereabouts. If an NPC was in the kitchen, they cannot describe what happened in the garden.
  - NO two NPCs may share the same knowledge item or describe the same event in the same way. Each observation must be unique to that person's vantage point.
  - Every knowledge item must include a specific anchor: a time ("around 9 PM"), a place ("near the back door"), or a sensory detail ("I smelled smoke") that ties it to that NPC's unique experience.
  - Some knowledge items across different NPCs should subtly contradict each other (e.g. one says "I heard the argument at 9 PM" while another says "everything was quiet at 9 PM") — this gives the detective clues to cross-reference.
  - Each NPC MUST have at least 4-5 knowledge items covering: (1) what they personally saw/heard that night, (2) something about the victim — a personal memory or recent observation, (3) something they noticed about at least one other NPC that night.
- Each quest's step 1 npc_id must match the quest's top-level npc_id
- Each quest's step 2 npc_id MUST differ from step 1's npc_id
- Each quest needs exactly 2 clue_phrases
- Distribute quests evenly across NPCs
- Trigger topics: suspicious subjects (e.g. "the missing jewels", "last night's argument", "the locked room")
- Each NPC MUST have a very distinct personality and speaking style that makes them clearly different from each other (e.g. one is nervous and stutters, another is arrogant and dismissive, another is overly friendly and chatty)
- ALL knowledge items MUST be written in first person ("I saw...", "I heard...", "I noticed...") — NEVER in third person. An NPC must never refer to themselves by their own name.
- Greetings must be in first person and reflect the NPC's unique personality
- DIALOGUE RESPONSES RULES:
  - Each NPC MUST have 5-6 dialogue_responses covering: "what_happened", "pressed_for_details", "about_npc_X" (for each NPC they have opinions about), "challenged", and 1-2 specific event topics from the timeline
  - Each response MUST be written in the NPC's unique voice/personality (nervous person stutters, arrogant person is dismissive, etc.)
  - Responses must be natural spoken dialogue — 2-4 sentences, with contractions, fragments, interruptions. NOT formal descriptions.
  - Responses must be 100% consistent with the NPC's knowledge, whereabouts, and the timeline. NEVER contradict the knowledge items.
  - The "about_npc_X" topics should use the actual NPC name as the topic (e.g. "about_Mehmet"), and contain what this NPC thinks/knows about that other person
  - The "topic" field for event-specific responses should be a short keyword like "the_argument", "the_crash", "missing_keys" — matching notable events from the timeline
${themeInstruction}
- Secrets should create alibis, motives, or cover-ups tied to the cases
- All content must be family-friendly
${language && language !== "en" ? `- IMPORTANT: ALL generated text content (names, descriptions, dialogue, greetings, knowledge, dialogue_responses, clue_phrases, quest titles, central_crime, confession_evidence, everything) MUST be written in ${LANGUAGE_NAMES[language] || language}. Only the JSON keys and ids (npc_1, quest_1, etc.) stay in English.` : ""}`;
}

app.post("/api/scenario/generate", async (req, res) => {
  try {
    const npcCount = Math.min(5, Math.max(3, parseInt(req.body.npcCount) || 3));
    const questCount = Math.min(5, Math.max(3, parseInt(req.body.questCount) || 3));
    const theme = typeof req.body.theme === "string" ? req.body.theme.slice(0, 100) : null;
    const language = typeof req.body.language === "string" ? req.body.language.slice(0, 5) : "en";

    const prompt = buildScenarioPrompt(npcCount, questCount, theme, language);

    let scenario = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        responseFormat: { type: "json_object" },
        temperature: 0.8,
        maxTokens: 6144,
      });

      const parsed = JSON.parse(response.choices[0].message.content);

      // Validate basic structure
      if (!parsed.setting || !parsed.npcs || !parsed.quests) {
        console.warn(`Attempt ${attempt}: Invalid scenario structure`);
        continue;
      }

      // Validate counts
      if (parsed.npcs.length !== npcCount || parsed.quests.length !== questCount) {
        console.warn(
          `Attempt ${attempt}/${maxAttempts}: Count mismatch — got ${parsed.npcs.length} NPCs (wanted ${npcCount}), ${parsed.quests.length} quests (wanted ${questCount}). ` +
          `Response length: ${response.choices[0].message.content.length} chars, finish_reason: ${response.choices[0].finishReason}`
        );
        if (attempt < maxAttempts) continue;
        // On last attempt, accept what we got
      } else {
        console.log(`Attempt ${attempt}: Generated ${parsed.npcs.length} NPCs and ${parsed.quests.length} quests successfully`);
      }

      scenario = parsed;
      break;
    }

    if (!scenario) {
      throw new Error("Failed to generate valid scenario after retries");
    }

    // Validate guilty_npc_id
    const npcIdSet = new Set(scenario.npcs.map((n) => String(n.id)));
    if (!scenario.guilty_npc_id || !npcIdSet.has(String(scenario.guilty_npc_id))) {
      console.warn(`Invalid guilty_npc_id: "${scenario.guilty_npc_id}" — not found in NPC ids: ${[...npcIdSet].join(", ")}. Defaulting to first NPC.`);
      scenario.guilty_npc_id = scenario.npcs[0].id;
    }
    console.log(`Guilty NPC: ${scenario.guilty_npc_id} (${scenario.npcs.find(n => n.id === scenario.guilty_npc_id)?.name})`);

    // Sanity check: warn about duplicate knowledge across NPCs
    const allKnowledge = [];
    scenario.npcs.forEach((n) => {
      (n.knowledge || []).forEach((k) => {
        const existing = allKnowledge.find((ak) => ak.text === k);
        if (existing) {
          console.warn(`Duplicate knowledge found: "${k}" shared by ${existing.npcId} and ${n.id}`);
        }
        allKnowledge.push({ npcId: n.id, text: k });
      });
    });

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      scenario,
      conversations: {},
      discoveredQuests: new Set(),
      confessionObtained: false,
      moods: {},
      language,
    });

    // Sanitize: strip secrets, trigger_topics, quest descriptions before sending to client
    const clientScenario = {
      setting: scenario.setting,
      backstory: scenario.backstory,
      central_crime: scenario.central_crime || null,
      victim: scenario.victim || null,
      npcs: scenario.npcs.map((npc) => ({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        personality: npc.personality,
        greeting: npc.greeting,
        appearance: npc.appearance,
      })),
      quests: scenario.quests.map((q) => ({
        id: q.id,
        title: q.title,
        npc_id: q.npc_id,
        steps: (q.steps || []).map((s) => ({
          step: s.step,
          npc_id: s.npc_id,
          action: s.action,
        })),
      })),
    };

    res.json({ sessionId, scenario: clientScenario });
  } catch (err) {
    console.error("Scenario generation error:", err);
    res.status(500).json({ error: "Failed to generate scenario" });
  }
});

// ─── NPC Dialogue ───────────────────────────────────────────────────────────

// ─── Agent 1: Reasoning Agent ──────────────────────────────────────────────

function buildReasoningPrompt(npc, quests, scenario, currentMood, accusedCorrectly) {
  const isGuilty = scenario.guilty_npc_id === npc.id;
  const confessionEvidence = scenario.confession_evidence || [];

  const knowledgeBlock = (npc.knowledge || []).map((k) => `• ${k}`).join("\n");

  let dialogueBlock = "";
  if (npc.dialogue_responses && npc.dialogue_responses.length > 0) {
    dialogueBlock = npc.dialogue_responses.map((dr) => {
      return `Topic "${dr.topic}": "${dr.response}"`;
    }).join("\n");
  }

  // Quest triggers
  const step1Quests = quests.filter((q) => q.npc_id === npc.id);
  const step2Quests = quests.filter(
    (q) => q.steps && q.steps.length >= 2 && q.steps[1].npc_id === npc.id && q.npc_id !== npc.id
  );

  let questBlock = "";
  if (step1Quests.length > 0) {
    questBlock += step1Quests.map((q) => {
      return `- QUEST TRIGGER: If detective asks about "${q.trigger_topic}" → set quest_discovered to "${q.id}". Guide dialogue toward "${q.title}": ${q.description}. ${q.steps?.[0]?.dialogue_hint || ""}`;
    }).join("\n") + "\n";
  }
  if (step2Quests.length > 0) {
    questBlock += step2Quests.map((q) => {
      return `- QUEST STEP: If detective asks about "${q.title}" or "${q.trigger_topic}" → set quest_step to "${q.id}:step_2". Reveal: ${q.steps[1].dialogue_hint || "follow-up info"}`;
    }).join("\n") + "\n";
  }

  let guiltyBlock = "";
  if (isGuilty) {
    const accusePressure = accusedCorrectly
      ? "\n- THE DETECTIVE HAS FORMALLY ACCUSED THIS NPC. They are panicking. Much closer to confessing."
      : "";
    guiltyBlock = `
THIS NPC IS THE GUILTY PARTY. They committed: ${scenario.central_crime}
- They should deny, deflect, and give false alibis.
- Under heavy pressure: get nervous, make contradictions.
- Evidence that proves guilt: ${confessionEvidence.map((e, i) => `${i + 1}) ${e}`).join("; ")}
- If detective presents 2+ pieces of evidence or logically corners them: set confession to true.
- Do NOT confess without real evidence pressure.${accusePressure}
`;
  }

  const victim = scenario.victim;
  const victimLine = victim ? `VICTIM: ${victim.name} — ${victim.role}. ${victim.description}` : "";

  return `You are a REASONING AGENT for a detective interrogation game. Your job is to analyze the detective's message and decide what NPC "${npc.name}" should say based ONLY on their knowledge.

NPC: ${npc.name} (${npc.role})
Personality: ${npc.personality}
Secret: ${npc.secret}
Whereabouts: ${npc.whereabouts || "Unknown"}
${victimLine}
Relationship to victim: ${npc.relationship_to_victim || "None specified"}
Current mood: ${currentMood || "neutral"}

KNOWLEDGE (these are the ONLY facts this NPC knows):
${knowledgeBlock}

${dialogueBlock ? `PRE-WRITTEN RESPONSES (use these as basis for what the NPC should say):
${dialogueBlock}
` : ""}
${questBlock}${guiltyBlock}
You MUST respond with a JSON object:
{
  "analysis": "What is the detective asking about?",
  "relevant_knowledge": "Quote the EXACT knowledge items or pre-written responses that are relevant. If NONE are relevant, write 'NO RELEVANT KNOWLEDGE'.",
  "should_know": true/false — does this NPC have knowledge about this topic?,
  "what_to_say": "Brief summary of what the NPC should tell the detective, based ONLY on their knowledge. If should_know is false, write 'NPC does not know about this.'",
  "mood_after": "What mood should the NPC be in after this exchange? One of: neutral, cooperative, friendly, irritated, angry, hostile, nervous",
  "quest_discovered": "quest_id" or null,
  "quest_step": "quest_id:step_2" or null,
  "confession": false
}

RULES:
- ONLY use facts from the NPC's KNOWLEDGE and PRE-WRITTEN RESPONSES. NEVER invent new facts.
- If the detective asks about something not in the knowledge list, should_know MUST be false.
- If the detective asks the same thing repeatedly, mood should worsen (irritated → angry → hostile).
- what_to_say must NOT contradict any knowledge item.`;
}

// ─── Agent 2: Dialogue Agent ───────────────────────────────────────────────

function buildDialoguePrompt(npc, scenario, language, reasoningResult) {
  const victim = scenario.victim;
  const otherNpcs = scenario.npcs
    .filter((n) => n.id !== npc.id)
    .map((n) => `${n.name} (${n.role})`)
    .join(", ");

  const moodDescriptions = {
    neutral: "cautious and measured",
    cooperative: "willing to help and open",
    friendly: "warm and talkative",
    irritated: "annoyed — shorter, snappier",
    angry: "angry — curt, hostile",
    hostile: "barely tolerant — minimal, dismissive",
    nervous: "anxious — stumbling, fidgeting",
  };
  const moodDesc = moodDescriptions[reasoningResult.mood_after] || moodDescriptions.neutral;

  return `You are ${npc.name}, a real person being interrogated by a detective. Generate ONLY your spoken dialogue.

CHARACTER: ${npc.personality}
YOUR MOOD: ${reasoningResult.mood_after} — ${moodDesc}
OTHERS HERE: ${otherNpcs}
${victim ? `VICTIM: ${victim.name}` : ""}

THE REASONING AGENT HAS DECIDED:
${reasoningResult.should_know ? `You DO know about this. Say this: ${reasoningResult.what_to_say}` : `You do NOT know about this. Say you don't know — be natural about it ("I wasn't there", "No idea", "Ask someone else").`}

RULES:
- Talk like a real human. Contractions, fragments, interruptions. Messy and natural.
- NEVER introduce yourself with your job title.
- First person ONLY ("I", "me", "my"). Never say "${npc.name}".
- 1-3 sentences. Up to 5 for emotional moments.
- Match your mood: ${moodDesc}.
- ONLY say what the reasoning agent told you to say. Do NOT add new facts.
- No markdown, no emojis, no system text.
${language && language !== "en" ? `- Respond ONLY in ${LANGUAGE_NAMES[language] || language}. Never use English.` : ""}

Respond with ONLY a JSON object:
{"dialogue": "Your spoken words here"}`;
}

app.post("/api/dialogue/send", async (req, res) => {
  try {
    const { sessionId, npcId, message } = req.body;

    if (!sessionId || !npcId || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const npc = session.scenario.npcs.find((n) => n.id === npcId);
    if (!npc) {
      return res.status(404).json({ error: "NPC not found" });
    }

    // Initialize conversation history for this NPC if needed
    if (!session.conversations[npcId]) {
      session.conversations[npcId] = [];
    }

    const history = session.conversations[npcId];
    history.push({ role: "user", content: message });

    const currentMood = session.moods[npcId] || "neutral";
    const accusedCorrectly = session.accusedCorrectly && npcId === session.scenario.guilty_npc_id;

    // ── Agent 1: Reasoning ──────────────────────────────────────────────
    const reasoningPrompt = buildReasoningPrompt(
      npc, session.scenario.quests, session.scenario, currentMood, accusedCorrectly
    );

    const reasoningResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: reasoningPrompt },
        ...history,
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.3,
      maxTokens: 500,
    });

    let reasoningResult;
    try {
      reasoningResult = JSON.parse(reasoningResponse.choices[0].message.content);
    } catch (parseErr) {
      console.warn("Failed to parse reasoning JSON:", reasoningResponse.choices[0].message.content);
      reasoningResult = {
        analysis: "Could not parse",
        relevant_knowledge: "NO RELEVANT KNOWLEDGE",
        should_know: false,
        what_to_say: "NPC does not know about this.",
        mood_after: currentMood,
        quest_discovered: null,
        quest_step: null,
        confession: false,
      };
    }

    console.log(`[${npc.name}] Reasoning:`, {
      analysis: reasoningResult.analysis,
      should_know: reasoningResult.should_know,
      mood_after: reasoningResult.mood_after,
      quest_discovered: reasoningResult.quest_discovered,
      confession: reasoningResult.confession,
    });

    // ── Agent 2: Dialogue ───────────────────────────────────────────────
    const dialoguePrompt = buildDialoguePrompt(
      npc, session.scenario, session.language, reasoningResult
    );

    const dialogueResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: dialoguePrompt },
        ...history,
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.85,
      maxTokens: 400,
      presencePenalty: 0.7,
      frequencyPenalty: 0.5,
    });

    let dialogueParsed;
    try {
      dialogueParsed = JSON.parse(dialogueResponse.choices[0].message.content);
    } catch (parseErr) {
      console.warn("Failed to parse dialogue JSON:", dialogueResponse.choices[0].message.content);
      // Fallback: use raw content as dialogue
      dialogueParsed = {
        dialogue: dialogueResponse.choices[0].message.content
          .replace(/```json/g, "").replace(/```/g, "").trim(),
      };
    }

    const dialogue = (dialogueParsed.dialogue || "").trim();

    // ── Extract metadata from reasoning result ──────────────────────────
    const validMoods = ["neutral", "cooperative", "irritated", "angry", "hostile", "nervous", "friendly"];
    const mood = validMoods.includes(reasoningResult.mood_after?.toLowerCase())
      ? reasoningResult.mood_after.toLowerCase()
      : currentMood;
    session.moods[npcId] = mood;

    // Quest discoveries
    const discoveredQuests = [];
    if (reasoningResult.quest_discovered) {
      const questId = String(reasoningResult.quest_discovered);
      const quest = session.scenario.quests.find((q) => q.id === questId);
      if (quest && !session.discoveredQuests.has(questId)) {
        discoveredQuests.push({
          id: quest.id,
          title: quest.title,
          description: quest.description,
        });
        session.discoveredQuests.add(questId);
      }
    }

    // Quest step progression
    const questProgress = [];
    if (reasoningResult.quest_step) {
      const stepMatch = String(reasoningResult.quest_step).match(/^(\w+):step_(\d+)$/);
      if (stepMatch) {
        questProgress.push({
          questId: stepMatch[1],
          step: parseInt(stepMatch[2]),
        });
      }
    }

    // Confession
    let confession = false;
    if (reasoningResult.confession === true) {
      confession = true;
      session.confessionObtained = true;
    }

    // Store clean dialogue in history
    history.push({ role: "assistant", content: dialogue });

    res.json({
      response: dialogue,
      discoveredQuests,
      questProgress,
      confession,
      mood,
    });
  } catch (err) {
    console.error("Dialogue error:", err);
    res.status(500).json({ error: "Failed to get NPC response" });
  }
});

// ─── Accuse Endpoint ─────────────────────────────────────────────────────────

app.post("/api/accuse", (req, res) => {
  try {
    const { sessionId, npcId } = req.body;

    if (!sessionId || !npcId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Only allow one accusation per game
    if (session.accusedAlready) {
      return res.status(400).json({ error: "Already accused someone" });
    }
    session.accusedAlready = true;

    // Use String() to avoid type mismatch (AI might generate number vs string)
    const correct = String(npcId) === String(session.scenario.guilty_npc_id);
    console.log("Accuse:", { npcId, guiltyId: session.scenario.guilty_npc_id, correct });

    if (correct) {
      session.accusedCorrectly = true;
      session.moods[npcId] = "nervous";
    }

    const guiltyNpc = session.scenario.npcs.find((n) => String(n.id) === String(session.scenario.guilty_npc_id));

    res.json({
      correct,
      guiltyName: !correct ? (guiltyNpc?.name || "Unknown") : null,
    });
  } catch (err) {
    console.error("Accuse error:", err);
    res.status(500).json({ error: "Failed to process accusation" });
  }
});

// ─── Hint Endpoint ──────────────────────────────────────────────────────────

app.post("/api/hint", (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Find quests not yet discovered
    const undiscovered = session.scenario.quests.filter(
      (q) => !session.discoveredQuests.has(q.id)
    );

    if (undiscovered.length === 0) {
      return res.json({ hint: null });
    }

    // Pick a random undiscovered quest
    const quest = undiscovered[Math.floor(Math.random() * undiscovered.length)];
    const npc = session.scenario.npcs.find((n) => n.id === quest.npc_id);
    const npcName = npc ? npc.name : "someone";

    // Pick a random clue phrase
    const cluePhrase =
      quest.clue_phrases && quest.clue_phrases.length > 0
        ? quest.clue_phrases[Math.floor(Math.random() * quest.clue_phrases.length)]
        : quest.trigger_topic;

    const hintPrefixes = {
      en: "Try questioning", tr: "Sorgulayın:", es: "Intenta interrogar a",
      fr: "Essayez d'interroger", de: "Versuche zu befragen:",
    };
    const prefix = hintPrefixes[session.language] || hintPrefixes.en;
    res.json({ hint: `${prefix} ${npcName} — ${cluePhrase}` });
  } catch (err) {
    console.error("Hint error:", err);
    res.status(500).json({ error: "Failed to get hint" });
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
