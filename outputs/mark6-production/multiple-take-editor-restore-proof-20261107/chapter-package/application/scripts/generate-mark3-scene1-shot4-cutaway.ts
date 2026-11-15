/** Generate the approved mouth-hidden cutaway during Jesus's Mark 3:4 line. */
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
const SHOT_ID = "0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";
const BEAT_ID = "db85226e-7e42-4183-8e53-3929b0825b89";
const MARKER = `Shot 4 cutaway coverage beat ${BEAT_ID}`;

function probe(path: string): { duration: number; width: number; height: number } {
  const json = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", path], { encoding: "utf8" })) as {
    format?: { duration?: string }; streams?: Array<{ width?: number; height?: number }>;
  };
  const duration = Number(json.format?.duration), width = json.streams?.[0]?.width ?? 0, height = json.streams?.[0]?.height ?? 0;
  if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error("Generated cutaway has invalid media metadata.");
  return { duration, width, height };
}

async function main() {
  const db = getDb(), dataDir = getDataDir();
  const beat = db.prepare(`SELECT cb.audio_start_ms,cb.audio_end_ms,cb.needs_lip_sync,cb.status,cb.keyframe_asset_path,
      ck.status AS keyframe_status,sh.coverage_plan
    FROM coverage_beats cb JOIN shots sh ON sh.id=cb.shot_id
    JOIN scenes sc ON sc.id=sh.scene_id AND sc.project_id=?
    JOIN coverage_keyframe_attempts ck ON ck.coverage_beat_id=cb.id AND ck.result_asset_path=cb.keyframe_asset_path
    WHERE cb.id=? AND cb.shot_id=?`).get(PROJECT_ID, BEAT_ID, SHOT_ID) as {
      audio_start_ms: number; audio_end_ms: number; needs_lip_sync: number; status: string;
      keyframe_asset_path: string; keyframe_status: string; coverage_plan: string;
    } | undefined;
  if (!beat || beat.status !== "accepted" || beat.keyframe_status !== "accepted" || beat.needs_lip_sync !== 0 ||
      beat.audio_start_ms !== 6755 || beat.audio_end_ms !== 10053 || beat.coverage_plan !== "covered_sequence") {
    throw new Error("Approved Shot 4 cutaway plan changed.");
  }
  if (!existsSync(join(dataDir, "assets", beat.keyframe_asset_path))) throw new Error("Approved cutaway still is missing.");
  const existing = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(SHOT_ID, `${MARKER}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (existing) throw new Error(`Cutaway already has attempt ${existing.id} (${existing.status}, ${existing.result_asset_path ?? "pending"}); reconcile before another paid request.`);
  if (db.prepare("SELECT id FROM clips WHERE shot_id=? AND timeline_start_ms<? AND timeline_end_ms>?").get(SHOT_ID, 10053, 6755)) {
    throw new Error("Cutaway interval already has a selected clip.");
  }

  const prompt = `${MARKER}. Animate exactly the approved Mark 3:4 over-the-shoulder composition in the same dark-basalt synagogue. Jesus is seen only from directly behind, on the near left; keep his face and mouth completely invisible for the entire take as his existing Hatam line continues on the final soundtrack. His open hands may shift naturally and subtly. The same six Papuan/Hatam leaders remain seated in their established positions and distinct faces, silently listening with small independent breaths and glances toward Jesus. Maintain the approved cream-and-indigo Jesus garment, first-century clothing, bright warm window light, and room geography. Camera remains behind his shoulder and steady: no orbit, reverse, profile reveal, or close-up of his mouth. No one else speaks, mouths words, rises, enters, exits, approaches, heals, or changes identity or clothing. No synchronized crowd gestures, new event, subtitles, text, music, or intelligible generated speech. Generate picture with only incidental ambience; the approved Jesus audio is added separately in assembly.`;
  const attemptId = randomUUID(), now = Date.now();
  db.prepare(`INSERT INTO generation_attempts
    (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','generate_coverage_base','720p',?,'hold_for_review',NULL,0,?)`)
    .run(attemptId, SHOT_ID, prompt, now);
  console.log(JSON.stringify({ attemptId, requestLabel: `mark3-scene1-shot4-cutaway-${attemptId}`, state: "submitted_or_pending" }));
  const result = await generateFinalVideoWithFallback(
    new GeminiVideoProvider(), new KlingVideoProvider(), new GeminiDraftVideoProvider(),
    { shotId: `mark3-scene1-shot4-cutaway-${attemptId}`, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: beat.keyframe_asset_path }, durationSeconds: 4, tier: "economy" }
  );
  if (!result.media?.path) throw new Error("Provider returned no retained cutaway video; pending attempt needs reconciliation.");
  const source = join(dataDir, "assets", result.media.path);
  if (!existsSync(source)) throw new Error("Provider reported cutaway media absent from disk.");
  const meta = probe(source), requiredSeconds = (beat.audio_end_ms-beat.audio_start_ms)/1000;
  const usable = meta.duration >= requiredSeconds && meta.width >= 1280 && meta.height >= 720 && result.tier !== "omni_draft";
  const previewRel = join("generated", "video", "review", `mark3-scene1-shot4-cutaway-${attemptId}-3298ms-muted.mp4`);
  const preview = join(dataDir, "assets", previewRel);
  mkdirSync(join(dataDir, "assets", "generated", "video", "review"), { recursive: true });
  if (meta.duration >= requiredSeconds) {
    execFileSync("ffmpeg", ["-v", "error", "-n", "-i", source, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24", "-frames:v", "79", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", preview], { stdio: "pipe" });
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,prompt=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, `${prompt}\n\nProvider tier: ${result.tier}; Veo attempts: ${result.veoAttempts}; measured output: ${meta.duration.toFixed(3)}s, ${meta.width}x${meta.height}.`, result.media.path, result.cost.usd, attemptId);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `${MARKER}: candidate ${attemptId} retained, ${meta.duration.toFixed(3)}s at ${meta.width}x${meta.height}; ${usable ? "muted review clip ready" : "not suitable for 720p selection"}. Producer review required; no clip selected.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, tier: result.tier, resultAssetPath: result.media.path, durationSeconds: meta.duration, resolution: `${meta.width}x${meta.height}`, costUsdEstimate: result.cost.usd, suitableForReview: usable, preview: usable ? preview : null }));
}

main().catch(error => { console.error("FAILED:", error); process.exitCode = 1; });
