import { Router } from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../db/client.js";
import { getDb } from "../../db/client.js";
import { createControlRoomRealtimeSession } from "../control-room-listener.js";
import { proposedResponsibilitiesFor } from "../control-room-responsibilities.js";
import { redTeamFindingsFor, redTeamImprovementFallback, redTeamImprovementResearchBrief, redTeamResponseModeFor, redTeamReviewResponse, redTeamReviewerForAgent, type RedTeamReviewer } from "../control-room-red-team-findings.js";

export const controlRoomRouter = Router();

const CONTROL_ROOM_MAP_AGENT_NAMES = new Set([
  "Mabel", "Rufus", "Pippa", "Gus", "Vera", "Orion", "June", "Leon",
  "Tessa", "Arlo", "Nell", "Sam", "Miriam", "Dottie", "Kit", "Benny"
]);
const CONTROL_ROOM_PROFILE_ALIASES: Record<string, string> = { Ada: "Ada Rowe", Theo: "Theo Maren", Cora: "Cora Bellamy" };
const controlRoomProfileName = (agent: string) => CONTROL_ROOM_PROFILE_ALIASES[agent] ?? agent;

type ResearchSource = { title: string; url: string };
type RedTeamImprovementResearchInput = {
  apiKey: string;
  agent: string;
  reviewer: RedTeamReviewer;
  question: string;
  projectContext: string;
};
type RedTeamImprovementResearchResult = { answer: string; sources: ResearchSource[] };

// Presentation voices are intentionally distinct from source-language audio.
// This shared direction keeps their staged replies brisk and conversational
// without flattening each persona's individual delivery instructions.
export const CONTROL_ROOM_PRESENTATION_SPEECH_SPEED = 1.15;
export const CONTROL_ROOM_PRESENTATION_SPEECH_STYLE = "Speak in connected, natural conversational sentences. Keep pauses purposeful and brief; do not space out words or use a slow, theatrical cadence unless the text itself requires it.";
export const CONTROL_ROOM_BANTER_STYLE = "For this staged cartoon banter, be crisp, dry, and playfully sarcastic. Aim criticism at the creative work, never at a real person; do not use threats, slurs, or abusive language.";

export const CONTROL_ROOM_VOICE_AUDITIONS = [
  { id:"mabel-lily", agent:"Mabel", label:"Composed command", voiceId:"pFZP5JQG7iQjIQuC4Bku", sample:"Let us not confuse enthusiasm with a plan. Bring me the next decision, and make it a useful one." },
  { id:"dottie-laura", agent:"Dottie", label:"Playful bite", voiceId:"FGY2WhTYpPnrIDTdsKH5", sample:"Darling, the casting idea is charming. The evidence for it, however, has yet to arrive." },
  { id:"rufus-callum", agent:"Rufus", label:"Dry trickster", voiceId:"N2lVS1w4EtoT3dr4eOWO", sample:"A bold choice. Let us make sure it is bold on purpose before we call it inspired." },
  { id:"gus-adam", agent:"Gus", label:"Brash confidence", voiceId:"pNInz6obpgDQGcFmaJgB", sample:"I can make the image sing. I cannot make an undecided brief become a masterpiece by staring at it." },
  { id:"vera-bella", agent:"Vera", label:"Cool clarity", voiceId:"hpp4J3VqNfWAUOO0d1Us", sample:"The idea is promising. The evidence is not. Those are different things, despite everyone’s best efforts." },
  { id:"siskel-medraut", agent:"Gene Siskel", label:"Theatrical skeptic", voiceId:"dG7SBJDxDoZkQUrwvqrD", sample:"The scene may survive the cut. The question is whether it earns the audience’s patience first." },
  { id:"leon-jonathan", agent:"Leon", label:"Sophisticated visual poet", voiceId:"PXeRjE4VWrRQnsaBOFBc", sample:"The frame has the right light, but not yet the right reason. Let us give the audience something worth looking at." },
  { id:"pippa-emily", agent:"Pippa", label:"Imaginative planner", voiceId:"HBDoL4wkcalemIO0nUAu", sample:"The plan is workable. The shortcut is charming, of course, right up until it costs us the afternoon." },
  { id:"tessa-lyra", agent:"Tessa", label:"Warm kinetic guide", voiceId:"Ehc9dVwDGENWbpsWNTfK", sample:"The movement is nearly there. Now let us make it look inevitable instead of merely enthusiastic." },
  { id:"sam-ziggy", agent:"Sam", label:"Quirky sound spark", voiceId:"fjgAVa6FpNYGo4UpjqML", sample:"The mix has personality. It is currently the personality of a kitchen drawer falling down the stairs." },
  { id:"arlo-chris", agent:"Arlo", label:"Grounded practical edge", voiceId:"covt56Pq4PKC04N30BVZ", sample:"The shot can work. The laws of gravity would simply appreciate a quick invitation to the meeting." }
] as const;

