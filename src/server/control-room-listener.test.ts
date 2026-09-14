import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTROL_ROOM_TRANSCRIPTION_PROMPT, createControlRoomRealtimeSession } from "./control-room-listener.js";
import { CONTROL_ROOM_BANTER_STYLE, CONTROL_ROOM_PRESENTATION_SPEECH_SPEED, CONTROL_ROOM_PRESENTATION_SPEECH_STYLE, CONTROL_ROOM_VOICE_AUDITIONS, responseOutputText, responseResearchSources, sanitizeResearchSpeech } from "./routes/control-room.js";
import { CONTROL_ROOM_PRESENTATION_BRIEFS } from "./control-room-presentation-briefs.js";
import { PROPOSED_CONTROL_ROOM_RESPONSIBILITIES } from "./control-room-responsibilities.js";

describe("control-room realtime listener", () => {
  it("is transcription-only and carries cast-name guidance", () => {
    const session = createControlRoomRealtimeSession();
    expect(session.model).toBe("gpt-realtime");
    expect(session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(session.audio.input.turn_detection.create_response).toBe(false);
    expect(CONTROL_ROOM_TRANSCRIPTION_PROMPT).toContain("Mabel");
    expect(CONTROL_ROOM_TRANSCRIPTION_PROMPT).toContain("Rufus");
  });
});

describe("control-room live research response parsing", () => {
  it("keeps the short answer and only public, unique sources", () => {
    const response = {
      output: [
        { type: "web_search_call", action: { sources: [{ title: "One", url: "https://example.com/one" }, { title: "Duplicate", url: "https://example.com/one" }, { title: "Ignored", url: "http://insecure.example/two" }] } },
        { type: "message", content: [{ type: "output_text", text: "A concise, sourced answer." }] }
      ]
    };
    expect(responseOutputText(response)).toBe("A concise, sourced answer.");
    expect(responseResearchSources(response)).toEqual([{ title: "One", url: "https://example.com/one" }]);
  });
});

describe("control-room presentation briefs", () => {
  it("keeps a read-only, source-traceable snapshot for every presentation persona", () => {
    expect(CONTROL_ROOM_PRESENTATION_BRIEFS).toHaveLength(21);
    expect(new Set(CONTROL_ROOM_PRESENTATION_BRIEFS.map(brief => brief.agentName)).size).toBe(21);
    expect(CONTROL_ROOM_PRESENTATION_BRIEFS.every(brief => brief.sourceReferences.length >= 1)).toBe(true);
  });
});

describe("control-room proposed responsibility profiles", () => {
  it("keeps six bounded, reviewable responsibilities for every presentation persona", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(PROPOSED_CONTROL_ROOM_RESPONSIBILITIES).toHaveLength(21);
    expect(PROPOSED_CONTROL_ROOM_RESPONSIBILITIES.every(profile => profile.responsibilities.length === 6)).toBe(true);
    expect(PROPOSED_CONTROL_ROOM_RESPONSIBILITIES.find(profile => profile.agentName === "Mabel")?.responsibilities.join(" ")).toContain("producer");
    expect(page).toContain("Proposed HeartWord responsibilities");
    expect(page).toContain("/responsibilities/${encodeURIComponent(agent)}");
    expect(page).toContain("portrait-responsibilities");
  });
});

describe("control-room live research speech", () => {
  it("removes links and caps speech at one concise response", () => {
    const longReply = `See https://example.com and www.example.org. ${Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ")}`;
    const result = sanitizeResearchSpeech(longReply);
    expect(result).not.toMatch(/https?:|www\./i);
    expect(result.split(" ").length).toBeLessThanOrEqual(55);
  });
});

describe("control-room presentation speech pacing", () => {
  it("uses a modestly faster, conversational shared style", () => {
    expect(CONTROL_ROOM_PRESENTATION_SPEECH_SPEED).toBe(1.15);
    expect(CONTROL_ROOM_PRESENTATION_SPEECH_STYLE).toContain("connected, natural conversational");
  });
});

describe("control-room presentation playback calibration", () => {
  it("gives Miriam an isolated, peak-limited playback boost", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("Miriam:{ gainDb:8, limiterThresholdDb:-1 }");
    expect(page).toContain("Math.pow(10, calibration.gainDb / 20)");
    expect(page).toContain("createDynamicsCompressor()");
    expect(page).toContain("connectPresentationAudio(source, names[0])");
    expect(page).toContain("connectPresentationAudio(source, speaker)");
  });
});

