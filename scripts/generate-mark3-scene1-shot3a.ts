/** Generate the approved, non-speaking 0–2 s setup for Mark 3 Scene 1 Shot 3. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50";
const BEAT_ID = "37150f5d-59a3-418d-8093-20efc36f3cac";
const MARKER = `Shot 3A coverage beat ${BEAT_ID}`;

function probe(path: string): { duration: number; width: number; height: number } {
  const json = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", path], { encoding: "utf8" })) as {
    format?: { duration?: string }; streams?: Array<{ width?: number; height?: number }>;
  };
  const duration = Number(json.format?.duration);
  const width = json.streams?.[0]?.width ?? 0;
  const height = json.streams?.[0]?.height ?? 0;
  if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error("Generated 3A video has invalid media metadata.");
  return { duration, width, height };
}

async function main() {
  const db = getDb(), dataDir = getDataDir();
  const beat = db.prepare(`SELECT cb.audio_start_ms,cb.audio_end_ms,cb.needs_lip_sync,cb.status,cb.keyframe_asset_path,
      sh.action,sh.coverage_plan
    FROM coverage_beats cb JOIN shots sh ON sh.id=cb.shot_id
    JOIN scenes sc ON sc.id=sh.scene_id AND sc.project_id=?
    WHERE cb.id=? AND cb.shot_id=?`).get(PROJECT_ID, BEAT_ID, SHOT_ID) as {
      audio_start_ms: number; audio_end_ms: number; needs_lip_sync: number; status: string;
      keyframe_asset_path: string; action: string; coverage_plan: string;
    } | undefined;
  if (!beat || beat.status !== "accepted" || beat.needs_lip_sync !== 0 || beat.audio_start_ms !== 0 || beat.audio_end_ms !== 2000 || beat.coverage_plan !== "covered_sequence") {
    throw new Error("The approved silent 3A coverage plan has changed; inspect before generating.");
  }
  const acceptedKeyframe = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate'
    AND status='accepted' AND result_asset_path=? LIMIT 1`).get(SHOT_ID, beat.keyframe_asset_path);
  if (!acceptedKeyframe || !existsSync(join(dataDir, "assets", beat.keyframe_asset_path))) throw new Error("Approved 3A keyframe is missing.");
  const existing = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(SHOT_ID, `${MARKER}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (existing) throw new Error(`3A already has attempt ${existing.id} (${existing.status}, ${existing.result_asset_path ?? "pending"}); reconcile it before another paid request.`);
  const overlap = db.prepare("SELECT id FROM clips WHERE shot_id=? AND timeline_start_ms<? AND timeline_end_ms>?").get(SHOT_ID, 2000, 0);
  if (overlap) throw new Error("3A's interval already has a selected clip.");

  const prompt = `${MARKER}. Animate only the first two seconds of the approved synagogue setup in Mark 3:3.
Hold the exact approved composition, Papuan/Hatam faces and clothing, readable warm light, dark basalt room scale, and positions: Jesus at left faces the man with the withered left hand at right; seated observers remain in the background. Jesus keeps his mouth closed and his already-extended hand steady, with only natural breath, a slight shift of attention, and restrained independent movement among the seated observers. The man stays attentive with his affected hand still contracted. No one speaks on camera, mouths words, enters, exits, rises, crosses the room, starts the healing, or changes costume or identity. No subtitles or text. Keep the camera steady and the staging natural, not a portrait. Background ambience only: do not invent English or any other intelligible speech, singing, narration, or a music cue. The approved Hatam speech will be laid under this picture separately; this generated audio will not be used.`;
  const attemptId = randomUUID(), now = Date.now();
  // Retain an evidence row before the paid call. The unique request label also
  // makes a completed but interrupted Veo download discoverable on disk.
  db.prepare(`INSERT INTO generation_attempts
    (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','generate_coverage_base','720p',?,'hold_for_review',NULL,0,?)`)
    .run(attemptId, SHOT_ID, prompt, now);
  console.log(JSON.stringify({ attemptId, requestLabel: `mark3-scene1-shot3a-${attemptId}`, state: "submitted_or_pending" }));
  const result = await generateFinalVideoWithFallback(
    new GeminiVideoProvider(), new KlingVideoProvider(), new GeminiDraftVideoProvider(),
    { shotId: `mark3-scene1-shot3a-${attemptId}`, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: beat.keyframe_asset_path }, durationSeconds: 4, tier: "economy" }
  );
  if (!result.media?.path) throw new Error("Provider returned no retained 3A video; pending attempt needs reconciliation.");
  const source = join(dataDir, "assets", result.media.path);
  if (!existsSync(source)) throw new Error("Provider reported 3A media that is absent from disk.");
  const meta = probe(source);
  const usable = meta.duration >= 2 && meta.width >= 1280 && meta.height >= 720 && result.tier !== "omni_draft";
  const previewRel = join("generated", "video", "review", `mark3-scene1-shot3a-${attemptId}-2s-muted.mp4`);
  const preview = join(dataDir, "assets", previewRel);
  mkdirSync(join(dataDir, "assets", "generated", "video", "review"), { recursive: true });
  if (meta.duration >= 2) {
    execFileSync("ffmpeg", ["-v", "error", "-n", "-i", source, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24", "-frames:v", "48", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", preview], { stdio: "pipe" });
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,prompt=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, `${prompt}\n\nProvider tier: ${result.tier}; Veo attempts: ${result.veoAttempts}; measured output: ${meta.duration.toFixed(3)}s, ${meta.width}x${meta.height}.`, result.media.path, result.cost.usd, attemptId);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `${MARKER}: candidate ${attemptId} retained, ${meta.duration.toFixed(3)}s at ${meta.width}x${meta.height}; ${usable ? "2-second muted review clip ready" : "not suitable for 720p 2-second selection"}. Producer review required; no clip selected.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, tier: result.tier, resultAssetPath: result.media.path, durationSeconds: meta.duration, resolution: `${meta.width}x${meta.height}`, costUsdEstimate: result.cost.usd, suitableForReview: usable, preview: usable ? preview : null }));
}

main().catch(error => { console.error("FAILED:", error); process.exitCode = 1; });