export function responseOutputText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const record = response as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string") return record.output_text.trim();
  if (!Array.isArray(record.output)) return "";
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
}

export function responseResearchSources(response: unknown): ResearchSource[] {
  if (!response || typeof response !== "object") return [];
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return [];
  const sources: ResearchSource[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const actionSources = (item as { action?: { sources?: unknown } }).action?.sources;
    if (!Array.isArray(actionSources)) continue;
    for (const source of actionSources) {
      if (!source || typeof source !== "object") continue;
      const { title, url } = source as { title?: unknown; url?: unknown };
      if (typeof url === "string" && url.startsWith("https://")) sources.push({ title: typeof title === "string" ? title : "Source", url });
    }
  }
  return sources.filter((source, index, all) => all.findIndex(candidate => candidate.url === source.url) === index).slice(0, 3);
}

export function sanitizeResearchSpeech(text: string): string {
  const withoutLinks = text
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutLinks.split(" ").slice(0, 55).join(" ");
}

export function redTeamImprovementResearchInstructions(input: RedTeamImprovementResearchInput): string {
  return `You are ${input.agent}, the presentation-only HeartWord Red Team reviewer for ${input.reviewer}. Your specialist scope and a deliberately bounded saved project audit follow. Answer only this improvement question: ${input.question}\n\n${input.projectContext}\n\nUse web search for current, external recommendations that fit this reviewer's scope. Prioritize primary, authoritative sources such as original research, recognized standards bodies, or official guidance; do not rely on blogs when a primary source is available. Return a concise answer of at most 90 words with two labelled parts: "Project-derived observations" (one sentence, based only on the saved audit) and "External, current recommendations" (one or two practical bullets, based on web research). Do not invent project facts, sources, or citations. Do not include URLs or citation markup in the answer: verified source links are displayed separately. This is presentation-only advice; do not claim to control HeartWord, change data, dispatch work, approve work, or override the producer.`;
}

export async function researchRedTeamImprovements(input: RedTeamImprovementResearchInput, request: typeof fetch = fetch): Promise<RedTeamImprovementResearchResult> {
  const research = await request("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{ Authorization:`Bearer ${input.apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      model:"gpt-5.4-nano",
      store:false,
      tools:[{ type:"web_search", search_context_size:"low" }],
      include:["web_search_call.action.sources"],
      instructions:redTeamImprovementResearchInstructions(input),
      input:input.question
    })
  });
  if (!research.ok) throw new Error(`research failed (${research.status})`);
  const researchBody = await research.json();
  const answer = responseOutputText(researchBody);
  const sources = responseResearchSources(researchBody);
  if (!answer || !sources.length) throw new Error("research returned no attributable recommendation");
  if (!/project-derived observations/i.test(answer) || !/external,? current recommendations/i.test(answer)) {
    throw new Error("research did not distinguish project and external recommendations");
  }
  return { answer, sources };
}

async function renderOpenAIPresentationSpeech(voice: string, instructions: string, text: string): Promise<Response> {
  return fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST",
    headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      model:"gpt-4o-mini-tts",
      voice,
      input:text,
      instructions:`${instructions} ${CONTROL_ROOM_PRESENTATION_SPEECH_STYLE}`,
      speed:CONTROL_ROOM_PRESENTATION_SPEECH_SPEED,
      response_format:"mp3"
    })
  });
}

async function renderElevenLabsPresentationSpeech(voiceId: string, text: string): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs is not configured for voice auditions.");
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method:"POST",
    headers:{ "xi-api-key":apiKey, "Content-Type":"application/json", Accept:"audio/mpeg" },
    body:JSON.stringify({
      model_id:"eleven_multilingual_v2",
      text,
      voice_settings:{ stability:0.42, similarity_boost:0.72, style:0.58, use_speaker_boost:true }
    })
  });
}

async function renderPresentationSpeech(provider: string, voice: string, instructions: string, text: string): Promise<Response> {
  if (provider === "elevenlabs") return renderElevenLabsPresentationSpeech(voice, text);
  return renderOpenAIPresentationSpeech(voice, instructions, text);
}