describe("control-room ElevenLabs auditions", () => {
  it("keeps a small, fixed presentation-only audition palette and sharper staged banter", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(CONTROL_ROOM_VOICE_AUDITIONS).toHaveLength(11);
    expect(CONTROL_ROOM_VOICE_AUDITIONS.map(candidate => candidate.agent)).toEqual(["Mabel", "Dottie", "Rufus", "Gus", "Vera", "Gene Siskel", "Leon", "Pippa", "Tessa", "Sam", "Arlo"]);
    expect(CONTROL_ROOM_BANTER_STYLE).toContain("playfully sarcastic");
    expect(CONTROL_ROOM_VOICE_AUDITIONS.every(candidate => candidate.voiceId.length > 0)).toBe(true);
    expect(page).toContain("ElevenLabs voice auditions");
    expect(page).toContain("voice-auditions/${encodeURIComponent(auditionId)}");
    expect(page).toContain("voice-audition-active");
    expect(page).toContain("eleven\\s*labs");
    expect(page).toContain("openVoiceAuditions();\n          return [];");
  });
});

describe("control-room presentation start", () => {
  it("uses the producer's microphone click as the browser-approved full-screen gesture", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("const enterPresentationFullscreen");
    expect(page).toContain("document.documentElement.requestFullscreen()");
    expect(page).toContain("enterPresentationFullscreen();");
  });
});

describe("control-room reply interruption", () => {
  it("cancels speech generation and playback when the producer starts speaking", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("input_audio_buffer.speech_started");
    expect(page).toContain("interruptPresentationReply");
    expect(page).toContain("AbortController");
  });
});

describe("control-room staged exchange playback", () => {
  it("keeps exchange speech on the presentation-only endpoint", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("presentation-speech");
    expect(page).toContain("heartwordPlayExchangeVoice");
    expect(page).toContain("exchange-speaking");
    expect(page).toContain("exchange-listening");
    expect(page).toContain("Speaking");
    expect(page).toContain("speech-cue-right");
    expect(page).toContain("border-top:3px solid currentColor");
    expect(page).not.toContain('content:"→"');
    expect(page).not.toContain('content:"←"');
    expect(page).toContain("grid-row:auto !important");
    expect(page).toContain("border-radius:18px !important");
    expect(page).toContain("const topRowCount = Math.ceil(others.length / 2)");
    expect(page).toContain("const x = rowCount === 1 ? 50 : 8 + rowIndex / (rowCount - 1) * 84");
    expect(page).toContain("card.style.top = `${isTopRow ? 14 : 84}%`");
    expect(page).toContain("card.style.setProperty('width', '88px', 'important')");
  });
});

describe("control-room any-issues cue", () => {
  it("randomly selects a saved two-person presentation exchange for the addressed agent", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "src/server/routes/control-room.ts"), "utf8");
    expect(page).toContain("any\\s+issues");
    expect(page).toContain("heartword:play-issue-exchange");
    expect(routes).toContain('post("/issue-exchange"');
    expect(routes).toContain("json_array_length(agents_json)=2");
    expect(routes).toContain("ORDER BY RANDOM()");
    expect(routes).toContain("CONTROL_ROOM_MAP_AGENT_NAMES.has(name)");
  });
});

describe("control-room close-up portraits", () => {
  it("uses close-ups on map cards while retaining original portraits for the dialog", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    const portraits = resolve(process.cwd(), "docs/assets/control-room/agent-portraits");
    expect(page).toContain('data-portrait="../docs/assets/control-room/agent-portraits/vera-inspector.png"');
    expect(page).toContain('src="../docs/assets/control-room/agent-portraits/vera-inspector-closeup.png"');
    expect(existsSync(resolve(portraits, "vera-inspector-closeup.png"))).toBe(true);
    expect(existsSync(resolve(portraits, "benny-assembly-lead-closeup.png"))).toBe(true);
  });

  it("uses compact two-line name and role captions below each square map portrait", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("grid-template-rows:132px 50px");
    expect(page).toContain("object-fit:cover");
    expect(page).toContain(".hw-map .node > span > span");
    expect(page).toContain(".hw-map .supporting-map-band .supporting-map-card.voice-selected > span {");
    expect(page).toContain("background:transparent !important;");
    expect(page).toContain("display:block !important;");
    expect(page).toContain(".supporting-map-band .supporting-map-card.voice-selected strong {");
    expect(page).toContain("font-size:1.98rem !important;");
    expect(page).toContain("font-size:1.18rem !important;");
    expect(page).toContain("height:260px !important;");
    expect(page).toContain("width:170px !important;");
    expect(page).toContain("portrait?.style.setProperty('height', '260px', 'important');");
  });

  it("keeps outward-facing names visible around a focused agent", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain(".hw-map.cast-focus-active .voice-thumbnail::after");
    expect(page).toContain("overflow:visible;");
    expect(page).toContain("thumbnail-label-left");
    expect(page).toContain("thumbnail-label-right");
    expect(page).toContain("top:calc(100% + 20px)");
    expect(page).toContain("const direction = isTopRow ? 'top' : 'bottom'");
    expect(page).toContain("card.style.top = `${isTopRow ? 14 : 84}%`");
  });
});

