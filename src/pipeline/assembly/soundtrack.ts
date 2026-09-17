import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { GeminiMusicProvider, ElevenLabsEffectsProvider, type SoundtrackProvider } from "../../providers/soundtrack.js";
import { generateJsonWithImages } from "../../providers/gemini-text.js";
import { crewBriefHash, digest, loadCrewBrief, productionAssetPath } from "../creative-direction/crew-context.js";
import { latestCrewRun } from "../creative-direction/crew-store.js";
import type { CrewBrief, CrewResult } from "../creative-direction/crew-types.js";
import { mediaDurationMs } from "./finishing.js";

export interface SoundtrackReview { matchesBrief: boolean; intelligibleSpeech: boolean; technicalPass: boolean; confidence: number; reason: string }
export async function generateRequestedSoundtrack(projectId: string, runId: string, options: {
  db?: DatabaseSync; dataDir?: string; brief?: CrewBrief;
  music?: SoundtrackProvider; effects?: SoundtrackProvider;
  review?: (prompt: string, mimeType: string, bytes: Buffer) => Promise<SoundtrackReview>;
  duration?: (path: string) => number;
} = {}): Promise<{ accepted: number; failures: string[] }> {
  const db = options.db ?? getDb(), dataDir = options.dataDir ?? getDataDir();
  const run = latestCrewRun(db, projectId, "finishing");
  if (!run || run.id !== runId || run.status !== "awaiting_assets") throw new Error("A current Director-approved soundtrack request is required.");
  // Our own reviewed assets are the expected result of this run, not a
  // change to its source brief. Exclude only those assets when resuming.
  const assertCurrent = () => {
    const brief = options.brief ?? loadCrewBrief(db, dataDir, projectId, "finishing");
    const produced = new Set((db.prepare("SELECT id FROM soundtrack_attempts WHERE run_id=? AND status='accepted'").all(runId) as Array<{ id: string }>).map(a => a.id));
    const comparable = { ...brief, audioAssets: brief.audioAssets.filter(a => !produced.has(a.id)) };
    if (latestCrewRun(db, projectId, "finishing")?.id !== runId || crewBriefHash(comparable, "finishing") !== run.brief_hash) throw new Error("Soundtrack request is stale; review the current cut first.");
  };
  assertCurrent();
  const result = JSON.parse(run.result_json!) as CrewResult;
  const requests = (["composer", "sound_designer"] as const).flatMap(role =>
    (result.contributions[role]?.generationRequests ?? []).map((request, index) => ({ role, request, key: `${runId}:${role}:${index}` })));
  if (requests.length > 8) throw new Error("This run requests more than eight audio generations. Refine the cue plan before spending.");
  const review = options.review ?? ((prompt, mimeType, bytes) => generateJsonWithImages<SoundtrackReview>(prompt, [{ mimeType, data: bytes.toString("base64") }], {
    type: "object", properties: { matchesBrief: { type: "boolean" }, intelligibleSpeech: { type: "boolean" }, technicalPass: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } },
    required: ["matchesBrief", "intelligibleSpeech", "technicalPass", "confidence", "reason"]
  }));
  let accepted = 0;
  const failures: string[] = [];
  for (const item of requests) {
    assertCurrent();
    const previous = db.prepare("SELECT status FROM soundtrack_attempts WHERE request_key = ?").get(item.key) as { status: string } | undefined;
    if (previous) {
      if (previous.status === "accepted") accepted++;
      else failures.push(`${item.role}: previous attempt is ${previous.status}; revise the request before another paid attempt.`);
      continue;
    }
    const id = randomUUID(), kind = item.role === "composer" ? "music" : "sfx";
    db.prepare("INSERT INTO soundtrack_attempts (id,project_id,run_id,request_key,kind,request_json,status,created_at) VALUES (?,?,?,?,?,?,'generating',?)")
      .run(id, projectId, runId, item.key, kind, JSON.stringify(item.request), Date.now());
    try {
      const provider = kind === "music" ? options.music ?? new GeminiMusicProvider() : options.effects ?? new ElevenLabsEffectsProvider();
      const generated = await provider.generate({ kind, prompt: item.request.prompt, durationMs: item.request.durationMs, loop: item.request.loop });
      const path = `generated/soundtrack/${projectId}/${id}.${generated.mimeType.includes("wav") ? "wav" : "mp3"}`;
      const absolute = productionAssetPath(dataDir, path); mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, generated.bytes, { flag: "wx" });
      db.prepare("UPDATE soundtrack_attempts SET status='needs_review',provider=?,model=?,path=?,usage_json=? WHERE id=?")
        .run(generated.provider, generated.model, path, JSON.stringify({ usage: generated.usage, requestId: generated.requestId }), id);
      const durationMs = (options.duration ?? mediaDurationMs)(absolute);
      if (durationMs + 50 < item.request.durationMs) throw new Error("Generated audio is shorter than its planned cue; do not stretch or silently loop it.");
      const verdict = await review(`Independently review this generated ${kind} by listening to it. Brief: ${JSON.stringify(item.request)}. ` +
        "Check audible artifacts, fit to requested mood, development/crescendo, instruments or concrete effect, and absence of intelligible speech/lyrics. " +
        "Do not assert native-cultural authenticity you cannot verify. Return false or low confidence when uncertain; this recording must not replace Scripture.", generated.mimeType, generated.bytes);
      const pass = verdict.matchesBrief === true && verdict.intelligibleSpeech === false && verdict.technicalPass === true &&
        Number.isFinite(verdict.confidence) && verdict.confidence >= 80 && verdict.confidence <= 100 && typeof verdict.reason === "string" && verdict.reason.trim();
      if (!pass) {
        db.prepare("UPDATE soundtrack_attempts SET review_json=?,status='held' WHERE id=?").run(JSON.stringify(verdict), id);
        failures.push(`${kind}: ${verdict.reason || "Audio review did not pass."}`); continue;
      }
      assertCurrent();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(id, projectId, kind, `Requested at ${item.request.startMs}ms for ${item.request.durationMs}ms, ${item.request.gainDb}dB. ${item.request.reason} — ${item.request.prompt}`, path, digest(readFileSync(absolute)), durationMs, Date.now());
        db.prepare("UPDATE soundtrack_attempts SET review_json=?,status='accepted' WHERE id=?").run(JSON.stringify(verdict), id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      accepted++;
    } catch (error) {
      db.prepare("UPDATE soundtrack_attempts SET status='incomplete',error=? WHERE id=?").run((error as Error).message, id);
      failures.push(`${kind}: ${(error as Error).message}`);
    }
  }
  return { accepted, failures };
}
