import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { crewBriefHash, loadCrewBrief, productionAssetPath } from "../creative-direction/crew-context.js";
import { latestCrewRun } from "../creative-direction/crew-store.js";
import type { CrewResult } from "../creative-direction/crew-types.js";
import { planEditorialCut } from "./editorial-plan.js";
import { mediaDurationMs } from "./finishing.js";
import { assertSpeakerAudioContinuity, continuousAudioGroups, type ResolvedAudioPlacement } from "./continuous-audio.js";
import { decodeToPcm16Mono } from "../ingestion/pitch.js";
import { detectTruncatedRenewal } from "../qc/audio-tail.js";
import { assertNoRenderedFlashes } from "../qc/flash-detection.js";

export function assertEditorialRebuildable(db: DatabaseSync, projectId: string): void {
  const render = db.prepare(`SELECT r.id,m.timeline_json,m.source_audio_json FROM chapter_renders r LEFT JOIN chapter_render_manifests m ON m.render_id=r.id
    WHERE r.project_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 1`).get(projectId);
  if (!render) return;
  if (!render.timeline_json) throw new Error("The current hand-edited film has no saved timing manifest. It can be reviewed, but rebuilding requires its existing inserts and pauses to be represented first.");
  if (!Array.isArray(JSON.parse(String(render.timeline_json))) || !render.source_audio_json || !Array.isArray(JSON.parse(String(render.source_audio_json)))) throw new Error("The current film retains a custom legacy edit recipe. Preserve its editor/scripts and exact source map before automatic picture rebuilding; a saved recipe is not a complete executable timeline.");
  const finish = db.prepare("SELECT json_extract(payload,'$.baseRenderId') AS base FROM edit_commands WHERE project_id=? AND command_type='apply_finishing' AND json_extract(payload,'$.renderId')=? LIMIT 1").get(projectId, String(render.id));
  const baseId = finish?.base ?? render.id;
  if (db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId, `cut-timing:${baseId}`)) throw new Error("This imported hand edit is available for review and soundtrack/color finishing. Revise its picture in the existing editor; its supplementary clips are not all represented in the shot database.");
}

