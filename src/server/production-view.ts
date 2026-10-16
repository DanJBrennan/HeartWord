import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { observedWork } from "../pipeline/observed-work.js";
import { latestCrewRun, productionRecordForRun } from "../pipeline/creative-direction/crew-store.js";
import { checkFilmSpend } from "../pipeline/voice-lipsync/performance-direction.js";
import type { CrewResult } from "../pipeline/creative-direction/crew-types.js";
import type { CrewBrief } from "../pipeline/creative-direction/crew-types.js";
import { parseVerseRange } from "../pipeline/scene-breakdown/build-scenes.js";
import { readProgrammePreview } from "./producer-preview.js";

export type WorkState = "queued" | "working" | "awaiting_external" | "awaiting_dan" | "held" | "failed" | "uncertain" | "finished";
const STAGES = ["ingestion", "scene_breakdown", "casting", "media_generation", "voice_lipsync", "assembly", "qc"] as const;
interface Execution { id: string; stage: string; status: string; reason: string; started_at: number; completed_at: number | null; }
interface Run { id: string; phase: string; status: string; result_json: string | null; created_at: number; completed_at: number | null; }
interface Job { id: string; shot_id: string; backend: string; status: string; progress_json: string | null; metadata_json: string | null; updated_at: number; }
interface Attempt { id: string; shot_id: string; provider: string; model: string; operation: string; status: string; result_asset_path: string | null; cost_usd: number | null; created_at: number; }
interface Clip { id: string; shot_id: string; generation_attempt_id: string; timeline_start_ms: number; timeline_end_ms: number; }
interface Review { id: string; subject_type: string; subject_id: string; source: string; note: string; resolved: number; created_at: number; }
export interface ViewMedia { id: string; path: string | null; available: boolean; status: string; kind: "image" | "video" | "other"; operation: string; provider: string; model: string; costUsd: number | null; selected: boolean; historical: boolean; includedUsage: boolean; }
export interface ViewWork { id: string; stage: string; subjectId: string | null; state: WorkState; summary: string; at: number; }
const phaseStage = (phase: string) => phase === "planning" ? "casting" : phase === "editing" ? "assembly" : "qc";
function scopedVerses(verseRef: string | null, verses: Array<{ verse: number; text: string }> = []) {
  if (!verseRef) return [];
  try { const range = parseVerseRange(verseRef); return verses.filter(verse => verse.verse >= range.start && verse.verse <= range.end); }
  catch { return []; } // Editorial/unresolved labels supply no invented Scripture interval.
}

/** Stateless read projection. No stage start, recovery, acceptance, cost
 * reservation, library registration, migration or media generation on GET. */
