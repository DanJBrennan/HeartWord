import { randomUUID } from "node:crypto";
import { observeWork } from "../observed-work.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { GeminiMusicProvider, ElevenLabsEffectsProvider, type SoundtrackProvider } from "../../providers/soundtrack.js";
import { generateJsonWithImages, generateJsonWithImagesMetered, GEMINI_TEXT_MODEL } from "../../providers/gemini-text.js";
import type { GenerationResult } from "../../providers/types.js";
import { crewBriefHash, digest, loadCrewBrief, productionAssetPath } from "../creative-direction/crew-context.js";
import { latestCrewRun } from "../creative-direction/crew-store.js";
import type { CrewBrief, CrewResult } from "../creative-direction/crew-types.js";
import { mediaDurationMs } from "./finishing.js";

export interface SoundtrackReview { matchesBrief: boolean; speechDetected: boolean; intelligibleSpeech: boolean; technicalPass: boolean; confidence: number; reason: string }
const SOUNDTRACK_REVIEW_SCHEMA = {
  type: "object", properties: { matchesBrief: { type: "boolean" }, speechDetected: { type: "boolean" }, intelligibleSpeech: { type: "boolean" }, technicalPass: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } },
  required: ["matchesBrief", "speechDetected", "intelligibleSpeech", "technicalPass", "confidence", "reason"]
};
function soundtrackReviewPassed(verdict: SoundtrackReview) {
  return verdict.matchesBrief === true && verdict.speechDetected === false && verdict.intelligibleSpeech === false && verdict.technicalPass === true &&
    Number.isFinite(verdict.confidence) && verdict.confidence >= 80 && verdict.confidence <= 100 && typeof verdict.reason === "string" && Boolean(verdict.reason.trim());
}

export interface NativeAmbienceReview extends SoundtrackReview {}
export function nativeAmbiencePassed(verdict: NativeAmbienceReview) {
  return verdict?.speechDetected === false && soundtrackReviewPassed(verdict);
}
export async function reviewNativeAmbience(path: string, direction: string): Promise<{ verdict: NativeAmbienceReview; costUsd: number }> {
  const { result, costUsd } = await generateJsonWithImagesMetered<NativeAmbienceReview>(
    `Listen to the entire native scene audio independently. Approved scene direction: ${direction}. ` +
    "Only environmental ambience is allowed. Detect ANY spoken human or synthetic voice, including quiet background speech, unintelligible dialogue, gibberish, narration, lyrics or singing; set speechDetected=true even if you cannot understand the language. " +
    "Check that environmental sounds fit the scene without inventing an event, contain no score/music, and have no objectionable artifacts. " +
    "Silence is not useful ambience. If voices cannot be ruled out, return low confidence and do not approve. This audio must never replace the approved Scripture/cast recording.",
    [{ mimeType: "audio/wav", data: readFileSync(path).toString("base64") }],
    SOUNDTRACK_REVIEW_SCHEMA
  );
  return { verdict: result, costUsd };
}

export interface NativeAmbienceResult { status: "accepted" | "held" | "unavailable"; reason: string; assetId?: string; metadataPath?: string; costUsd?: number; verdict?: NativeAmbienceReview }
/** Reuse approved SFX assets and the existing mixer; never unmute raw video
 * or create a synthetic finishing run just to admit native ambience. */
