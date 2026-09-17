/** Gap ideas join the same reviewed shot/attempt/clip pipeline as the chapter. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { GeminiVideoProvider, GeminiDraftVideoProvider } from "../../providers/gemini/index.js";
import { KlingVideoProvider } from "../../providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../media-generation/generate-final-with-fallback.js";
import { generateJsonWithImages } from "../../providers/gemini-text.js";
import { runMediaGeneration } from "../media-generation/index.js";
import { assembleSingleShot } from "../assembly/assemble-single-shot.js";
import { mediaDurationMs } from "../assembly/finishing.js";
import { loadCrewBrief, productionAssetPath } from "./crew-context.js";
import { directionsFromRun, requireCurrentPlan, runProductionCrew } from "./crew-store.js";
import type { CrewBrief } from "./crew-types.js";
import type { GapFillIdea } from "./index.js";

export interface ImplementedNewShot { ideaId: string; label: string; keyframePath: string; videoPath: string; videoTier: string; costUsd: number }
export interface TimelineEditInstruction { ideaId: string; operation: "reorder_existing" | "extend_existing"; targetShotVerseRef: string; instruction: string }
export interface ImplementationResult { newShots: ImplementedNewShot[]; timelineEdits: TimelineEditInstruction[]; failures: Array<{ ideaId: string; label: string; error: string }> }

export function materializeGapIdea(db: DatabaseSync, brief: CrewBrief, idea: GapFillIdea): string {
  if (typeof idea.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(idea.id)) throw new Error("A stable, file-safe idea ID is required.");
  if (idea.operation !== "new_shot") throw new Error("Only new-shot ideas create footage.");
  if (!Number.isFinite(idea.estimatedDurationSec) || idea.estimatedDurationSec <= 0 || idea.estimatedDurationSec > 8) throw new Error("Split this idea into shots of at most eight seconds before generation.");
  const anchor = brief.shots.find(s => s.id === idea.targetShotId);
  if (!anchor) throw new Error("A specific shot in this chapter must anchor the new idea; review an older unscoped proposal again.");
  const characters = idea.charactersInvolved.map(name => {
    const matches = brief.canon.filter(c => c.name === name);
    if (matches.length !== 1) throw new Error(`No unique approved chapter character named ${name}.`);
    return matches[0]!;
  });
  const action = `${idea.description}\nSetting: ${idea.setting}\nEditorial anchor: ${anchor.id}. Purpose: ${idea.decorumRationale}`;
  const existing = db.prepare("SELECT s.action,sc.project_id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=?").get(idea.id);
  if (existing) {
    if (existing.project_id !== brief.project.id || existing.action !== action) throw new Error("The idea changed after implementation; use a newly reviewed idea ID.");
    return idea.id;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const seq = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM shots WHERE scene_id=?").get(anchor.sceneId)!.n);
    db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,continuity_notes,created_at)
      VALUES (?,?,?,?,?,?,?,0,?,?)`).run(idea.id, anchor.sceneId, seq, action, anchor.verseRef, idea.framing, idea.cameraMovement,
        `Supplementary silent coverage anchored to ${anchor.id}; the Picture Editor decides its final position. ${anchor.continuity ?? ""}`, Date.now());
    for (const c of characters) db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(idea.id, c.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return idea.id;
}

export async function implementApprovedIdeas(db: DatabaseSync, projectId: string, approvedIdeas: GapFillIdea[]): Promise<ImplementationResult> {
  const output: ImplementationResult = { newShots: [], timelineEdits: [], failures: [] };
  const dataDir = getDataDir();
  const brief = loadCrewBrief(db, dataDir, projectId, "planning");
  const newIdeas: GapFillIdea[] = [];
  for (const idea of approvedIdeas) {
    try {
      if (idea.operation === "new_shot") { materializeGapIdea(db, brief, idea); newIdeas.push(idea); continue; }
      const target = brief.shots.find(s => s.id === idea.targetShotId);
      if (!target || (idea.operation === "extend_existing" && target.needsLipSync)) throw new Error("An exact chapter shot is required; lip-synced speech cannot be extended.");
      const instruction = `${idea.operation}: ${idea.description}; target ${target.id}; additional duration ${idea.estimatedDurationSec}s. Request new coverage if the current clip is too short.`;
      // The editor sees the request, rather than an unaudited script splice.
      db.prepare(`INSERT OR IGNORE INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
        VALUES (?,?,'shot',?,'qc',?,0,?)`).run(`director-idea:${idea.id}`, projectId, target.id, `Production Director approved edit: ${instruction}`, Date.now());
      output.timelineEdits.push({ ideaId: idea.id, operation: idea.operation, targetShotVerseRef: target.verseRef, instruction });
    } catch (error) { output.failures.push({ ideaId: idea.id, label: idea.label, error: (error as Error).message }); }
  }
  if (!newIdeas.length) return output;
  let plan;
  try { plan = requireCurrentPlan(db, dataDir, projectId); }
  catch { const result = await runProductionCrew(projectId, "planning"); if (result.status === "approved") plan = requireCurrentPlan(db, dataDir, projectId); }
  if (!plan) {
    for (const idea of newIdeas) output.failures.push({ ideaId: idea.id, label: idea.label, error: "New shots are saved. Resolve the crew's findings before media generation." });
    return output;
  }
  await runMediaGeneration(projectId, newIdeas.map(i => i.id));
  for (const idea of newIdeas) {
    try {
      const job = db.prepare("SELECT * FROM directed_video_jobs WHERE shot_id=? AND project_id=?").get(idea.id, projectId);
      if (job) {
        if (job.status !== "accepted") throw new Error(`Previous video request is ${job.status}; review it before another paid attempt.`);
        output.newShots.push(JSON.parse(String(job.result_json))); continue;
      }
      const keyframe = db.prepare("SELECT result_asset_path,status,cost_usd FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(idea.id);
      if (keyframe?.status !== "accepted" || !keyframe.result_asset_path) throw new Error("Keyframe must pass Critic review before video generation.");
      const current = requireCurrentPlan(db, dataDir, projectId);
      const prompt = idea.description + directionsFromRun(current, idea.id);
      db.prepare("INSERT INTO directed_video_jobs (shot_id,project_id,status,created_at) VALUES (?,?,'running',?)").run(idea.id, projectId, Date.now());
      const video = await generateFinalVideoWithFallback(new GeminiVideoProvider(), new KlingVideoProvider(), new GeminiDraftVideoProvider(), { shotId: idea.id, prompt, characters: [] },
        { resolution: "720p", startFrame: { path: String(keyframe.result_asset_path) }, durationSeconds: idea.estimatedDurationSec <= 4 ? 4 : 8 });
      const attemptId = randomUUID();
      db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
        VALUES (?,?,?,?,'generate_directed_video','720p',?,'hold_for_review',?,?,?)`).run(attemptId, idea.id, video.provenance.provider, video.provenance.model, prompt, video.media?.path ?? null, video.cost.usd, Date.now());
      db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
        .run(randomUUID(), projectId, attemptId, video.cost.usd, Date.now());
      if (video.status !== "accepted" || !video.media) throw new Error("Video provider did not return usable footage.");
      const bytes = readFileSync(productionAssetPath(dataDir, video.media.path));
      if (bytes.length > 18 * 1024 * 1024) throw new Error("Video needs a smaller review proxy before acceptance.");
      const verdict = await generateJsonWithImages<{ pass: boolean; confidence: number; reason: string }>(
        `Independently watch this silent supplementary shot against its approved keyframe direction: ${prompt}. Check motion, continuity, physical action, source fidelity and unwanted text. Do not approve uncertain evidence.`,
        [{ mimeType: "video/mp4", data: bytes.toString("base64") }, { mimeType: "image/png", data: readFileSync(productionAssetPath(dataDir, String(keyframe.result_asset_path))).toString("base64") }],
        { type: "object", properties: { pass: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } }, required: ["pass", "confidence", "reason"] });
      db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)`)
        .run(randomUUID(), projectId, idea.id, `ATTEMPT: ${attemptId}\nDirected video review: ${JSON.stringify(verdict)}`, Date.now());
      if (verdict.pass !== true || !Number.isFinite(verdict.confidence) || verdict.confidence < 80 || verdict.confidence > 100 || !verdict.reason?.trim()) throw new Error("Directed video is held by its viewing review.");
      if (requireCurrentPlan(db, dataDir, projectId).id !== current.id) throw new Error("Direction changed while video was generated; review the saved candidate.");
      const durationMs = mediaDurationMs(productionAssetPath(dataDir, video.media.path));
      if (durationMs + 50 < idea.estimatedDurationSec * 1000) throw new Error("Video is too short; request additional coverage instead of freezing its last frame.");
      db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(attemptId);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)").run(randomUUID(), idea.id, attemptId, Math.round(idea.estimatedDurationSec * 1000), Date.now());
      const assembled = assembleSingleShot(db, idea.id);
      const built = { ideaId: idea.id, label: idea.label, keyframePath: String(keyframe.result_asset_path), videoPath: assembled.assembledVideoPath,
        videoTier: video.tier, costUsd: Number(keyframe.cost_usd) + video.cost.usd };
      db.prepare("UPDATE directed_video_jobs SET status='accepted',result_json=? WHERE shot_id=?").run(JSON.stringify(built), idea.id);
      output.newShots.push(built);
    } catch (error) {
      db.prepare("UPDATE directed_video_jobs SET status='incomplete',error=? WHERE shot_id=? AND status='running'").run((error as Error).message, idea.id);
      output.failures.push({ ideaId: idea.id, label: idea.label, error: (error as Error).message });
    }
  }
  return output;
}
