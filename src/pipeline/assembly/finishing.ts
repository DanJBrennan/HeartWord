import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { crewBriefHash, digest, loadCrewBrief, productionAssetPath } from "../creative-direction/crew-context.js";
import { latestCrewRun, runProductionCrew } from "../creative-direction/crew-store.js";
import { validateContribution } from "../creative-direction/crew.js";
import type { CrewBrief, CrewResult } from "../creative-direction/crew-types.js";
import { validateSourcePlacements } from "./editorial-plan.js";

export function mediaDurationMs(path: string): number {
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" }).trim()) * 1000;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Media has no measurable duration.");
  return Math.round(duration);
}

export function structuralCutFindings(brief: CrewBrief): string[] {
  const issues: string[] = [];
  const render = brief.render;
  if (!render) return ["No assembled chapter to review."];
  issues.push(...validateSourcePlacements(brief));
  if (render.timingAudit) issues.push("Existing cut timing is an observation, not verified complete source coverage. " + render.timingAudit.findings.join(" "));
  let end = 0;
  const represented = new Set<string>();
  const closingStart = render.durationMs - (brief.editorialClosing?.at(-1)?.endMs ?? 0);
  if (brief.editorialClosing?.length && render.audioMap?.some(a => a.endMs > closingStart)) issues.push("Closing credits overlap the source performance.");
  for (const item of render.timeline) {
    const opening = item.shotId === null ? brief.editorialOpening?.find(b => b.id === item.editorialBeatId) : undefined;
    const closing = item.shotId === null ? brief.editorialClosing?.find(b => b.id === item.editorialBeatId) : undefined;
    const beat = opening ?? closing, offset = opening ? 0 : closingStart;
    const known = item.shotId !== null ? !item.editorialBeatId && brief.shots.some(s => s.id === item.shotId) && (!brief.editorialClosing?.length || item.endMs <= closingStart)
      : beat && item.path === beat.path && item.sha256 === beat.sha256 && item.sourceStartMs === 0 && item.startMs === offset + beat.startMs && item.endMs === offset + beat.endMs;
    if (!known || !Number.isFinite(item.startMs) || !Number.isFinite(item.endMs) || Math.abs(item.startMs - end) > 2 || item.endMs <= item.startMs) issues.push("Render timeline contains an unknown shot, gap, overlap or invalid duration.");
    represented.add(item.shotId ?? `editorial:${item.editorialBeatId}`); end = item.endMs;
  }
  if (brief.editorialOpening?.some(beat => !represented.has(`editorial:${beat.id}`))) issues.push("The approved editorial opening is missing from the recorded timeline.");
  if (brief.editorialClosing?.some(beat => !represented.has(`editorial:${beat.id}`))) issues.push("The accepted closing credits are missing from the recorded timeline.");
  if (Math.abs(end - render.durationMs) > 100) issues.push("Saved shot timeline does not cover the rendered cut.");
  return [...new Set(issues)];
}

