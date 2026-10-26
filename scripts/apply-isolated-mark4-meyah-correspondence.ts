/** Apply Dan's exact approved Meyah Mark 4 correspondence in the isolated DB.
 * Requires a separate named cast approval receipt; never opens HeartWordData.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { acceptEditionTitleCandidate } from "../src/pipeline/assembly/chapter-title-card.js";
import { assertEditionInputsCurrent, readLanguageEditionOrigin, readLanguageEditionPlan, reviseLanguageEdition, type EditionShotCorrespondence } from "../src/pipeline/language-edition.js";
import { materializeEditionCasting } from "../src/pipeline/language-edition-stages.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The edition data root must remain inside this isolated worktree");
const dbPath=join(root,"db","heartword.sqlite"),read=(path:string)=>JSON.parse(readFileSync(join(root,path),"utf8"));
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const draftPath=join(root,"review","meyah-mark4-full-correspondence-draft.json");
const castApprovalPath=join(root,"review","meyah-mark4-new-beat-cast-producer-approval.json");
if(!existsSync(castApprovalPath))throw new Error("Dan's named 34-beat cast approval is required before applying the target correspondence");
const draft=JSON.parse(readFileSync(draftPath,"utf8")) as {projectId:string;mainApprovalSha256:string;
  correspondence:EditionShotCorrespondence[];castReview:unknown[]};
const castApproval=JSON.parse(readFileSync(castApprovalPath,"utf8")) as {answer:string;draftSha256:string;projectId:string};
const editorialApproval=read("review/meyah-mark4-editorial-direction-title-storm-approval.json");
const mainApproval=read("review/meyah-mark4-main-shot-plan-producer-approval.json");
const technical=read("review/meyah-mark4-full-correspondence-dry-run.json");
if(draft.projectId!==projectId||castApproval.projectId!==projectId||castApproval.answer!=="Approve the cast list"||
    castApproval.draftSha256!==sha(readFileSync(draftPath))||draft.mainApprovalSha256!==mainApproval.proposalSha256||
    technical.correspondenceRows!==147||technical.scratchTargetShots!==145||draft.correspondence.length!==147||
    draft.castReview.length!==34)
  throw new Error("The approved full correspondence or technical rehearsal changed");
const db=new DatabaseSync(dbPath);
try{
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)throw new Error("The exact isolated Meyah edition origin is unavailable");
  const donorId=origin.preflight.donor.projectId;
  const protectedHash=()=>sha(Buffer.from(JSON.stringify({
    scenes:db.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY id").all(donorId),
    shots:db.prepare("SELECT sh.* FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sh.id").all(donorId),
    audio:db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY id").all(donorId),
    targetAudio:db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY id").all(projectId),
    render:db.prepare("SELECT * FROM chapter_render_manifests WHERE render_id=?").all(origin.preflight.donor.renderId),
  })));
  const protectedBefore=protectedHash();
  const count=()=>Number((db.prepare("SELECT COUNT(*) n FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)").get(projectId) as {n:number}).n);
  const plan=readLanguageEditionPlan(db,projectId);
  if(!plan)throw new Error("The isolated Meyah edition origin is unavailable");
  if(plan.revision){
    if(plan.revision.reviewer!=="Dan"||!isDeepStrictEqual(plan.revision.correspondence,draft.correspondence))
      throw new Error("A different target correspondence is already saved; preserve and reconcile it");
  }else{
    if(count()!==0)throw new Error("Target shots exist without a reviewed edition revision");
    assertEditionInputsCurrent(db,root,projectId);
    const backup=join(root,"review","pre-reviewed-stage3-20261025.sqlite");
    if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
    reviseLanguageEdition(db,projectId,{requestId:"meyah-mark4-reviewed-shot-map-20261025",
      expectedParentHash:plan.hash,correspondence:draft.correspondence,reviewer:"Dan",
      evidence:`Dan approved the exact 4:1–34 shot map ${mainApproval.proposalSha256}, storm editorial choices ${editorialApproval.stormShotPlan.editorialChoicesSha256}, and explicit new-beat cast list ${castApproval.draftSha256}. The 300 ms storm mouth-to-reaction correction preserves the approved picture and final sea. Source review ${technical.sourceApprovalId}.`},root);
  }
  const stage=materializeEditionCasting(db,root,projectId);
  if(!stage.ok||count()!==145)throw new Error(`Isolated stage 3 held: ${stage.reasoning}; target shots ${count()}`);
  const title=acceptEditionTitleCandidate(db,root,projectId,{sha256:editorialApproval.titleVisual.candidateSha256,
    reviewer:"Dan",evidence:`Dan approved the four-second Markus 4 / Meyah lake title visual, candidate SHA256 ${editorialApproval.titleVisual.candidateSha256}.`});
  if(protectedHash()!==protectedBefore)throw new Error("A protected donor or source record changed during isolated stage 3");
  const current=readLanguageEditionPlan(db,projectId)!;
  const report={kind:"applied_isolated_mark4_meyah_correspondence",projectId,planHash:current.hash,
    targetShots:count(),editionOmissions:2,sourceAudioChanged:false,donorRowsChanged:false,
    titleBeatId:title.editorialBeatId,titlePath:title.path,providerRequests:0,
    next:"Target media preparation, reviewed voice audition and actual editable film still required."};
  const reportPath=join(root,"review","meyah-mark4-reviewed-correspondence-application.json");
  writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({...report,reportPath},null,2));
}finally{db.close();}
