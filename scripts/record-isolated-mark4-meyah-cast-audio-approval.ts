/** Pin Dan's review of the nine new Meyah cast takes plus the 4:9 audition. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { assertEditionVoiceAuditionApproved } from "../src/pipeline/language-edition-audition.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Cast-audio approval must stay inside the isolated worktree");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const packPath=join(root,"assets","review","meyah-mark4-bulk-voice-review-20261025","evidence.json");
const pack=JSON.parse(readFileSync(packPath,"utf8")) as {projectId:string;planHash:string;cards:Array<{
  verseRef:string;castUrl:string;castSha256:string;sidecarSha256:string;sourceSha256:string;sourceUrl:string;
}>};
const full=JSON.parse(readFileSync(join(root,"review","meyah-mark4-full-cast-master.json"),"utf8")) as
  {projectId:string;planHash:string;mappedRows:number;characterRows:number;narrationRows:number};
if(pack.projectId!==projectId||full.projectId!==projectId||pack.planHash!==full.planHash||pack.cards.length!==10||
  full.mappedRows!==54||full.characterRows!==30||full.narrationRows!==24)
  throw new Error("The heard ten-run cast pack or full source map changed");
for(const card of pack.cards){
  if(!card.castUrl.startsWith("/media/")||!card.sourceUrl.startsWith("/media/"))throw new Error("A heard audio path is invalid");
  const cast=join(root,"assets",...card.castUrl.slice(7).split("/"));
  const source=join(root,"assets",...card.sourceUrl.slice(7).split("/"));
  if(sha(readFileSync(cast))!==card.castSha256||sha(readFileSync(`${cast}.json`))!==card.sidecarSha256||
    sha(readFileSync(source))!==card.sourceSha256)throw new Error(`The heard audio changed for ${card.verseRef}`);
}
const dbPath=join(root,"db","heartword.sqlite"),db=new DatabaseSync(dbPath);
try{
  const proof=assertEditionVoiceAuditionApproved(db,root,projectId);
  if(proof.planHash!==pack.planHash)throw new Error("The approved audition belongs to another plan");
  const previous=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_edition_cast_audio' AND undone=0 ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  const payload={kind:"approved_edition_cast_audio",projectId,planHash:pack.planHash,reviewer:"Dan",
    statement:"Approve the new cast audio",reviewedSourceVersusCastPackSha256:sha(readFileSync(packPath)),
    takes:pack.cards.map(card=>({verseRef:card.verseRef,castSha256:card.castSha256,sidecarSha256:card.sidecarSha256,
      sourceReviewClipSha256:card.sourceSha256})),
    scope:"All ten reviewed Meyah Mark 4 Jesus/Peter cast takes may be used for this film; this does not approve Kling Avatar video, picture, assembly, QC or distribution."};
  if(previous){
    if(JSON.stringify(JSON.parse(previous.payload))!==JSON.stringify(payload))throw new Error("A different bulk cast approval is already saved");
  }else{
    const backup=join(root,"review","pre-bulk-cast-approval-20261025.sqlite");
    if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'approve_edition_cast_audio',?,?,?)")
      .run(randomUUID(),projectId,sequence,JSON.stringify(payload),"meyah-mark4-reviewed-bulk-cast-audio",Date.now());
  }
  const report={...payload,providerRequests:0,liveDatabaseOpened:false};
  writeFileSync(join(root,"review","meyah-mark4-bulk-cast-audio-producer-approval.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({projectId,approvedTakes:payload.takes.length,statement:payload.statement,planHash:payload.planHash,providerRequests:0},null,2));
}finally{db.close();}