/** Numeric-only filters and approved asset IDs: model text never becomes executable code. */
export function finishingRecipe(brief: CrewBrief, result: CrewResult): { inputs: string[]; filter: string; videoLabel: string; audioLabel: string } {
  if (!brief.render || result.status !== "approved") throw new Error("Finishing requires an approved review of an actual cut.");
  const structural = structuralCutFindings(brief);
  if (structural.length) throw new Error(structural.join(" "));
  for (const role of ["colorist", "sound_designer", "composer"] as const) {
    const contribution = result.contributions[role];
    if (!contribution) throw new Error(`Missing ${role} review.`);
    const {exchange:_savedExchange,...wireContribution}=contribution;
    validateContribution(wireContribution, role, brief);
  }
  const colors = result.contributions.colorist!.colorAdjustments!;
  const cues = [...result.contributions.sound_designer!.audioCues!, ...result.contributions.composer!.audioCues!];
  const edges = cues.flatMap(c => [{ time: c.startMs, delta: Math.pow(10, c.gainDb / 20) }, { time: c.endMs, delta: -Math.pow(10, c.gainDb / 20) }])
    .sort((a, b) => a.time - b.time || a.delta - b.delta);
  let gain = 0;
  const levels = [...edges, ...(brief.render.audioMap ?? []).flatMap(a => [{ time: a.startMs, delta: 0 }, { time: a.endMs, delta: 0 }])].sort((a,b) => a.time-b.time || a.delta-b.delta);
  for (const edge of levels) {
    gain += edge.delta;
    const speech = !brief.render.audioMap || brief.render.audioMap.some(a => a.startMs <= edge.time && a.endMs > edge.time);
    if (gain > (speech ? 0.18 : 0.6)) throw new Error("Overlapping soundtrack cues exceed the combined speech-protection level.");
  }
  const eq = colors.flatMap(c => brief.render!.timeline.filter(t => t.shotId === c.shotId).map(t =>
    `eq=brightness=${c.brightness}:contrast=${c.contrast}:saturation=${c.saturation}:enable='gte(t,${t.startMs / 1000})*lt(t,${t.endMs / 1000})'`));
  const filters = [`[0:v]${eq.length ? eq.join(",") : "null"}[picture]`];
  const inputs: string[] = [];
  cues.forEach((cue, index) => {
    inputs.push(brief.audioAssets.find(a => a.id === cue.assetId)!.path);
    const duration = (cue.endMs - cue.startMs) / 1000;
    const fades = [
      ...(cue.fadeInMs ? [`afade=t=in:d=${cue.fadeInMs / 1000}`] : []),
      ...(cue.fadeOutMs ? [`afade=t=out:st=${duration - cue.fadeOutMs / 1000}:d=${cue.fadeOutMs / 1000}`] : [])
    ];
    filters.push(`[${index + 1}:a]atrim=start=${cue.sourceStartMs / 1000}:duration=${duration},asetpts=PTS-STARTPTS,volume=${cue.gainDb}dB,${fades.length ? fades.join(",") + "," : ""}adelay=${cue.startMs}:all=1[cue${index}]`);
  });
  if (cues.length) {
    filters.push(`[0:a]asplit=2[speech][detector]`);
    filters.push(`${cues.map((_, i) => `[cue${i}]`).join("")}amix=inputs=${cues.length}:normalize=0,apad[bed]`);
    filters.push("[bed][detector]sidechaincompress=threshold=0.03:ratio=8:attack=10:release=250[ducked]");
    // Compensate the limiter's lookahead: otherwise it delays the exact
    // source clock by 239 samples at48kHz, even when no peak is limited.
    filters.push("[speech][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[sound]");
  } else filters.push("[0:a]anull[sound]");
  return { inputs, filter: filters.join(";"), videoLabel: "[picture]", audioLabel: "[sound]" };
}

/** A concatenated picture can change its decoded color metadata between shots.
 * FFmpeg reinitializes that graph; sharing its graph with buffered audio then
 * drops audio samples. Keep the genuine stored recipe intact but execute its
 * independent picture/sound components as separate graphs. */
export function finishingFilterArgs(recipe: { filter: string }): string[] {
  const [picture, ...audio] = recipe.filter.split(";");
  if (!picture?.startsWith("[0:v]") || !picture.endsWith("[picture]") || !audio.length)
    throw new Error("Finishing recipe must retain separate picture and sound components.");
  return ["-filter_complex", picture, "-filter_complex", audio.join(";")];
}