describe("control-room red team map cards", () => {
  it("shows all three review challengers in a visually distinct presentation-only group", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("red-team-map-card");
    expect(page).toContain(".red-team-map-card { border:2px solid");
    expect(page).toContain('data-portrait-name="Ada - Red Team Scripture Fidelity Challenger"');
    expect(page).toContain('data-portrait-name="Theo - Red Team Dramatic Impact Challenger"');
    expect(page).toContain('data-portrait-name="Cora - Red Team Production Feasibility Challenger"');
    expect(page).toContain('<strong>Ada</strong><span>Scripture Fidelity Challenger</span>');
    expect(page).not.toContain('Red Team — Scripture Fidelity Challenger');
    expect(page).toContain('role.textContent = selected.includes(card) ? `Red Team - ${role.dataset.normalRole}` : role.dataset.normalRole;');
    expect(page).toContain("Presentation-only review map card");
    expect(page).toContain("const redTeamPositions = { Ada:{ x:31.5, y:72.5 }, Theo:{ x:38.5, y:72.5 }, Cora:{ x:45.5, y:72.5 } }");
    expect(page).toContain("redTeamPositions[card.dataset.mapSlot]");
    expect(page).toContain("red-team-group");
    expect(page).toContain('content:"Red Team"');
    expect(page).toContain("const refreshGroup = () => {");
  });
});

describe("control-room film critics", () => {
  it("adds a separate presentation-only Siskel and Ebert team with distinct voices", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("film-critics-map-card");
    expect(page).toContain("film-critics-group");
    expect(page).toContain('content:"Film Critics"');
    expect(page).toContain("Gene Siskel");
    expect(page).toContain("Roger Ebert");
    expect(page).toContain("'Siskel'");
    expect(page).toContain("'Ebert'");
    expect(page).toContain("gene-siskel-film-critic.png");
    expect(page).toContain("roger-ebert-film-critic.png");
    expect(page).toContain("heartword-control-room-production-crew-frame-v3");
    expect(page).toContain("'Gene Siskel': { x:61.5, y:72.5 }");
    expect(page).toContain("production-crew-group");
    expect(page).toContain('content:"Production Crew"');
    expect(page).toContain("overflow-x:clip;");
    expect(page).toContain("const padding = 10;");
  });
});

describe("control-room compact map layout", () => {
  it("moves the complete presentation cast into a centered four-row grid", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain(":not(.presentation-clean) .hw-map { min-height:1100px !important; }");
    expect(page).toContain("heartword-control-room-compact-grid-v3");
    expect(page).toContain("['Mabel', 'Rufus', 'Pippa', 'Gus', 'Vera', 'Orion']");
    expect(page).toContain("['Ada', 'Theo', 'Cora']");
    expect(page).toContain("x: 50 + (columnIndex - (row.length - 1) / 2) * 7");
    expect(page).toContain("y: 30.5 + rowIndex * 13");
  });
});

describe("control-room normal card labels", () => {
  it("shows every first name and role on separate caption lines", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain("grid-template-rows:132px 50px");
    expect(page).toContain('<strong>Mabel</strong><span>Supervisor</span>');
    expect(page).toContain('<strong>Rufus</strong><span>Creative Director</span>');
    expect(page).toContain('<strong>June</strong><span>Production Director</span>');
    expect(page).toContain("font-size:.66rem;");
  });
});

describe("control-room cast-only presentation stage", () => {
  it("keeps the default screen clear except for the cast map and microphone control", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain('class="presentation-clean"');
    expect(page).toContain(".presentation-clean .showtime");
    expect(page).toContain(".presentation-clean .view-switcher");
    expect(page).toContain(".presentation-clean .producer-address input");
    expect(page).toContain("#producer-address-mic::before");
    expect(page).toContain('content:"\\1F399"');
    expect(page).toContain("min-height:calc(100dvh - 16px)");
    expect(page).toContain("heartword-control-room-cast-only-grid-v4");
    expect(page).toContain("width:170px; min-height:220px");
    expect(page).toContain("{ y:18, names:['Mabel', 'Rufus', 'Pippa', 'Gus', 'Vera', 'Orion', 'June', 'Leon'], start:15, step:10 }");
    expect(page).toContain("{ y:82, names:['Ada', 'Theo', 'Cora'], start:29, step:10 }");
  });

  it("uses the approved HeartWord AI mark as a discreet stage signature", () => {
    const page = readFileSync(resolve(process.cwd(), "work/agent-control-room.html"), "utf8");
    expect(page).toContain('class="heartword-studio-mark"');
    expect(page).toContain('src="../docs/assets/branding/heartword-ai-logo.png"');
    expect(page).toContain("right:20px; bottom:20px");
    expect(page).toContain("mix-blend-mode:multiply");
    expect(page).toContain(".hw-map.cast-focus-active .heartword-studio-mark { display:none; }");
  });
});
