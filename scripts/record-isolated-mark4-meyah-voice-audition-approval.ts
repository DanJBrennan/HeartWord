/** Record Dan's listening approval for the one reviewed Meyah Jesus 4:9 audition. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { approveEditionVoiceAudition, assertEditionVoiceAuditionApproved } from "../src/pipeline/language-edition-audition.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The voice approval must stay within the isolated worktree");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const segmentId="96ff1b8b-7b03-45fc-93d7-c6ee60d0f520";
const review=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-voice-audition-20261025","evidence.json"),"utf8")) as {
  projectId:string;sourceSegmentId:string;sourceStartMs:number;sourceEndMs:number;castPath:string;castSha256:string;sidecarSha256:string;planHash:string;
};
const candidate=JSON.parse(readFileSync(join(root,"review","meyah-mark4-jesus-v9-voice-audition-candidate.json"),"utf8")) as {
  projectId:string;sourceSegmentId:string;sourceStartMs:number;sourceEndMs:number;castPath:string;
};
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
if(review.projectId!==projectId||review.sourceSegmentId!==segmentId||review.sourceStartMs!==142703||review.sourceEndMs!==152394||
  candidate.projectId!==projectId||candidate.sourceSegmentId!==segmentId||candidate.castPath.replaceAll("\\","/")!==review.castPath)
  throw new Error("The reviewed Jesus 4:9 audition changed");
const cast=join(root,"assets",...review.castPath.split("/"));
if(sha(readFileSync(cast))!==review.castSha256||sha(readFileSync(`${cast}.json`))!==review.sidecarSha256)
  throw new Error("The audio heard by Dan or its current settings changed");
const dbPath=join(root,"db","heartword.sqlite"),db=new DatabaseSync(dbPath);
try{
  const prior=db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='approve_edition_voice_audition' AND undone=0")
    .get(projectId);
  if(!prior){
    const backup=join(root,"review","pre-audition-approval-20261025.sqlite");
    if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
  }
  const evidence="Dan listened to the original Meyah Jesus 4:9 quotation and its mapped Jesus-voice audition in the source-versus-cast review, then answered: Approve this audition. Words, pronunciation, voice identity, delivery and timing were the stated review criteria; this approval pins the current settings and does not approve bulk output, Avatar or film.";
  const approved=approveEditionVoiceAudition(db,root,projectId,{sourceSegmentIds:[segmentId],reviewer:"Dan",evidence});
  const current=assertEditionVoiceAuditionApproved(db,root,projectId);
  if(current.planHash!==review.planHash||current.castSha256!==review.castSha256||current.sidecarSha256!==review.sidecarSha256)
    throw new Error("The persisted audition approval differs from the heard candidate");
  const report={kind:"isolated_meyah_mark4_voice_audition_approval",projectId,statement:"Approve this audition",
    reviewer:"Dan",sourceSegmentId:segmentId,sourceStartMs:142703,sourceEndMs:152394,planHash:current.planHash,
    sourceSha256:current.sourceSha256,castSha256:current.castSha256,sidecarSha256:current.sidecarSha256,
    voiceId:current.voiceId,voiceVersionId:current.voiceVersionId,requestSettings:current.requestSettings,
    providerRequests:0,scope:"audition settings and heard 4:9 cast candidate; later audio/video/film remain separately reviewable"};
  writeFileSync(join(root,"review","meyah-mark4-jesus-v9-voice-audition-producer-approval.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({report,approvalCommandEvidence:approved.evidence},null,2));
}finally{db.close();}