// A fixed, presentation-only audition palette.  It never updates the saved
// cast, and does not accept a caller-supplied voice ID or text.
controlRoomRouter.get("/voice-auditions", (_req, res) => {
  res.json({ auditions: CONTROL_ROOM_VOICE_AUDITIONS.map(({ id, agent, label }) => ({ id, agent, label })) });
});

// Proposed role descriptions only. They are read-only presentation context,
// not agent permissions, production state, or a task-dispatch surface.
controlRoomRouter.get("/responsibilities/:agent", (req, res) => {
  const profile = proposedResponsibilitiesFor(req.params.agent);
  if (!profile) { res.status(404).json({ error:"No proposed responsibility profile is available." }); return; }
  res.json({ ...profile, proposed:true });
});

controlRoomRouter.get("/red-team-findings/:reviewer", (req, res) => {
  const reviewer = redTeamReviewerForAgent(req.params.reviewer);
  if (!reviewer) { res.status(404).json({ error:"No Red Team reviewer is available." }); return; }
  res.json({ reviewer, presentationOnly:true, findings:redTeamFindingsFor(getDb(), reviewer) });
});

controlRoomRouter.post("/voice-auditions/:id", async (req, res) => {
  const audition = CONTROL_ROOM_VOICE_AUDITIONS.find(candidate => candidate.id === req.params.id);
  if (!audition) { res.status(404).json({ error:"That voice audition is unavailable." }); return; }
  try {
    const speech = await renderElevenLabsPresentationSpeech(audition.voiceId, audition.sample);
    if (!speech.ok) throw new Error("audition render failed");
    res.type("audio/mpeg").send(Buffer.from(await speech.arrayBuffer()));
  } catch {
    res.status(502).json({ error:"The voice audition could not be rendered." });
  }
});

// A deliberately narrow, pre-rendered demonstration line. It is not a
// production asset and the endpoint accepts no speaker or file parameter.
controlRoomRouter.get("/staged-replies/mabel-how-are-you", (_req, res) => {
  const path = join(getDataDir(), "exports", "control-room-voice-auditions", "mabel-how-are-you.mp3");
  if (!existsSync(path)) { res.status(404).json({ error: "The staged Mabel reply has not been rendered." }); return; }
  res.type("audio/mpeg").send(readFileSync(path));
});

controlRoomRouter.post("/purpose-reply", async (req, res) => {
  const agent = typeof req.body?.agent === "string" ? req.body.agent.trim() : "";
  const profile = getDb().prepare("SELECT voice_provider, voice_id, delivery_instructions FROM control_room_voice_profiles WHERE agent_name = ?").get(controlRoomProfileName(agent)) as { voice_provider?: string; voice_id?: string; delivery_instructions?: string } | undefined;
  const line = getDb().prepare(`SELECT l.text FROM control_room_presentation_lines l JOIN control_room_presentation_items i ON i.id=l.item_id WHERE i.kind='utterance' AND l.speaker_name=? ORDER BY RANDOM() LIMIT 1`).get(agent) as { text?: string } | undefined;
  if (!profile?.voice_id || !profile.delivery_instructions || !line?.text) { res.status(404).json({ error: "No staged purpose reply is available." }); return; }
  try {
    const response = await renderPresentationSpeech(profile.voice_provider ?? "openai", profile.voice_id, profile.delivery_instructions, line.text);
    if (!response.ok) throw new Error();
    res.type("audio/mpeg").send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(502).json({ error:"The staged voice reply could not be rendered." }); }
});

// Returns one approved, random two-person exchange involving the addressed
// agent. It reads only the private presentation library; it cannot inspect or
// describe live production status.
controlRoomRouter.post("/issue-exchange", (req, res) => {
  const agent = typeof req.body?.agent === "string" ? req.body.agent.trim() : "";
  if (!agent) { res.status(400).json({ error:"An addressed agent is required." }); return; }
  const candidates = getDb().prepare(`
    SELECT id, category, cue, agents_json
    FROM control_room_presentation_items
    WHERE kind='exchange'
      AND presentation_only=1
      AND json_array_length(agents_json)=2
      AND agents_json LIKE ?
    ORDER BY RANDOM()
  `).all(`%"${agent.replace(/"/g, "")}"%`) as { id?: string; category?: string; cue?: string; agents_json?: string }[];
  const selected = candidates.map(candidate => {
    try { return { item:candidate, people:JSON.parse(candidate.agents_json || "[]") as string[] }; }
    catch { return { item:candidate, people:[] as string[] }; }
  }).find(candidate => candidate.item.id && candidate.people.length === 2 && candidate.people.includes(agent) && candidate.people.every(name => CONTROL_ROOM_MAP_AGENT_NAMES.has(name)));
  const itemId = selected?.item.id;
  if (!itemId) { res.status(404).json({ error:"No staged two-person exchange is available for that agent." }); return; }
  const { item, people } = selected;
  const lines = getDb().prepare(`
    SELECT speaker_name, text
    FROM control_room_presentation_lines
    WHERE item_id=?
    ORDER BY line_number
  `).all(itemId) as { speaker_name: string; text: string }[];
  if (!lines.length) { res.status(404).json({ error:"The selected staged exchange has no lines." }); return; }
  res.json({
    people,
    title: `Presentation exchange — ${people.join(" and ")}`,
    detail: item.cue || item.category || "Random staged banter",
    lines: lines.map(line => [line.speaker_name, line.text])
  });
});

