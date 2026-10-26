/** Rehearse the complete approved Meyah correspondence on a disposable DB.
 * No provider is called and the isolated production database is opened read-only
 * for the backup step. The scratch database is deleted after the rehearsal.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readLanguageEditionPlan, reviseLanguageEdition, type EditionShotCorrespondence } from "../src/pipeline/language-edition.js";
import { materializeEditionCasting } from "../src/pipeline/language-edition-stages.js";

const checkout = process.cwd();
const root = join(checkout,"output","mark4-donor-20261024");
const sourceDb = join(root,"db","heartword.sqlite");
const read = (path:string) => JSON.parse(readFileSync(join(root,path),"utf8"));
const mainPath = "assets/review/meyah-mark4-main-shot-review-20261025/proposal.json";
const stormPath = "assets/review/meyah-mark4-storm-shot-review-20261025/assembly-ready-proposal.json";
const main = read(mainPath),storm = read(stormPath);
const mainApproval = read("review/meyah-mark4-main-shot-plan-producer-approval.json");
const stormApproval = read("review/meyah-mark4-editorial-direction-title-storm-approval.json");
const sourceApproval = read("review/meyah-mark4-speaker-map-producer-approval.json");
const sha = (value:Buffer|string) => createHash("sha256").update(value).digest("hex");
if (sha(readFileSync(join(root,mainPath))) !== mainApproval.proposalSha256 ||
    sha(readFileSync(join(root,"assets/review/meyah-mark4-storm-shot-review-20261025/proposal.json"))) !== stormApproval.stormShotPlan.currentPaperEditSha256 ||
    storm.parentApprovedProposalSha256 !== stormApproval.stormShotPlan.currentPaperEditSha256 ||
    main.sourceReviewId !== sourceApproval.reviewId || storm.sourceReviewId !== sourceApproval.reviewId ||
    main.sceneEndMs !== storm.sceneStartMs || storm.sceneEndMs !== 805685) {
  throw new Error("The approved isolated paper edits are stale");
}
const projectId:string = sourceApproval.projectId;
const original = new DatabaseSync(sourceDb,{readOnly:true});
const segmentRows = original.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,speaker_character_id AS speaker
  FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms`).all(projectId) as Array<{
    id:string;startMs:number;endMs:number;speaker:string|null;
  }>;
const commands = original.prepare(`SELECT payload FROM edit_commands WHERE project_id=? AND command_type='confirm_continuous_speech'
  AND undone=0`).all(projectId) as Array<{payload:string}>;
const castNames = original.prepare("SELECT id,name FROM characters WHERE canon_status='approved' AND region='Papuan'").all() as Array<{id:string;name:string}>;
const castByName = new Map(castNames.map(row=>[row.name,row.id]));
const runs = commands.map(row => JSON.parse(row.payload).run as {
  id:string;characterId:string;startMs:number;endMs:number;members:Array<{id:string}>;
});
const donor = original.prepare(`SELECT sh.id,sc.sequence AS sceneSequence FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=(SELECT json_extract(payload,'$.preflight.donor.projectId') FROM edit_commands
    WHERE project_id=? AND command_type='derive_language_edition' ORDER BY sequence DESC LIMIT 1)`).all(projectId) as Array<{id:string;sceneSequence:number}>;
original.close();
if (segmentRows.length !== 54 || runs.length !== 10 || !donor.length) throw new Error("Isolated source or donor evidence changed");

const J="Jesus",P="Peter",N="John son of Zebedee",A="Andrew";
const namedCastForAdded = new Map<string,string[]>([
  ["1:48317",[J,"Principal scribe","Crowd witness (young woman)","Crowd witness (older woman, cream headscarf)" ]],
  ["1:152394",[J,P,N,"Crowd witness (young man)","Crowd witness (elder, grey beard)" ]],
  ["2:175416",[J,P,N,A]],["2:193666",[J,P,N]],["2:208308",[J,"Thomas","Judas Iscariot"]],
  ["2:231408",[J,P,N,"James son of Zebedee"]],
  ["3:258253",[J,P,N]],["3:273096",[]],["3:293099",[]],["3:297906",[J,P,N]],
  ["3:310713",[]],["3:322852",[]],["3:331263",[J,"Thaddaeus (Jude)","James son of Alphaeus"]],
  ["3:359007",[]],["3:365399",[]],["3:371791",[J,"Matthew (Levi)","Philip the Apostle"]],
  ["3:400810",[]],
  ["4:424752",[]],["4:449221",["Crowd witness (elder, grey beard)"]],
  ["4:460444",[N,"James son of Zebedee"]],["4:475383",["Philip the Apostle","Thomas"]],
  ["4:481183",[P,A]],["4:491000",["Philip the Apostle","Thomas"]],
  ["4:499190",[J,"Philip the Apostle","Thomas",P,A]],["4:507380",[P,A]],
  ["5:529269",[]],["5:534185",[]],["5:551602",[]],["5:556662",[]],
  ["5:569723",[]],["5:574494",[]],
  ["6:657508",[J,P,N,A]],
  ["7:682893",[J,P,N,A]],["7:741826",[P,N,A]],
]);

type Proposed = {placement:number|string|null;scene?:number;donorShotId:string;durationMs:number;kind?:string;treatment?:string;
  pipelineTreatment:string;targetStartMs:number;targetEndMs:number;reason:string;verseRef:string;action:string;
  addedForEdition?:boolean;addedAction?:string;addedVerseRef?:string;narratorOnlyAction?:string;
  picture?:{kind:string;attemptId?:string;path?:string;sha256?:string;sourceStartMs?:number;durationMs?:number};
  targetSpeech?:{speaker:string;startMs:number;endMs:number};
};
const byScene = new Map<number,Array<Proposed & {anchorPlacement:number}>>();
for (const [sceneNumber,sourceRows] of [main.rows,storm.rows].entries()) {
  for (const raw of sourceRows as Proposed[]) {
    const scene = sceneNumber === 0 ? raw.scene! : 7;
    const rows = byScene.get(scene)??[];
    const placement = typeof raw.placement === "number" ? raw.placement :
      typeof raw.placement === "string" && raw.placement.startsWith("after-") ? Number(raw.placement.slice(6)) :
      rows.at(-1)?.anchorPlacement;
    if (!placement) throw new Error("An added beat has no donor placement anchor");
    rows.push({...raw,anchorPlacement:placement});
    byScene.set(scene,rows);
  }
}
const correspondence:EditionShotCorrespondence[] = [];
const shotCount = new Map<number,number>();
const castReview:Array<{scene:number;targetStartMs:number;verseRef:string;action:string;castNames:string[];castIds:string[]}> = [];
for (let scene=1;scene<=7;scene++) {
  const rows = byScene.get(scene)??[];
  const inherited = rows.filter(row => !row.addedForEdition);
  shotCount.set(scene,inherited.length);
  const placementIds = new Set(inherited.map(row => row.anchorPlacement));
  if (placementIds.size !== inherited.length || Math.min(...placementIds) !== 1 || Math.max(...placementIds) !== inherited.length) {
    throw new Error(`Scene ${scene} lost or repeated an inherited donor placement`);
  }
  // The producer approved these rows in source-clock picture order. Sorting
  // by the old donor anchor would silently move spoken picture out of sync.
  for(let index=1;index<rows.length;index++)if(rows[index]!.targetStartMs<rows[index-1]!.targetStartMs)
    throw new Error(`Scene ${scene} source-clock picture order went backwards`);
  for (const row of rows) {
    const treatment = row.pipelineTreatment as EditionShotCorrespondence["treatment"];
    const speech = row.targetSpeech;
    const segment = speech ? segmentRows.find(value => value.startMs <= speech.startMs && value.endMs > speech.startMs) : null;
    const run = speech ? runs.find(value => value.startMs <= speech.startMs && value.endMs >= speech.endMs &&
      value.members.some(member => member.id === segment?.id)) : null;
    if (speech && (!segment || !run || !segment.speaker || run.characterId !== segment.speaker ||
        speech.endMs-speech.startMs !== row.durationMs)) throw new Error(`Unbound visible speech in scene ${scene}`);
    const reason = row.reason || (treatment==="replace_avatar"
      ? `Dan-approved target-language Jesus speech at ${speech!.startMs}–${speech!.endMs} ms over the donor's same story action.`
      : `Retain the donor's ${row.verseRef} silent picture with the reviewed Meyah source interval ${row.targetStartMs}–${row.targetEndMs} ms.`);
    const names = row.addedForEdition ? namedCastForAdded.get(`${scene}:${row.targetStartMs}`) : undefined;
    if (row.addedForEdition && !names) throw new Error(`New beat ${scene}:${row.targetStartMs} lacks an explicit cast choice`);
    const castIds = names?.map(name=>{const id=castByName.get(name);if(!id)throw new Error(`Unrecognized approved cast: ${name}`);return id;});
    if (names && castIds) castReview.push({scene,targetStartMs:row.targetStartMs,verseRef:row.verseRef,
      action:row.action,castNames:names,castIds});
    const item:EditionShotCorrespondence = {donorShotId:row.donorShotId,
      targetSegmentId:segment?.id??null,targetSpeechRunId:run?.id??null,
      targetStartMs:speech?.startMs??null,targetEndMs:speech?.endMs??null,treatment,reason,
      ...(row.addedForEdition?{addedForEdition:true,addedAction:row.addedAction!,addedVerseRef:row.addedVerseRef!,addedCharacterIds:castIds!}:{}),
      ...(row.narratorOnlyAction?{narratorOnlyAction:row.narratorOnlyAction}:{}),
      ...(row.picture?.kind==="accepted_handle"?{pictureReuse:{attemptId:row.picture.attemptId!,
        sourceStartMs:row.picture.sourceStartMs!,durationMs:row.picture.durationMs!,
        path:row.picture.path,sha256:row.picture.sha256}}:{})};
    correspondence.push(item);
  }
}
if (correspondence.length !== 147 || [...shotCount.values()].reduce((a,b)=>a+b,0)!==113 ||
    correspondence.filter(row=>row.addedForEdition).length!==34 ||
    correspondence.filter(row=>row.treatment==="omit_picture").length!==2 || castReview.length!==34) throw new Error("Full target correspondence count changed");
const draftPath = join(root,"review","meyah-mark4-full-correspondence-draft.json");
writeFileSync(draftPath,JSON.stringify({kind:"read_only_correspondence_draft",status:"not_applied",
  projectId,mainApprovalSha256:mainApproval.proposalSha256,
  stormApprovedSha256:stormApproval.stormShotPlan.currentPaperEditSha256,
  stormAssemblyRefinementSha256:sha(readFileSync(join(root,stormPath))),
  targetPictureStartMs:0,targetPictureEndMs:805685,castReview,correspondence},null,2)+"\n");
const esc=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const tc=(ms:number)=>`${Math.floor(ms/60000).toString().padStart(2,"0")}:${((ms%60000)/1000).toFixed(3).padStart(6,"0")}`;
const castPagePath=join(root,"assets","review","meyah-mark4-new-beat-cast-review-20261025.html");
const castRows=castReview.map((row,index)=>`<tr id="beat-${index+1}"><td>${index+1}<br>Scene ${row.scene}<br>${tc(row.targetStartMs)}</td><td>${esc(row.verseRef)}<br>${esc(row.action)}</td><td>${row.castNames.length?row.castNames.map(esc).join("<br>"):"<em>No named character</em>"}</td></tr>`).join("");
writeFileSync(castPagePath,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 new-beat cast</title><style>body{margin:0;background:#e9e8e2;color:#1b3037;font:16px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:1.5rem}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #cbd5d4;padding:.65rem}th{background:#d8e7e6}td:first-child{width:125px}td:last-child{width:250px}.note{background:#fff2cf;padding:1rem;border-left:5px solid #a97419}a{color:#075d7b}</style><main><h1>Meyah Mark 4 · cast for new picture beats</h1><p class="note">For your cast review. The 4:1–34 shot map and storm picture direction are already approved. These 34 new beats each select an explicit subset of the existing approved Papuan scene cast. “No named character” is for a landscape, plant, or anonymous farmer detail. Original donor cast and scenes remain unchanged. This draft has not been applied to the isolated project.</p><p><a href="/media/review/meyah-mark4-main-shot-review-20261025/index.html">Approved main picture map</a> · <a href="/media/review/meyah-mark4-storm-shot-review-20261025/index.html">Approved storm picture map</a>. The final 4:40 Jesus mouth is shortened by 300 ms and the following group reaction extended by 300 ms for assembly timing; the final sea is unchanged.</p><table><thead><tr><th>Beat</th><th>Approved new action</th><th>Proposed named cast</th></tr></thead><tbody>${castRows}</tbody></table><p>Every listed name is an approved Papuan character already present in that donor narrative scene. Empty sets create no named character link for the target shot.</p></main></html>`,"utf8");

const temp = mkdtempSync(join(tmpdir(),"heartword-meyah-correspondence-"));
const copy = join(temp,"heartword.sqlite");
let scratch:DatabaseSync|undefined;
try {
  execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",sourceDb,copy]);
  scratch = new DatabaseSync(copy);
  const parent = readLanguageEditionPlan(scratch,projectId);
  if (!parent?.hash) throw new Error("The target edition has no parent plan hash");
  const revision = reviseLanguageEdition(scratch,projectId,{requestId:"technical-dry-run-mark4-meyah-20261025",
    expectedParentHash:parent.hash,correspondence,reviewer:"Codex technical rehearsal",
    evidence:"Disposable-copy structural check of Dan-approved main and storm picture plans; no producer decision is recorded in the isolated project."},root);
  for (const [index,item] of revision.revision.correspondence.entries()) {
    const reuse=item.pictureReuse;
    if (!reuse) continue;
    const selected=scratch.prepare(`SELECT ga.result_asset_path AS path FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id
      WHERE ga.id=? AND ga.shot_id=? AND ga.operation='generate_final_video' AND ga.status='accepted' LIMIT 1`)
      .get(reuse.attemptId,item.donorShotId) as {path:string}|undefined;
    if (!reuse.path || !reuse.sha256 || selected?.path?.replaceAll("\\","/")!==reuse.path || sha(readFileSync(join(root,"assets",reuse.path)))!==reuse.sha256)
      throw new Error(`Selected handle ${index} changed: ${reuse.attemptId} / ${selected?.path} / ${reuse.path}`);
  }
  const stage = materializeEditionCasting(scratch,root,projectId);
  if (!stage.ok) throw new Error(`Stage 3 rejected the approved picture draft: ${stage.reasoning}`);
  const targetCount = Number((scratch.prepare(`SELECT COUNT(*) n FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)`).get(projectId) as {n:number}).n);
  if (targetCount !== 145) throw new Error(`Stage 3 created ${targetCount} target shots in scratch, expected 145`);
  const report = {kind:"technical_correspondence_dry_run",projectId,
    sourceApprovalId:sourceApproval.reviewId,mainApprovalSha256:mainApproval.proposalSha256,
    correspondenceRows:correspondence.length,inheritedPlacements:113,newSilentBeats:34,editionOmissions:2,
    scratchTargetShots:targetCount,stage3Reasoning:stage.reasoning,revisionHash:revision.revision.revisionHash,
    isolatedDatabaseMutated:false,providerRequests:0};
  const reportPath = join(root,"review","meyah-mark4-full-correspondence-dry-run.json");
  writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({...report,draftPath,reportPath,
    castReviewUrl:"http://127.0.0.1:4002/media/review/meyah-mark4-new-beat-cast-review-20261025.html"},null,2));
} finally {
  scratch?.close();
  unlinkSync(copy);
  rmdirSync(temp);
}