export async function reviewChapter(projectId: string, maxCalls = 17,
  options: { existingSoundtrackOnly?: boolean; resumeRunId?: string } = {}): Promise<CrewResult & { runId: string }> {
  const db = getDb(), dataDir = getDataDir();
  const brief = loadCrewBrief(db, dataDir, projectId, "finishing");
  const sourcePath = productionAssetPath(dataDir, brief.render!.path);
  const actualDuration = mediaDurationMs(sourcePath);
  const issues = structuralCutFindings(brief);
  if (Math.abs(actualDuration - brief.render!.durationMs) > 100) issues.push("Actual media duration differs from its render record.");
  const directory = mkdtempSync(join(tmpdir(), "heartword-review-"));
  try {
    const proxy = join(directory, "review.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-n", "-i", sourcePath, "-map", "0:v:0", "-map", "0:a:0",
      "-vf", "scale=320:-2,fps=6", "-c:v", "libx264", "-b:v", "90k", "-maxrate", "128k", "-bufsize", "256k",
      "-c:a", "aac", "-b:a", "32k", "-ac", "1", "-movflags", "+faststart", proxy], { stdio: ["ignore", "ignore", "pipe"] });
    const bytes = readFileSync(proxy);
    if (bytes.length > 18 * 1024 * 1024) throw new Error("Review proxy exceeds 18 MiB. Review a shorter approved cut instead of dropping footage silently.");
    const result = await runProductionCrew(projectId, "finishing", { maxCalls,
      existingSoundtrackOnly: options.existingSoundtrackOnly,
      resumeRunId: options.resumeRunId,
      media: [{ mimeType: "video/mp4", data: bytes.toString("base64") }] });
    if (issues.length || crewBriefHash(loadCrewBrief(db, dataDir, projectId, "finishing"), "finishing") !== crewBriefHash(brief, "finishing")) {
      result.status = "held";
      result.summary += ` Structural review: ${issues.join(" ") || "The cut changed while the review proxy was being prepared."}`;
      if (result.productionRecord) result.productionRecord.status = "held";
      if (result.creativeFeedback) {
        result.creativeFeedback.selectedRound = null;
        result.creativeFeedback.stopReason = result.summary;
        for (const pass of result.creativeFeedback.passes) { pass.hardChecks = "failed"; pass.reason = "Structural or stale-cut checks hold this review: " + result.summary; }
      }
      db.prepare("UPDATE production_runs SET status = ?, result_json = ? WHERE id = ?").run(result.status, JSON.stringify(result), result.runId);
    }
    return result;
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(directory));
    if (rel.startsWith("heartword-review-") && !rel.includes("..")) rmSync(directory, { recursive: true, force: true });
  }
}

export function applyFinishing(db: DatabaseSync, dataDir: string, projectId: string, runId: string): { path: string; renderId: string } {
  const run = latestCrewRun(db, projectId, "finishing");
  if (!run || run.id !== runId || run.status !== "approved") throw new Error("Only the latest approved finishing review may be applied.");
  const existing = db.prepare("SELECT payload FROM edit_commands WHERE idempotency_key = ?").get(`finishing:${runId}`) as { payload: string } | undefined;
  if (existing) { const { path, renderId } = JSON.parse(existing.payload); return { path, renderId }; }
  const brief = loadCrewBrief(db, dataDir, projectId, "finishing");
  if (crewBriefHash(brief, "finishing") !== run.brief_hash) throw new Error("Finishing review is stale. Review the current cut first.");
  const result = JSON.parse(run.result_json!) as CrewResult;
  const recipe = finishingRecipe(brief, result);
  const renderId = randomUUID();
  const path = `generated/chapter/${projectId}/${renderId}.mp4`;
  const out = productionAssetPath(dataDir, path);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-n", "-i", productionAssetPath(dataDir, brief.render!.finishing?.basePath ?? brief.render!.path),
    ...recipe.inputs.flatMap(p => ["-i", productionAssetPath(dataDir, p)]), ...finishingFilterArgs(recipe),
    "-map", recipe.videoLabel, "-map", recipe.audioLabel, "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-ar", "48000",
    "-t", String(brief.render!.durationMs / 1000), "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });
  const duration = mediaDurationMs(out);
  if (Math.abs(duration - brief.render!.durationMs) > 100) throw new Error("Finishing changed the cut duration; output was not promoted.");
  const payload = { path, renderId, parentRenderId: brief.render!.id, baseRenderId: brief.render!.finishing?.baseRenderId ?? brief.render!.id, runId, recipe, sha256: digest(readFileSync(out)) };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO chapter_renders (id, project_id, result_asset_path, total_duration_ms, shot_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(renderId, projectId, path, duration, brief.shots.length, Date.now());
    db.prepare("INSERT INTO chapter_render_manifests (render_id, timeline_json, source_audio_json) SELECT ?, timeline_json, source_audio_json FROM chapter_render_manifests WHERE render_id = ?").run(renderId, brief.render!.id);
    const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM edit_commands WHERE project_id = ?").get(projectId)!.n);
    db.prepare("INSERT INTO edit_commands (id, project_id, sequence, command_type, payload, idempotency_key, applied_at) VALUES (?, ?, ?, 'apply_finishing', ?, ?, ?)")
      .run(randomUUID(), projectId, sequence, JSON.stringify(payload), `finishing:${runId}`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return { path, renderId };
}