// Renders one fixed, on-screen presentation-exchange line. The browser only
// supplies the displayed staged text; this endpoint cannot dispatch work,
// save dialogue, or access production records.
controlRoomRouter.post("/presentation-speech", async (req, res) => {
  const agent = typeof req.body?.agent === "string" ? req.body.agent.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim().replace(/\s+/g, " ") : "";
  if (!agent || !text || text.length > 500) { res.status(400).json({ error:"An agent and a short staged line are required." }); return; }
  const profile = getDb().prepare("SELECT voice_provider, voice_id, delivery_instructions FROM control_room_voice_profiles WHERE agent_name = ? AND presentation_only = 1").get(controlRoomProfileName(agent)) as { voice_provider?: string; voice_id?: string; delivery_instructions?: string } | undefined;
  if (!profile?.voice_id || !profile.delivery_instructions) { res.status(404).json({ error:"No presentation voice is available for that agent." }); return; }
  try {
    const response = await renderPresentationSpeech(profile.voice_provider ?? "openai", profile.voice_id, `${profile.delivery_instructions} ${CONTROL_ROOM_BANTER_STYLE}`, text);
    if (!response.ok) throw new Error();
    res.type("audio/mpeg").send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(502).json({ error:"The staged exchange voice could not be rendered." }); }
});