/** Executes the editor's bounded cut while rebuilding speech from immutable source segments. */
export function renderEditorialCut(db: DatabaseSync, dataDir: string, projectId: string, runId: string): { path: string; renderId: string } {
  const existing = db.prepare("SELECT payload FROM edit_commands WHERE idempotency_key = ?").get(`editorial:${runId}`) as { payload: string } | undefined;
  if (existing) { const { path, renderId } = JSON.parse(existing.payload); return { path, renderId }; }
  assertEditorialRebuildable(db, projectId);
  const run = latestCrewRun(db, projectId, "editing");
  if (!run || run.id !== runId || run.status !== "approved") throw new Error("A current approved Picture Editor cut is required.");
  const brief = loadCrewBrief(db, dataDir, projectId, "editing");
  if (crewBriefHash(brief, "editing") !== run.brief_hash) throw new Error("Editing inputs changed; review the current footage first.");
  const result = JSON.parse(run.result_json!) as CrewResult;
  const cut = planEditorialCut(brief, result.contributions.picture_editor!);
  const directory = mkdtempSync(join(tmpdir(), "heartword-edit-"));
  const runFfmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const videos: string[] = [];
    for (const [index, edit] of cut.timeline.entries()) {
      const clip = brief.shots.find(s => s.id === edit.shotId)!.clip!;
      const input = productionAssetPath(dataDir, clip.path);
      if (edit.sourceStartMs + edit.endMs - edit.startMs > mediaDurationMs(input) + 50) throw new Error("A clip is shorter than its saved duration; request coverage instead of freezing it.");
      const frames = Math.round(edit.endMs * 24 / 1000) - Math.round(edit.startMs * 24 / 1000);
      if (frames < 1) throw new Error("An edit is shorter than a video frame.");
      const output = join(directory, `video-${index}.mp4`);
      runFfmpeg(["-ss", String(edit.sourceStartMs / 1000), "-i", input, "-an", "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,tpad=stop_mode=clone:stop_duration=0.05",
        "-frames:v", String(frames), "-c:v", "libx264", "-crf", "18", output]);
      videos.push(output);
    }
    const audio: string[] = [];
    let cursor = 0;
    const silence = (durationMs: number) => {
      if (durationMs <= 0) return;
      const output = join(directory, `audio-${audio.length}.wav`);
      runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(durationMs / 1000), "-c:a", "pcm_s16le", output]);
      audio.push(output);
    };
    const resolvedAudio: ResolvedAudioPlacement[] = cut.audioMap.map(placement => {
      const segment = brief.audio.find(a => a.id === placement.segmentId)!;
      let path = segment.path, startMs = segment.startMs;
      const durationMs = segment.endMs - segment.startMs;
      if (segment.speakerId) {
        const versions = db.prepare(`SELECT a.source_path AS path, a.start_ms AS startMs, a.end_ms AS endMs FROM audio_segments a
          LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id
          WHERE a.project_id = ? AND a.layer = 'composite_cast_master' AND a.speaker_character_id = ? AND a.verse_ref = ?
            AND (m.original_segment_id = ? OR m.composite_segment_id IS NULL)`)
          .all(projectId, segment.sourceSpeakerId ?? segment.speakerId, segment.verseRef, segment.id) as Array<{ path: string; startMs: number; endMs: number }>;
        if (versions.length !== 1 || Math.abs(versions[0]!.endMs - versions[0]!.startMs - durationMs) > 50) throw new Error(`A duration-matched approved cast-master segment is required for ${segment.verseRef}.`);
        path = versions[0]!.path; startMs = versions[0]!.startMs;
      }
      return { segmentId: placement.segmentId, path, speakerId: segment.speakerId,
        voice: segment.speakerId ? "cast" : "original",
        sourceStartMs: startMs, sourceEndMs: startMs + durationMs,
        startMs: placement.startMs, endMs: placement.endMs };
    });
    // This is intentionally independent of `cut.timeline`: any master,
    // listener, or cover shot within a spoken interval keeps the same cast
    // voice until that source interval ends.
    assertSpeakerAudioContinuity(brief.audio, resolvedAudio);
    const audioGroups = continuousAudioGroups(resolvedAudio);
    for (const [index, group] of audioGroups.entries()) {
      silence(group.startMs - cursor);
      const input = productionAssetPath(dataDir, group.path);
      if (group.sourceEndMs > mediaDurationMs(input) + 50) throw new Error("Source audio file is shorter than its approved segment.");
      const output = join(directory, `audio-${audio.length}.wav`);
      runFfmpeg(["-ss", String(group.sourceStartMs / 1000), "-i", input,
        "-t", String((group.sourceEndMs - group.sourceStartMs) / 1000),
        "-af", "apad", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", output]);
      // A picture cut is irrelevant to this check. Only a speaker-turn or
      // chapter end can make a renewed onset at the tail an audible fragment.
      const next = audioGroups[index + 1];
      if (!next || next.speakerId !== group.speakerId || next.startMs > group.endMs) {
        const tail = detectTruncatedRenewal(decodeToPcm16Mono(output, 8000), 8000);
        if (tail) throw new Error(`Audio turn ending at ${group.endMs} ms (${group.segmentIds.join(", ")}) has a ${tail.activeTailMs} ms renewed onset after a quiet gap, cut off at ${tail.tailLevelDb} dBFS. Reconcile that source boundary or preserve the continuous turn before rendering; no audio was dropped.`);
      }
      audio.push(output); cursor = group.endMs;
    }
    silence(cut.durationMs - cursor);
    const concatList = (name: string, paths: string[]) => {
      const list = join(directory, name);
      writeFileSync(list, paths.map(p => `file '${p.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n"));
      return list;
    };
    const audioPath = join(directory, "performance.wav");
    runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatList("audio.txt", audio), "-c:a", "copy", audioPath]);
    const renderId = randomUUID(), path = `generated/chapter/${projectId}/${renderId}.mp4`;
    const output = productionAssetPath(dataDir, path); mkdirSync(dirname(output), { recursive: true });
    runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatList("video.txt", videos), "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-t", String(cut.durationMs / 1000), "-movflags", "+faststart", output]);
    const duration = mediaDurationMs(output);
    if (Math.abs(duration - cut.durationMs) > 100) throw new Error("Rendered duration differs from the protected performance and pauses.");
    assertNoRenderedFlashes(output);
    // Confirm the *encoded chapter*, not just the intermediate PCM, did not
    // acquire a chopped onset at a speaking-turn end. Picture cuts are absent
    // from this decision; the source-to-production audio map remains intact.
    const renderedPcm = decodeToPcm16Mono(output, 8000);
    for (const [index, group] of audioGroups.entries()) {
      const next = audioGroups[index + 1];
      if (next && next.speakerId === group.speakerId && next.startMs === group.endMs) continue;
      const end = Math.min(renderedPcm.length, Math.round(group.endMs * 8));
      const tail = detectTruncatedRenewal(renderedPcm.subarray(Math.max(0, end - 12_000), end), 8000);
      if (tail) throw new Error(`Rendered chapter ${path} holds a ${tail.activeTailMs} ms renewed onset cut off at audio turn ${group.endMs} ms (${group.segmentIds.join(", ")}). The unpromoted render is retained for diagnosis; reconcile the source boundary without discarding speech.`);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(renderId, projectId, path, duration, cut.timeline.length, Date.now());
      const auditedAudioMap = cut.audioMap.map((placement, index) => ({ ...placement,
        voice: resolvedAudio[index]!.voice, speakerId: resolvedAudio[index]!.speakerId }));
      db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(renderId, JSON.stringify(cut.timeline), JSON.stringify(auditedAudioMap));
      const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
      db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'render_editorial_cut',?,?,?)")
        .run(randomUUID(), projectId, sequence, JSON.stringify({ path, renderId, runId, cut }), `editorial:${runId}`, Date.now());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return { path, renderId };
  } finally {
    if (relative(tmpdir(), directory).startsWith("heartword-edit-")) rmSync(directory, { recursive: true, force: true });
  }
}
