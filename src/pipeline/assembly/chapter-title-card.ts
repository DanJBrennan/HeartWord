import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEditionInputsCurrent, readLanguageEditionOrigin } from "../language-edition.js";

/** Real text over a clean establishing frame. Output creation is exclusive. */
export function buildChapterTitleCard(input: {
  backgroundFrame: string; bookChapter: string; languageName: string; outputVideo: string;
  durationMs: number; profile?: "mark4-serif-over-establishing";
}): { path: string; durationMs: number } {
  if (!input.bookChapter?.trim() || !input.languageName?.trim()) throw new Error("Verified book/chapter and language title strings are required.");
  if (!Number.isInteger(input.durationMs) || input.durationMs < 1000 || input.durationMs > 12000) throw new Error("Title duration must be an approved 1–12 second hold.");
  if (input.profile && input.profile !== "mark4-serif-over-establishing") throw new Error("Unknown title treatment.");
  const frame = resolve(input.backgroundFrame), output = resolve(input.outputVideo);
  if (!existsSync(frame)) throw new Error("Clean title-free establishing frame is missing.");
  if (!/\.mp4$/i.test(output) || existsSync(output)) throw new Error("A new exclusive MP4 output name is required.");
  mkdirSync(dirname(output),{recursive:true});
  const work = mkdtempSync(join(tmpdir(),"heartword-title-"));
  try {
    const still = join(work,"card.png");
    const painter = fileURLToPath(new URL("../../../scripts/build-chapter-title-card.py",import.meta.url));
    execFileSync(process.env.HEARTWORD_PYTHON || "python",[painter,frame,input.bookChapter,input.languageName,still],{stdio:["ignore","ignore","pipe"]});
    execFileSync("ffmpeg",["-v","error","-n","-loop","1","-i",still,"-t",(input.durationMs/1000).toFixed(3),
      "-vf","scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24","-c:v","libx264","-pix_fmt","yuv420p","-an",output],
      {stdio:["ignore","ignore","pipe"]});
    return {path:output,durationMs:input.durationMs};
  } catch (error) {
    // ffmpeg can leave a partial file after an error; this call owned only a
    // previously nonexistent output, so removing it cannot erase approved work.
    if (existsSync(output)) rmSync(output);
    throw error;
  } finally { rmSync(work,{recursive:true,force:true}); }
}

const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
type Candidate={path:string;sha256:string;durationMs:number;backgroundSha256:string;title:string;language:string};
function savedCandidate(db:DatabaseSync,projectId:string):Candidate|null{
  const row=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='build_edition_title_candidate' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}|undefined;
  return row?JSON.parse(row.payload) as Candidate:null;
}
/** Local, reviewable title media. Generating it never selects or approves it. */
export function buildEditionTitleCandidate(db:DatabaseSync,dataDir:string,projectId:string):Candidate{
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)throw new Error("A language-edition origin is required for this title.");
  assertEditionInputsCurrent(db,dataDir,projectId);
  const title=origin.preflight.target.title,background=origin.preflight.target.titleBackground;
  if(!background)throw new Error("The clean opening frame is not pinned.");
  const prior=savedCandidate(db,projectId);
  if(prior){const file=resolve(dataDir,"assets",prior.path);
    if(prior.backgroundSha256!==background.sha256 || prior.title!==title.bookChapter || prior.language!==title.languageName || prior.durationMs!==title.durationMs ||
        !existsSync(file) || digest(readFileSync(file))!==prior.sha256)throw new Error("Retained edition title candidate changed; review its saved evidence.");
    return prior;}
  const path=`generated/editorial/language-editions/${projectId}/title-${randomUUID()}.mp4`,absolute=resolve(dataDir,"assets",path);
  buildChapterTitleCard({backgroundFrame:resolve(dataDir,"assets",background.path),bookChapter:title.bookChapter,languageName:title.languageName,
    outputVideo:absolute,durationMs:title.durationMs,profile:title.profile});
  const candidate:Candidate={path,sha256:digest(readFileSync(absolute)),durationMs:title.durationMs,backgroundSha256:background.sha256,
    title:title.bookChapter,language:title.languageName};
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'build_edition_title_candidate',?,?,?)")
    .run(randomUUID(),projectId,sequence,JSON.stringify(candidate),`language-edition:${projectId}:title-candidate`,Date.now());
  return candidate;
}

/** Explicit producer selection uses the existing opening-beat manifest contract. */
export function acceptEditionTitleCandidate(db:DatabaseSync,dataDir:string,projectId:string,input:{sha256:string;reviewer:string;evidence:string}):{editorialBeatId:string;path:string}{
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)throw new Error("A language-edition origin is required.");
  if(!input?.reviewer?.trim()||!input.evidence?.trim()||!input.sha256)throw new Error("Named picture review, evidence and exact candidate hash are required.");
  assertEditionInputsCurrent(db,dataDir,projectId);
  const candidate=savedCandidate(db,projectId);
  if(!candidate||candidate.sha256!==input.sha256||digest(readFileSync(resolve(dataDir,"assets",candidate.path)))!==candidate.sha256)
    throw new Error("The selected title candidate is missing or changed.");
  const plan=db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(projectId) as {plan_json:string}|undefined;
  const title=plan?JSON.parse(plan.plan_json).titleCard as {title:string;language:string;durationMs:number;profile?:string}:null;
  if(!title||title.title!==candidate.title||title.language!==candidate.language||title.durationMs!==candidate.durationMs||title.profile!==origin.preflight.target.title.profile)
    throw new Error("Cast the target chapter and confirm its pinned opening plan before selecting the title.");
  const prior=db.prepare("SELECT id FROM editorial_beats WHERE project_id=? AND placement='pre_source' AND beat_type='title_card'").get(projectId) as {id:string}|undefined;
  if(prior){
    const selected=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='select_editorial_title_card' AND json_extract(payload,'$.editorialBeatId')=?").get(projectId,prior.id) as {payload:string}|undefined;
    if(selected){const saved=JSON.parse(selected.payload) as Candidate & {reviewer:string;evidence:string};
      if(saved.sha256===candidate.sha256 && saved.reviewer===input.reviewer.trim() && saved.evidence===input.evidence.trim())
        return {editorialBeatId:prior.id,path:candidate.path};}
    throw new Error("Another title beat or candidate is already retained; reconcile it before replacement.");
  }
  const now=Date.now(),id=randomUUID();db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare(`INSERT INTO editorial_beats(id,project_id,sequence,placement,beat_type,description,rationale,evidence,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)
      VALUES(?,?,1,'pre_source','title_card',?,?,?,?,0,?,'Target-language editorial title','accepted',?,?)`)
      .run(id,projectId,`${candidate.title} / ${candidate.language}`,"Pinned Mark 4 title treatment on a clean establishing frame.",input.evidence.trim(),candidate.durationMs,candidate.durationMs,input.reviewer.trim(),now);
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'select_editorial_title_card',?,?,?)")
      .run(randomUUID(),projectId,sequence,JSON.stringify({projectId,editorialBeatId:id,path:candidate.path,sha256:candidate.sha256,durationMs:candidate.durationMs,
        reviewer:input.reviewer.trim(),evidence:input.evidence.trim(),backgroundSha256:candidate.backgroundSha256}),`language-edition:${projectId}:title-selection`,now);
    db.exec("COMMIT");return {editorialBeatId:id,path:candidate.path};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