// A presentation-only fallback for producer questions not covered by saved
// banter or purpose statements. It uses only a small read-only presentation
// brief when one exists; it never receives production records or writes them.
controlRoomRouter.post("/live-research-reply", async (req, res) => {
  const agent = typeof req.body?.agent === "string" ? req.body.agent.trim() : "";
  const question = typeof req.body?.question === "string" ? req.body.question.trim().replace(/\s+/g, " ") : "";
  if (!agent || !question || question.length > 500) { res.status(400).json({ error:"An agent and a short question are required." }); return; }
  const profileAgent = controlRoomProfileName(agent);
  const redTeamResponse = redTeamResponseModeFor(agent, question);
  if (redTeamResponse) {
    const db = getDb();
    const profile = db.prepare("SELECT voice_provider, voice_id, delivery_instructions FROM control_room_voice_profiles WHERE agent_name = ? AND presentation_only = 1").get(profileAgent) as { voice_provider?: string; voice_id?: string; delivery_instructions?: string } | undefined;
    if (!profile?.voice_id || !profile.delivery_instructions) { res.status(404).json({ error:"No Red Team presentation voice is available." }); return; }
    const voiceProvider = profile.voice_provider ?? "openai";
    const voiceId = profile.voice_id;
    const deliveryInstructions = profile.delivery_instructions;
    const sendRedTeamAnswer = async (answer: string, sources: ResearchSource[] = [], mode = "local-audit", spokenAnswer = answer) => {
      const speech = await renderPresentationSpeech(voiceProvider, voiceId, deliveryInstructions, spokenAnswer);
      if (!speech.ok) throw new Error("speech failed");
      res.setHeader("X-Control-Room-Red-Team-Answer", Buffer.from(answer, "utf8").toString("base64url"));
      res.setHeader("X-Control-Room-Red-Team-Mode", mode);
      if (sources.length) res.setHeader("X-Control-Room-Research-Sources", Buffer.from(JSON.stringify(sources)).toString("base64url"));
      res.type("audio/mpeg").send(Buffer.from(await speech.arrayBuffer()));
    };
    if (redTeamResponse.mode === "local_audit") {
      try { await sendRedTeamAnswer(redTeamReviewResponse(db, redTeamResponse.reviewer, "what_went_wrong")); }
      catch { res.status(502).json({ error:"The Red Team review could not be spoken." }); }
      return;
    }
    const fallback = redTeamImprovementFallback(db, redTeamResponse.reviewer);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      try { await sendRedTeamAnswer(fallback, [], "local-fallback"); }
      catch { res.status(502).json({ error:"The Red Team improvement fallback could not be spoken." }); }
      return;
    }
    try {
      const researched = await researchRedTeamImprovements({
        apiKey,
        agent,
        reviewer:redTeamResponse.reviewer,
        question,
        projectContext:redTeamImprovementResearchBrief(db, redTeamResponse.reviewer)
      });
      await sendRedTeamAnswer(researched.answer, researched.sources, "external-research", sanitizeResearchSpeech(researched.answer));
    } catch {
      try { await sendRedTeamAnswer(fallback, [], "local-fallback"); }
      catch { res.status(502).json({ error:"The Red Team improvement fallback could not be spoken." }); }
    }
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error:"OpenAI is not configured for live research." }); return; }
  const profile = getDb().prepare("SELECT role, voice_provider, voice_id, delivery_instructions FROM control_room_voice_profiles WHERE agent_name = ? AND presentation_only = 1").get(profileAgent) as { role?: string; voice_provider?: string; voice_id?: string; delivery_instructions?: string } | undefined;
  if (!profile?.role || !profile.voice_id || !profile.delivery_instructions) { res.status(404).json({ error:"No presentation profile is available for that agent." }); return; }
  const brief = getDb().prepare("SELECT context FROM control_room_presentation_briefs WHERE agent_name = ? AND presentation_only = 1 ORDER BY updated_at DESC LIMIT 1").get(agent) as { context?: string } | undefined;
  const projectContext = brief?.context ? `Read-only HeartWord presentation snapshot: ${brief.context}` : "No agent-specific project snapshot is available. Do not invent private project facts or status.";
  try {
    const research = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body:JSON.stringify({
        model:"gpt-5.4-nano",
        store:false,
        tools:[{ type:"web_search", search_context_size:"low" }],
        include:["web_search_call.action.sources"],
        instructions:`You are ${agent}, a presentation-only ${profile.role} in a private HeartWord control room. Before answering, silently keep only questions reasonably connected to HeartWord, its production context, agent roles, or filmmaking choices for this project; briefly redirect unrelated requests to that scope. Reply in one warm, concise paragraph of at most 55 words. Never say or spell URLs, domains, source titles, citations, or technical links. Use web search only for helpful current public facts, never as evidence of private HeartWord status. Use this snapshot only as read-only context: ${projectContext} Do not claim to control HeartWord, alter data, dispatch work, approve work, or report invented project status. State uncertainty when appropriate.`,
        input:question
      })
    });
    if (!research.ok) throw new Error(`research failed (${research.status})`);
    const researchBody = await research.json();
    const text = sanitizeResearchSpeech(responseOutputText(researchBody));
    if (!text) throw new Error("research returned no text");
    const speech = await renderPresentationSpeech(profile.voice_provider ?? "openai", profile.voice_id, profile.delivery_instructions, text);
    if (!speech.ok) throw new Error("speech failed");
    const sources = responseResearchSources(researchBody);
    res.setHeader("X-Control-Room-Research-Sources", Buffer.from(JSON.stringify(sources)).toString("base64url"));
    res.type("audio/mpeg").send(Buffer.from(await speech.arrayBuffer()));
  } catch {
    res.status(502).json({ error:"The live research reply could not be completed." });
  }
});

// This endpoint only brokers a browser WebRTC offer to OpenAI. It never
// receives, stores, or forwards transcripts into the HeartWord pipeline.
controlRoomRouter.post("/realtime-call", async (req, res) => {
  const sdp = req.body?.sdp;
  if (typeof sdp !== "string" || !sdp.trim() || sdp.length > 200_000) {
    res.status(400).json({ error: "A valid browser audio offer is required." }); return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OpenAI is not configured for the presentation listener." }); return;
  }
  try {
    // The WebRTC calls endpoint expects multipart fields: raw SDP plus the
    // session configuration. JSON is intentionally not accepted by OpenAI.
    const form = new FormData();
    // These are form values, not uploaded files. Keeping them filename-free
    // matches the API's `-F "sdp=<offer.sdp"` request shape.
    form.append("sdp", sdp);
    form.append("session", JSON.stringify(createControlRoomRealtimeSession()));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
    const body = await response.text();
    if (!response.ok) {
      console.warn(`Control-room presentation listener handshake rejected (${response.status}): ${body.slice(0, 600)}`);
      res.status(502).json({ error: "The presentation listener could not start." }); return;
    }
    res.type("application/sdp").send(body);
  } catch {
    console.warn("Control-room presentation listener could not reach OpenAI.");
    res.status(502).json({ error: "The presentation listener could not reach OpenAI." });
  }
});
