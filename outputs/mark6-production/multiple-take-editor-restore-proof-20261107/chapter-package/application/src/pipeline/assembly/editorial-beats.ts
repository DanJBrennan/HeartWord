import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { getAudioDurationMs } from "../ingestion/detect-silences.js";
import type { EditorialOpeningBeat } from "../creative-direction/crew-types.js";
import type { DatabaseSync } from "node:sqlite";

type IntroPlan = { titleCard:{title:string;language:string;durationMs:number}; shots:Array<{role:"establishing"|"bridge"|"arrival";description:string;reason:string;evidence:string;durationMs:number}>; sourceClockStartMs:number };
type EndingPlan = { sourceClockEndMs:number; shots:Array<{role:"departure"|"journey"|"destination_hint";description:string;reason:string;currentEvidence:string;nextEvidence:string;durationMs:number}> };

/** Resolve already-selected editorial media from its retained typed commands.
 * No generation, source row, Scripture shot or new approval is created here. */
export function readAcceptedEditorialOpening(db: DatabaseSync, dataDir: string, projectId: string): EditorialOpeningBeat[] {
  return readAcceptedEditorialMedia(db, dataDir, projectId, "opening");
}

/** Post-source title material is credits, never a narrative chapter handoff.
 * Return relative timing: the actual cut (including source pauses) determines
 * where these beats begin, rather than a provisional database source end. */
export function readAcceptedEditorialClosing(db: DatabaseSync, dataDir: string, projectId: string): EditorialOpeningBeat[] {
  return readAcceptedEditorialMedia(db, dataDir, projectId, "closing");
}

function readAcceptedEditorialMedia(db: DatabaseSync, dataDir: string, projectId: string, kind: "opening" | "closing"): EditorialOpeningBeat[] {
  const beats = db.prepare(`SELECT id,description,duration_ms,timeline_start_ms,timeline_end_ms,status,approved_by
    FROM editorial_beats WHERE project_id=? AND ${kind === "opening" ? "placement='pre_source'" : "placement='post_source' AND beat_type='title_card'"} ORDER BY timeline_start_ms,sequence`).all(projectId);
  const base = kind === "closing" && beats.length ? Number(beats[0]!.timeline_start_ms) : 0;
  let cursor = 0;
  return beats.map(beat => {
    if (beat.status !== "accepted" || !String(beat.approved_by).trim() || Number(beat.timeline_start_ms) !== base + cursor || Number(beat.timeline_end_ms) !== base + cursor + Number(beat.duration_ms)) throw new Error(`The approved editorial ${kind} needs complete, ordered, reviewed media before chapter assembly.`);
    const command = db.prepare(`SELECT payload FROM edit_commands WHERE project_id=? AND undone=0
      AND command_type IN('select_editorial_media','select_editorial_title_card') AND json_extract(payload,'$.editorialBeatId')=? ORDER BY sequence DESC LIMIT 1`).get(projectId,String(beat.id));
    const media = command ? JSON.parse(String(command.payload)) as { projectId?: string; path?: string; sha256?: string; durationMs?: number; probe?: { format?: { duration?: string } } } : null;
    if (!media || media.projectId !== projectId || typeof media.path !== "string" || typeof media.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(media.sha256)) throw new Error("Selected editorial media lacks its exact project and file proof.");
    const assets = resolve(dataDir,"assets"), path = resolve(assets,media.path), local = relative(assets,path);
    if (isAbsolute(media.path) || !local || local === ".." || local.startsWith("../") || local.startsWith("..\\") || isAbsolute(local)) throw new Error("Selected editorial media must be inside the project asset area.");
    const declaredDuration = media.durationMs ?? Number(media.probe?.format?.duration)*1000;
    if (!Number.isFinite(declaredDuration) || createHash("sha256").update(readFileSync(path)).digest("hex") !== media.sha256 || Math.abs(getAudioDurationMs(path)-Number(beat.duration_ms)) > 1 || Math.abs(declaredDuration-Number(beat.duration_ms)) > 1) throw new Error("Selected editorial media changed or no longer matches its approved duration.");
    const startMs = cursor; cursor += Number(beat.duration_ms);
    return { id: String(beat.id), label: String(beat.description), path: media.path, sha256: media.sha256, durationMs: Number(beat.duration_ms), startMs, endMs: cursor };
  });
}

/** Turns already-approved editorial proposals into timeline-addressable beats.
 * It never creates media or changes the source clock. */
export function materializeEditorialBeats(db:DatabaseSync,input:{projectId:string;approvedBy:string}) {
  if (!input.approvedBy.trim()) throw new Error("A named producer approval is required.");
  const introRow=db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(input.projectId) as {plan_json:string}|undefined;
  const endingRow=db.prepare("SELECT plan_json FROM chapter_ending_plans WHERE project_id=?").get(input.projectId) as {plan_json:string}|undefined;
  if (!introRow || !endingRow) throw new Error("Both approved opening and ending proposals are required.");
  const intro=JSON.parse(introRow.plan_json) as IntroPlan, ending=JSON.parse(endingRow.plan_json) as EndingPlan;
  const existing=db.prepare("SELECT COUNT(*) count FROM editorial_beats WHERE project_id=?").get(input.projectId) as {count:number};
  if (existing.count) return {created:0,reused:true};
  let preCursor=0, postCursor=intro.sourceClockStartMs+ending.sourceClockEndMs, created=0, sequence=1, now=Date.now();
  const insert=db.prepare(`INSERT INTO editorial_beats (id,project_id,sequence,placement,beat_type,description,rationale,evidence,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'approved_for_generation',?,?)`);
  const add=(placement:"pre_source"|"post_source",type:string,description:string,rationale:string,evidence:string|null,duration:number,label:string) => {
    const start=placement === "pre_source" ? preCursor : postCursor, end=start+duration;
    insert.run(randomUUID(),input.projectId,sequence++,placement,type,description,rationale,evidence,duration,start,end,label,input.approvedBy.trim(),now);
    if (placement === "pre_source") preCursor=end; else postCursor=end; created++;
  };
  add("pre_source","title_card",`${intro.titleCard.title} title card`,"Producer-approved chapter title material.",null,intro.titleCard.durationMs,`Editorial title card (${intro.titleCard.language})`);
  for (const shot of intro.shots) add("pre_source",shot.role,shot.description,shot.reason,shot.evidence,shot.durationMs,"Pre-source editorial opening");
  for (const shot of ending.shots) add("post_source",shot.role,shot.description,shot.reason,`${shot.currentEvidence} / ${shot.nextEvidence}`,shot.durationMs,"Post-source editorial handoff");
  return {created,reused:false};
}
