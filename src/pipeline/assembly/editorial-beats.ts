import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type IntroPlan = { titleCard:{title:string;language:string;durationMs:number}; shots:Array<{role:"establishing"|"bridge"|"arrival";description:string;reason:string;evidence:string;durationMs:number}>; sourceClockStartMs:number };
type EndingPlan = { sourceClockEndMs:number; shots:Array<{role:"departure"|"journey"|"destination_hint";description:string;reason:string;currentEvidence:string;nextEvidence:string;durationMs:number}> };

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