export function readProductionView(db: DatabaseSync, dataDir: string, projectId: string, now = Date.now()) {
  const project = db.prepare("SELECT id,language,book,chapter,stage,status,updated_at FROM projects WHERE id=?").get(projectId) as
    { id: string; language: string; book: string; chapter: number; stage: string; status: string; updated_at: number } | undefined;
  if (!project) throw new Error("Project not found.");
  const assetsRoot = resolve(dataDir, "assets");
  const available = (path: string | null) => {
    if (!path) return false;
    const target = resolve(assetsRoot, path), local = relative(assetsRoot, target);
    if (isAbsolute(path) || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) return false;
    try { const stat = statSync(target); return stat.isFile() && stat.size > 0; } catch { return false; }
  };
  const executions = db.prepare("SELECT * FROM stage_executions WHERE project_id=? ORDER BY started_at DESC,rowid DESC").all(projectId) as unknown as Execution[];
  const runs = db.prepare("SELECT id,phase,status,result_json,created_at,completed_at FROM production_runs WHERE project_id=? ORDER BY created_at DESC,rowid DESC").all(projectId) as unknown as Run[];
  const hasVideoProgress = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='video_generation_jobs'").get();
  const jobs = hasVideoProgress ? db.prepare("SELECT * FROM video_generation_jobs WHERE project_id=? ORDER BY updated_at DESC,rowid DESC").all(projectId) as unknown as Job[] : [];
  const reviews = db.prepare("SELECT * FROM review_notes WHERE project_id=? ORDER BY created_at DESC,rowid DESC").all(projectId) as unknown as Review[];
  const decisions = db.prepare("SELECT id,sequence,command_type,payload,applied_at,undone FROM edit_commands WHERE project_id=? ORDER BY sequence DESC").all(projectId) as unknown as Array<{ id: string; sequence: number; command_type: string; payload: string; applied_at: number; undone: number }>;
  const live = observedWork(projectId);
  const cutover = db.prepare("SELECT * FROM project_restart_cutovers WHERE project_id=?").get(projectId) as { started_at: number; approved_by: string; reason: string } | undefined;
  const work: ViewWork[] = live.map(item => ({ id: item.id, stage: item.stage, subjectId: item.subjectId, state: "working", summary: "Executing in this server process; last saved progress is shown separately.", at: item.startedAt }));
  const holds: ViewWork[] = [];
  if (!hasVideoProgress) holds.push({ id: "video-progress-unavailable", stage: "media_generation", subjectId: null, state: "uncertain", summary: "This historical database has no video-progress records. Available saved media/history can be inspected, but external task completion is unverified. No migration was performed by this view.", at: project.updated_at });
  for (const execution of executions.filter((item, i) => executions.findIndex(other => other.stage === item.stage) === i)) {
    if (execution.status === "completed") continue;
    const owner = live.some(item => item.stage === execution.stage);
    const state: WorkState = execution.status === "running" ? owner ? "working" : "uncertain" : execution.status === "failed" ? "failed" : execution.status === "uncertain" ? "uncertain" : "held";
    const item: ViewWork = { id: execution.id, stage: execution.stage, subjectId: null, state, summary: execution.reason + (state === "uncertain" ? " No current execution ownership is evidenced here; reconcile before retrying." : ""), at: execution.completed_at ?? execution.started_at };
    (state === "working" ? work : holds).push(item);
  }
  for (const run of runs.filter((item, i) => runs.findIndex(other => other.phase === item.phase) === i)) {
    const result = run.result_json ? JSON.parse(run.result_json) as CrewResult : null;
    if (run.status === "approved") continue;
    if (run.status === "awaiting_assets") { holds.push({ id: run.id, stage: phaseStage(run.phase), subjectId: run.id, state: "held", summary: result?.summary ?? "Review requests soundtrack assets before finishing can proceed.", at: run.completed_at ?? run.created_at }); continue; }
    const owner = live.some(item => item.subjectId === run.id);
    const state: WorkState = run.status === "running" ? owner ? "working" : "uncertain" : run.status === "incomplete" ? "uncertain" : "held";
    const item: ViewWork = { id: run.id, stage: phaseStage(run.phase), subjectId: run.id, state, summary: result?.summary ?? `Recorded ${run.phase} review: ${run.status}.`, at: run.completed_at ?? run.created_at };
    (state === "working" ? work : holds).push(item);
  }
  for (const job of jobs.filter((item, i) => jobs.findIndex(other => other.shot_id === item.shot_id) === i)) {
    const progress = job.progress_json ? JSON.parse(job.progress_json) as { phase: string; percentage: number | null; diagnostic?: string } : null;
    const metadata = job.metadata_json ? JSON.parse(job.metadata_json) as { error?: string; submissionMayHaveStarted?: boolean } : null;
    if (job.status === "completed") continue; // Provider completion is not asset acceptance.
    const owner = live.some(item => item.subjectId === job.id);
    const stale = now - job.updated_at > 30000;
    let state: WorkState = job.status === "error" ? "failed" : job.status === "held" ? metadata?.submissionMayHaveStarted ? "uncertain" : "held" :
      !owner || stale || progress?.phase === "progress_unavailable" ? "uncertain" :
      /^(queued|waiting_for_slot)$/.test(progress?.phase ?? "") ? "queued" :
      /^(submitted|generating|generation|denoising|inference|sampling)$/.test(progress?.phase ?? "") ? "awaiting_external" : "working";
    const summary = `${job.backend}: ${metadata?.error ?? progress?.phase ?? job.status}${progress?.percentage == null ? "" : ` · ${progress.percentage}%`}${progress?.diagnostic ? ` · ${progress.diagnostic}` : ""}${state === "uncertain" ? ". Completion is unverified; do not resubmit blindly." : ""}`;
    const item: ViewWork = { id: job.id, stage: "media_generation", subjectId: job.shot_id, state, summary, at: job.updated_at };
    (["uncertain", "failed", "held"].includes(state) ? holds : work).push(item);
  }
  for (const review of reviews.filter(item => !item.resolved)) holds.push({ id: review.id, stage: review.subject_type === "audio_segment" ? "ingestion" : "qc", subjectId: review.subject_id,
    state: review.source === "human" ? "awaiting_dan" : "held", summary: review.note, at: review.created_at });

  const planning = latestCrewRun(db, projectId, "planning");
  const record = productionRecordForRun(db, planning);
  const savedSource = planning ? (JSON.parse(planning.brief_json) as Partial<CrewBrief>).source : undefined;
  for (const objection of record?.objections.filter(item => item.status === "open" && item.severity === "blocking") ?? []) holds.push({ id: objection.id, stage: "casting", subjectId: objection.shotId, state: "held", summary: `${objection.owner}: ${objection.requestedChange} ${objection.evidence}`, at: runs.find(run => run.id === record?.revision)?.created_at ?? project.updated_at });

  const clips = db.prepare("SELECT c.* FROM clips c JOIN shots sh ON sh.id=c.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence,c.timeline_start_ms,c.rowid").all(projectId) as unknown as Clip[];
  const attempts = db.prepare("SELECT ga.* FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY ga.created_at DESC,ga.rowid DESC").all(projectId) as unknown as Attempt[];
  const media = (attempt: Attempt): ViewMedia => ({ id: attempt.id, path: attempt.result_asset_path, available: available(attempt.result_asset_path), status: attempt.status,
    kind: /\.(png|jpe?g|webp)$/i.test(attempt.result_asset_path ?? "") ? "image" : /\.(mp4|mov|webm|mkv)$/i.test(attempt.result_asset_path ?? "") ? "video" : "other",
    operation: attempt.operation, provider: attempt.provider, model: attempt.model, costUsd: attempt.cost_usd, selected: clips.some(clip => clip.generation_attempt_id === attempt.id), historical: !!cutover && attempt.created_at < cutover.started_at, includedUsage: /codex|built.?in|assistant/i.test(attempt.provider) });
  const scenes = db.prepare("SELECT id,sequence,verse_start,verse_end,summary,reasoning FROM scenes WHERE project_id=? ORDER BY sequence").all(projectId) as unknown as Array<{ id: string; sequence: number; verse_start: string; verse_end: string; summary: string | null; reasoning: string | null }>;
  const shotRows = db.prepare("SELECT sh.*,sc.sequence AS scene_sequence FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence").all(projectId) as unknown as Array<{ id: string; scene_id: string; scene_sequence: number; sequence: number; action: string; verse_ref: string | null; framing: string | null; camera_movement: string | null; status: string }>;
  const beats = db.prepare("SELECT b.* FROM coverage_beats b JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY b.sequence").all(projectId) as unknown as Array<{ id: string; shot_id: string; sequence: number; beat_type: string; audio_start_ms: number; audio_end_ms: number; keyframe_asset_path: string | null; status: string; notes: string | null }>;
  const audio = db.prepare(`SELECT a.*,c.name AS speaker_name,m.original_segment_id,o.start_ms AS original_start_ms,o.end_ms AS original_end_ms
    FROM audio_segments a LEFT JOIN characters c ON c.id=a.speaker_character_id
    LEFT JOIN composite_audio_source_map m ON m.composite_segment_id=a.id LEFT JOIN audio_segments o ON o.id=m.original_segment_id
    WHERE a.project_id=? ORDER BY COALESCE(o.start_ms,a.start_ms),a.id`).all(projectId) as unknown as Array<{ id: string; layer: string; source_path: string; start_ms: number; end_ms: number; verse_ref: string | null; speaker_name: string | null; original_segment_id: string | null; original_start_ms: number | null; original_end_ms: number | null }>;
  const utterances = db.prepare("SELECT b.* FROM shot_utterance_bindings b JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?").all(projectId) as unknown as Array<{ id: string; shot_id: string; source_audio_segment_id: string; source_start_ms: number; source_end_ms: number; approved_by: string }>;
  const sound = db.prepare("SELECT * FROM production_audio_assets WHERE project_id=? ORDER BY created_at").all(projectId) as unknown as Array<{ id: string; kind: string; description: string; path: string; duration_ms: number }>;
  const soundtrackAttempts = db.prepare("SELECT id,run_id,kind,status,path,cost_usd,error,created_at FROM soundtrack_attempts WHERE project_id=? ORDER BY created_at DESC,rowid DESC").all(projectId) as unknown as Array<{ id: string; run_id: string; kind: string; status: string; path: string | null; cost_usd: number | null; error: string | null; created_at: number }>;
  for (const item of soundtrackAttempts.filter(item => item.status !== "accepted")) {
    const currentOwner = live.some(work => work.stage === "qc" && work.subjectId === item.run_id);
    const state: WorkState = item.status === "generating" && currentOwner ? "awaiting_external" : item.status === "needs_review" && currentOwner ? "working" : ["generating", "incomplete"].includes(item.status) ? "uncertain" : "held";
    const entry: ViewWork = { id: item.id, stage: "qc", subjectId: item.id, state, summary: `${item.kind} request ${item.status}: ${item.error ?? "Completion/listening review is not accepted. Inspect the retained request before retrying."}`, at: item.created_at };
    (["working", "awaiting_external"].includes(state) ? work : holds).push(entry);
  }
  const directedJobs = db.prepare("SELECT shot_id,status,error,created_at FROM directed_video_jobs WHERE project_id=? AND status!='accepted'").all(projectId) as unknown as Array<{ shot_id: string; status: string; error: string | null; created_at: number }>;
  for (const item of directedJobs) if (!jobs.some(job => job.shot_id === item.shot_id)) holds.push({ id: `directed:${item.shot_id}`, stage: "media_generation", subjectId: item.shot_id, state: item.status === "held" ? "held" : "uncertain", summary: `Directed video ${item.status}: ${item.error ?? "Retained request needs completion/review evidence before retry."}`, at: item.created_at });
  const crewEvents = db.prepare("SELECT e.id,e.run_id,e.role,e.round,e.output_json,e.error,e.created_at FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? ORDER BY e.created_at DESC,e.rowid DESC").all(projectId) as unknown as Array<{ id: string; run_id: string; role: string; round: number; output_json: string | null; error: string | null; created_at: number }>;
  const coverageAttempts = db.prepare("SELECT a.*,b.shot_id FROM coverage_keyframe_attempts a JOIN coverage_beats b ON b.id=a.coverage_beat_id JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY a.created_at DESC,a.rowid DESC").all(projectId) as unknown as Array<Attempt>;
  const intro = db.prepare("SELECT plan_json,status FROM chapter_intro_plans WHERE project_id=?").get(projectId) ?? null;
  const ending = db.prepare("SELECT plan_json,status FROM chapter_ending_plans WHERE project_id=?").get(projectId) ?? null;
  const editorial = db.prepare("SELECT * FROM editorial_beats WHERE project_id=? ORDER BY timeline_start_ms").all(projectId);
  const shots = shotRows.map(shot => ({ ...shot, media: [...attempts.filter(attempt => attempt.shot_id === shot.id).map(media), ...coverageAttempts.filter(attempt => attempt.shot_id === shot.id).map(attempt => media({ ...attempt, operation: "coverage_keyframe", cost_usd: null }))],
    coverage: beats.filter(beat => beat.shot_id === shot.id).map(beat => ({ ...beat, keyframeAvailable: available(beat.keyframe_asset_path) })),
    contributions: record?.history.filter(item => item.scope.shotIds.includes(shot.id) || (!item.scope.shotIds.length && item.scope.sceneIds.includes(shot.scene_id))) ?? [],
    objections: record?.objections.filter(item => item.shotId === shot.id) ?? [],
    speech: utterances.filter(binding => binding.shot_id === shot.id).flatMap(binding => audio.filter(item => item.id === binding.source_audio_segment_id || item.original_segment_id === binding.source_audio_segment_id).flatMap(item => {
      const startMs = item.layer === "original_reading" ? binding.source_start_ms : item.start_ms + binding.source_start_ms - (item.original_start_ms ?? 0);
      const endMs = startMs + binding.source_end_ms - binding.source_start_ms;
      return startMs >= item.start_ms && endMs <= item.end_ms ? [{ id: item.id, bindingId: binding.id, layer: item.layer, path: item.source_path, startMs, endMs, available: available(item.source_path), approvedBy: binding.approved_by }] : [];
    })),
    scripture: { revision: planning?.id ?? null, source: scopedVerses(shot.verse_ref, savedSource?.text), reference: scopedVerses(shot.verse_ref, savedSource?.reference) },
    roleEvents: crewEvents.filter(event => { const output = event.output_json ? JSON.parse(event.output_json) as { directions?: Array<{shotId: string}>; findings?: Array<{shotId: string | null}> } : null; return [...output?.directions ?? [], ...output?.findings ?? []].some(item => item.shotId === shot.id); }),
    reviews: reviews.filter(item => item.subject_id === shot.id || clips.some(clip => clip.shot_id === shot.id && clip.id === item.subject_id)),
    selected: clips.filter(clip => clip.shot_id === shot.id).map(clip => ({ ...clip, media: attempts.find(attempt => attempt.id === clip.generation_attempt_id) ? media(attempts.find(attempt => attempt.id === clip.generation_attempt_id)!) : null }))
  }));
  const reel = shots.flatMap(shot => {
    const retained = shot.selected.filter(clip => clip.media?.kind === "video" && !clip.media.historical && clip.media.status === "accepted" && clip.timeline_end_ms > clip.timeline_start_ms);
    // Match the existing crew/editor's latest accepted assemble_shot rule.
    // Never append its component takes or older assemblies a second time.
    const assembled = retained.filter(clip => clip.media?.operation === "assemble_shot").sort((a, b) => {
      const left = attempts.find(item => item.id === a.generation_attempt_id)!, right = attempts.find(item => item.id === b.generation_attempt_id)!;
      return right.created_at - left.created_at || right.id.localeCompare(left.id);
    })[0];
    const selected = assembled ? [assembled] : retained;
    if (!assembled && selected.some((clip, i) => selected.some((other, j) => j !== i && clip.timeline_start_ms < other.timeline_end_ms && other.timeline_start_ms < clip.timeline_end_ms))) {
      holds.push({ id: `reel-selection:${shot.id}`, stage: "assembly", subjectId: shot.id, state: "uncertain", summary: "Several retained selections overlap in this shot and no current assembled-shot selection resolves them. Inspect the takes; this shot is excluded from the developing reel rather than guessing an edit.", at: project.updated_at });
      return [];
    }
    return selected.filter(clip => clip.media!.available).map(clip => ({ id: clip.id, shotId: shot.id, sceneId: shot.scene_id, label: `Scene ${shot.scene_sequence} · Shot ${shot.sequence} · ${shot.verse_ref ?? "Editorial"}`, path: clip.media!.path!, durationMs: clip.timeline_end_ms - clip.timeline_start_ms }));
  });
  for (const shot of shots) for (const clip of shot.selected) if (!clip.media?.available || clip.media.status !== "accepted" || clip.media.kind !== "video") holds.push({ id: clip.id, stage: "assembly", subjectId: shot.id, state: "uncertain", summary: "Selected clip is missing or lacks accepted video evidence. Excluded from the developing reel; original selection retained.", at: project.updated_at });
  const renderRow = db.prepare("SELECT id,result_asset_path,total_duration_ms,created_at FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId) as { id: string; result_asset_path: string; total_duration_ms: number; created_at: number } | undefined;
  const render = renderRow ? { ...renderRow, available: available(renderRow.result_asset_path), historical: !!cutover && renderRow.created_at < cutover.started_at } : null;
  if (render && !render.available) holds.push({ id: render.id, stage: "assembly", subjectId: render.id, state: "uncertain", summary: "Latest recorded chapter render is missing. A render record alone is not completed footage.", at: render.created_at });
  for (const item of audio.filter(item => !available(item.source_path))) holds.push({ id: `audio:${item.id}`, stage: item.layer === "original_reading" ? "ingestion" : "voice_lipsync", subjectId: item.id, state: "uncertain", summary: "Recorded source/cast audio file is missing. Its interval and history are retained; no replacement is inferred.", at: project.updated_at });
  for (const item of attempts.filter(item => item.status === "accepted" && !available(item.result_asset_path) && (!cutover || item.created_at >= cutover.started_at))) holds.push({ id: `media:${item.id}`, stage: item.operation === "lip_sync" ? "voice_lipsync" : "media_generation", subjectId: item.shot_id, state: "uncertain", summary: "Accepted media file is absent. The recorded approval does not establish available footage.", at: item.created_at });
  if (!executions.length && shotRows.length && !live.length) holds.push({ id: "legacy-stage-history", stage: project.stage, subjectId: projectId, state: "uncertain", summary: "This saved chapter has no durable stage execution history. Inspect retained assets and the existing recovery controls; no stage completion is inferred from a legacy status.", at: project.updated_at });
  const ledger = Number(db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS total FROM cost_ledger_entries WHERE project_id=?").get(projectId)!.total);
  const pending = decisions.filter(item => ["reserve_avatar_spend", "reserve_crew_spend"].includes(item.command_type)).filter(item => {
    const reservation = JSON.parse(item.payload) as { reservationId: string };
    return !decisions.some(other => ["settle_avatar_spend", "settle_crew_spend"].includes(other.command_type) && (JSON.parse(other.payload) as { reservationId: string }).reservationId === reservation.reservationId);
  });
  let spend: ReturnType<typeof checkFilmSpend> | null = null, costHold: string | null = null;
  try { spend = checkFilmSpend(db, projectId, 0); } catch (error) { costHold = (error as Error).message; }
  const costs = { ceilingUsd: 200, recordedUsd: ledger, outstandingReservedUsd: pending.reduce((sum, item) => sum + Number((JSON.parse(item.payload) as { upperBoundUsd: number }).upperBoundUsd), 0),
    committedUsd: spend?.committedUsd ?? null, remainingUsd: spend?.remainingUsd ?? null, hold: costHold,
    note: "Recorded estimates and reservations are not reconciled invoices. Included assistant/image usage and unreported charges are not asserted free. This view authorizes no spending." };
  // A detailed job/run/execution and its in-process observation are evidence
  // for the same activity, not two independently working agents/jobs.
  for (let i=work.length-1;i>=0;i--) {
    const observation = live.find(item => item.id === work[i]!.id);
    if (observation && (jobs.some(job => job.id === observation.subjectId && job.status !== "completed") || runs.some(run => run.id === observation.subjectId && run.status === "running") || (!observation.subjectId && executions.some(execution => execution.stage === observation.stage && execution.status === "running")))) work.splice(i,1);
  }
  const stages = STAGES.map(stage => {
    const execution = executions.find(item => item.stage === stage);
    const predatesRestart = !!cutover && ["media_generation", "voice_lipsync", "assembly", "qc"].includes(stage) && !!execution && (execution.completed_at ?? execution.started_at) < cutover.started_at;
    const stageWork = work.filter(item => item.stage === stage), stageHolds = holds.filter(item => item.stage === stage);
    const state: WorkState = stageHolds.find(item => item.state === "uncertain" || item.state === "failed")?.state ?? stageWork.find(item => item.state === "awaiting_external" || item.state === "queued")?.state ?? (stageWork.length ? "working" : stageHolds[0]?.state ?? (execution?.status === "completed" && !predatesRestart ? "finished" : "queued"));
    return { stage, state, executionId: execution?.id ?? null, summary: stageWork[0]?.summary ?? stageHolds[0]?.summary ?? (predatesRestart ? "Recorded completion predates the producer's media restart; it is historical evidence, not new-footage completion." : execution?.reason) ?? "No stage execution recorded. Pending work is not dispatched or completed.", at: execution?.completed_at ?? execution?.started_at ?? null };
  });
  const lastProgressAt = Math.max(0, ...executions.map(item => item.completed_at ?? item.started_at), ...jobs.map(item => item.updated_at), ...crewEvents.map(item => item.created_at), ...attempts.map(item => item.created_at), ...decisions.map(item => item.applied_at), ...runs.map(item => item.completed_at ?? item.created_at), ...reviews.map(item => item.created_at), ...soundtrackAttempts.map(item => item.created_at), render?.created_at ?? 0) || null;
  const current = holds.find(item => item.state === "uncertain" || item.state === "failed") ?? work.find(item => item.state === "awaiting_external") ?? work[0] ?? holds[0];
  return { project, observedAt: now, lastProgressAt, currentStage: current?.stage ?? project.stage, state: current?.state ?? (stages.every(item => item.state === "finished") && render?.available && !render.historical ? "finished" : "queued") as WorkState,
    nextAction: current ? current.state === "awaiting_external" ? "Wait for the existing external task; inspect its recorded progress." : current.state === "working" ? "Work is executing; inspect the latest saved contribution below." : current.state === "uncertain" ? "Reconcile retained work and provider evidence before retrying." : current.summary : costHold ?? "Continue through the existing chapter controls when applicable source, canon and review gates pass.",
    work, holds, stages, costs, scenes, shots, reel, render, programme: readProgrammePreview(db, projectId, render, audio, available), cutover: cutover ?? null, intro, ending, editorial, soundtrackAttempts, record: record ?? null, runs, crewEvents, reviews, decisions,
    audio: audio.map(item => ({ ...item, available: available(item.source_path) })), sound: sound.map(item => ({ ...item, available: available(item.path) })),
    note: "Saved production records are authoritative. Working requires execution ownership in this process; old running records are uncertain. Queued stages without an execution are planned, not submitted. Finishing is not field or release approval." };
}
export type ProductionView = ReturnType<typeof readProductionView>;