export async function registerVideoAmbience(db: DatabaseSync, projectId: string, attemptId: string, generated: GenerationResult, options: {
  dataDir?: string; review?: typeof reviewNativeAmbience; duration?: (path: string) => number;
} = {}): Promise<NativeAmbienceResult> {
  if (!generated.ambientAudio) return { status: "unavailable", reason: "This take has no retained native ambience." };
  const source = db.prepare(`SELECT ga.shot_id,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE ga.id=? AND sc.project_id=?`).get(attemptId, projectId) as { shot_id: string; result_asset_path: string | null } | undefined;
  if (!source || source.result_asset_path !== generated.media?.path) throw new Error("Native ambience must belong to this project's retained video attempt.");
  const dataDir = options.dataDir ?? getDataDir(), path = generated.ambientAudio.path;
  const absolute = productionAssetPath(dataDir, path), noteId = `video-ambience:${attemptId}`;
  const metadataPath = `${path}.${encodeURIComponent(attemptId)}.review.json`;
  const claimed = db.prepare("INSERT OR IGNORE INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(noteId, projectId, source.shot_id, "Native ambience listening review is in progress; do not mix this audio yet.", Date.now());
  if (!claimed.changes) {
    const prior = db.prepare("SELECT note FROM review_notes WHERE id=?").get(noteId) as { note: string };
    const asset = db.prepare("SELECT path,sha256 FROM production_audio_assets WHERE id=? AND project_id=?").get(noteId, projectId) as { path: string; sha256: string } | undefined;
    if (asset && (asset.path !== path || digest(readFileSync(absolute)) !== asset.sha256)) throw new Error("Previously approved native ambience changed.");
    return { status: asset ? "accepted" : "held", reason: prior.note, ...(asset ? { assetId: noteId } : {}), metadataPath };
  }
  let outcome: NativeAmbienceResult = { status: "held", reason: "Native ambience review unavailable.", metadataPath };
  let sha256: string | undefined, durationMs: number | undefined;
  const save = () => {
    const destination = productionAssetPath(dataDir, metadataPath); mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify({ ...outcome, sourceVideoAttemptId: attemptId, sourceVideoPath: generated.media!.path, sourceAudioPath: path, sha256, durationMs,
      provider: generated.provenance.provider, model: generated.provenance.model, prompt: generated.provenance.prompt, reviewProvider: "gemini", reviewModel: GEMINI_TEXT_MODEL }, null, 2));
  };
  try {
    sha256 = digest(readFileSync(absolute)); durationMs = (options.duration ?? mediaDurationMs)(absolute);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Native ambience has no positive measured duration.");
    const review = await (options.review ?? reviewNativeAmbience)(absolute, generated.provenance.prompt);
    if (!Number.isFinite(review.costUsd) || review.costUsd < 0) throw new Error("Native ambience listening review returned an invalid cost.");
    outcome.verdict = review.verdict; outcome.costUsd = review.costUsd;
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, attemptId, review.costUsd, Date.now());
    if (digest(readFileSync(absolute)) !== sha256) throw new Error("Native ambience changed during its listening review.");
    outcome.reason = typeof review.verdict?.reason === "string" && review.verdict.reason.trim() ? review.verdict.reason : "Native ambience review did not pass.";
    if (nativeAmbiencePassed(review.verdict)) {
      outcome.status = "accepted"; outcome.assetId = noteId; save();
      db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES (?,?,'sfx',?,?,?,?,?)")
        .run(noteId, projectId, `LTX environmental ambience from shot ${source.shot_id}, video attempt ${attemptId}. Speech-free listening review: ${outcome.reason}`, path, sha256, durationMs, Date.now());
    }
  } catch (error) {
    outcome.status = "held"; delete outcome.assetId; outcome.reason = (error as Error).message;
  }
  try { save(); } catch { /* The durable QC note still records the outcome. */ }
  db.prepare("UPDATE review_notes SET note=? WHERE id=?").run(`Native ambience ${outcome.status}: ${outcome.reason}. Retained audio: ${path}. Listening evidence: ${metadataPath}.`, noteId);
  return outcome;
}
interface SoundtrackOptions {
  db?: DatabaseSync; dataDir?: string; brief?: CrewBrief;
  music?: SoundtrackProvider; effects?: SoundtrackProvider;
  review?: (prompt: string, mimeType: string, bytes: Buffer) => Promise<SoundtrackReview>;
  duration?: (path: string) => number;
}
export async function generateRequestedSoundtrack(projectId: string, runId: string, options: SoundtrackOptions = {}): Promise<{ accepted: number; failures: string[] }> {
  return observeWork(projectId, "qc", () => generateRequestedSoundtrackImpl(projectId, runId, options), runId);
}
async function generateRequestedSoundtrackImpl(projectId: string, runId: string, options: SoundtrackOptions): Promise<{ accepted: number; failures: string[] }> {
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
  const review = options.review ?? ((prompt, mimeType, bytes) => generateJsonWithImages<SoundtrackReview>(prompt, [{ mimeType, data: bytes.toString("base64") }], SOUNDTRACK_REVIEW_SCHEMA));
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
        "Check audible artifacts, fit to requested mood, development/crescendo, instruments or concrete effect. Detect ANY speech, including unintelligible dialogue, gibberish voices, narration, lyrics or singing: speechDetected=true even when no words are understood. " +
        "Do not assert native-cultural authenticity you cannot verify. Return false or low confidence when uncertain; this recording must not replace Scripture.", generated.mimeType, generated.bytes);
      const pass = soundtrackReviewPassed(verdict);
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
