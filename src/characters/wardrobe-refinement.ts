import {createHash,randomUUID} from "node:crypto";
import {copyFileSync,constants,mkdirSync,readFileSync} from "node:fs";
import {dirname,join,isAbsolute,relative,resolve} from "node:path";
import type {DatabaseSync} from "node:sqlite";

// Additive character versions and existing review records are the authority.
// There is no parallel canon database, automatic generation or film mutation.
const PREFIX="HeartWord wardrobe refinement v1\n";
export const wardrobeChecks=["construction","layers","colors","drape","fringe","headCovering","footwear"] as const;
export const wardrobeViews=["front","back","side","seated","neckline","fringe","headCovering"] as const;
type Check=typeof wardrobeChecks[number];
export type WardrobeProposal={projectId:string;baseVersionId:string;versionLabel:string;reason:string;gaps:string[];
  identityAssetId:string;wardrobeAssetId:string;identityNotes:string;facts:Record<Check,string>;
  evidence:Array<{ref:string;classification:"evidence"|"uncertain"|"producer_choice";limitations:string}>;
  unresolvedDecisions:string[]};
type Version={id:string;character_id:string;version_label:string;status:string;voice_provider:string|null;voice_id:string|null;notes:string|null;locked_visual_facts:string|null};
type Asset={id:string;category:string;path:string;content_hash:string|null;imported_from:string|null;asset_role:string;story_state:string|null;available_from_verse:string|null;available_through_verse:string|null};
type Event={kind:string;[key:string]:unknown};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text=(value:unknown):value is string=>typeof value==="string"&&value.trim().length>0;
function file(root:string,path:string) {
  const base=resolve(root,"assets"), target=resolve(base,path),rel=relative(base,target);
  if(!rel||rel.startsWith("..")||isAbsolute(rel))throw new Error("Reference must stay inside assets.");
  return target;
}
const hashFile=(root:string,path:string)=>createHash("sha256").update(readFileSync(file(root,path))).digest("hex");
function version(db:DatabaseSync,id:string):Version {
  const row=db.prepare("SELECT * FROM character_versions WHERE id=?").get(id) as Version|undefined;
  if(!row)throw new Error("Unknown character version.");return row;
}
const assets=(db:DatabaseSync,id:string)=>db.prepare("SELECT * FROM character_assets WHERE character_version_id=? ORDER BY id").all(id) as Asset[];
function verifiedAssets(db:DatabaseSync,root:string,id:string) {
  return assets(db,id).map(a=>{
    const hash=hashFile(root,a.path);
    if(a.content_hash&&a.content_hash.toLowerCase()!==hash)throw new Error("Reference bytes changed: "+a.path);
    return {...a,sha256:hash};
  });
}
function basis(db:DatabaseSync,root:string,id:string) {
  const {status:_,...v}=version(db,id);
  return digest({version:v,assets:verifiedAssets(db,root,id)});
}
function events(db:DatabaseSync,id:string):Array<Event&{id:string}> {
  return db.prepare("SELECT id,note,created_at FROM review_notes WHERE subject_type='character_version' AND subject_id=? AND note LIKE ? ORDER BY created_at,id")
    .all(id,PREFIX+"%") .map(r=>({...JSON.parse(String(r.note).slice(PREFIX.length)) as Event,id:String(r.id),recordedAt:Number(r.created_at)}));
}
function append(db:DatabaseSync,project:string,id:string,event:Event) {
  const noteId=randomUUID();
  // Ordering is deterministic even when several decisions occur in one ms.
  const last=db.prepare("SELECT MAX(created_at) t FROM review_notes WHERE subject_id=?").get(id) as {t:number|null};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'character_version',?,?,?,0,?)")
    .run(noteId,project,id,["review","promotion"].includes(event.kind)?"human":"qc",PREFIX+JSON.stringify(event),Math.max(Date.now(),(last.t??0)+1));
  return noteId;
}
function transaction<T>(db:DatabaseSync,action:()=>T):T {
  db.exec("BEGIN IMMEDIATE");try {const result=action();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}
}
export function refinementDetail(db:DatabaseSync,root:string,id:string) {
  const v=version(db,id), history=events(db,id),start=history.find(e=>e.kind==="proposal");
  if(!start)throw new Error("Not a wardrobe refinement candidate.");
  const proposal=start.proposal as WardrobeProposal;
  const refs=verifiedAssets(db,root,id);
  const candidateHash=digest({version:v,proposal,assets:refs});
  const reviews=db.prepare("SELECT id,source,note,created_at FROM review_notes WHERE subject_type='character_version' AND subject_id=? ORDER BY created_at,id").all(id);
  return {version:v,proposal,base:version(db,proposal.baseVersionId),baseAssets:verifiedAssets(db,root,proposal.baseVersionId),assets:refs,history,reviews,candidateHash,baseHash:String(start.baseHash)};
}
export function createWardrobeCandidate(db:DatabaseSync,root:string,characterId:string,input:WardrobeProposal) {
  if(!input||!text(input.projectId)||!text(input.baseVersionId)||!text(input.versionLabel)||!text(input.reason)||
    !text(input.identityNotes)||!Array.isArray(input.gaps)||!input.gaps.length||!input.gaps.every(text)||!Array.isArray(input.evidence)||!input.evidence.length||
    !input.evidence.every(e=>text(e.ref)&&text(e.limitations)&&["evidence","uncertain","producer_choice"].includes(e.classification))||
    !Array.isArray(input.unresolvedDecisions)||!input.unresolvedDecisions.every(text)||!wardrobeChecks.every(k=>text(input.facts?.[k])))throw new Error("Complete proposal, evidence, gaps and concrete garment facts are required.");
  return transaction(db,()=>{
    const base=version(db,input.baseVersionId);
    const c=db.prepare("SELECT * FROM characters WHERE id=? AND canon_status='approved' AND region='Papuan'").get(characterId);
    const project=db.prepare("SELECT language FROM projects WHERE id=?").get(input.projectId);
    const approved=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").all(characterId);
    if(!c||!project||String(project.language).toLowerCase()!=="hatam"||base.character_id!==characterId||base.status!=="approved"||approved.length!==1)throw new Error("Need the single approved Papuan version and a Hatam review project.");
    const refs=verifiedAssets(db,root,base.id);
    if(!refs.some(a=>a.id===input.identityAssetId&&a.asset_role!=="comparison_proof")||!refs.some(a=>a.id===input.wardrobeAssetId&&a.category==="body_pose"&&a.asset_role!=="comparison_proof"))throw new Error("Exact approved identity and body wardrobe references are required.");
    const id=randomUUID();
    db.prepare("INSERT INTO character_versions(id,character_id,version_label,status,voice_provider,voice_id,notes,locked_visual_facts,created_at) VALUES(?,?,?,'candidate',?,?,?,?,?)")
      .run(id,characterId,input.versionLabel,base.voice_provider,base.voice_id,"Wardrobe candidate: "+input.reason,base.locked_visual_facts,Date.now());
    append(db,input.projectId,id,{kind:"proposal",proposal:input,baseHash:basis(db,root,base.id),identityVersionId:base.id,voiceApproval:"unchanged; no new voice approval"});
    return refinementDetail(db,root,id);
  });
}
export function addWardrobeReference(db:DatabaseSync,root:string,id:string,input:{sourcePath:string;views:string[];prompt:string;referenceHashes:Array<{assetId:string;sha256:string}>}) {
  if(!input||!text(input.sourcePath)||!text(input.prompt)||!Array.isArray(input.views)||!input.views.length||!input.views.every(v=>(wardrobeViews as readonly string[]).includes(v))||!Array.isArray(input.referenceHashes))throw new Error("Source, prompt, explicit views and input hashes are required.");
  const detail=refinementDetail(db,root,id);
  if(detail.version.status!=="candidate")throw new Error("Only candidates can receive references.");
  if(detail.assets.length)throw new Error("One coherent reference sheet per candidate; create a successor candidate for another attempt.");
  if(!wardrobeViews.every(v=>input.views.includes(v)))throw new Error("The reference sheet must declare every required view; reviews verify actual visibility.");
  if(detail.proposal.unresolvedDecisions.length)throw new Error("Resolve producer decisions in a successor proposal before generation/import.");
  for(const refId of [detail.proposal.identityAssetId,detail.proposal.wardrobeAssetId]) {
    const ref=detail.baseAssets.find(a=>a.id===refId)!;
    if(!input.referenceHashes.some(r=>r.assetId===refId&&r.sha256===ref.sha256))throw new Error("Generation input reference hash is missing or stale.");
  }
  const source=file(root,input.sourcePath),bytes=readFileSync(source);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("Import the original built-in PNG.");
  const assetId=randomUUID(),path=`characters/refinements/${id}/${assetId}.png`,target=file(root,path);
  mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target,constants.COPYFILE_EXCL);
  return transaction(db,()=>{
    if(version(db,id).status!=="candidate"||basis(db,root,detail.base.id)!==detail.baseHash)throw new Error("Candidate basis changed.");
    db.prepare("INSERT INTO character_assets(id,character_version_id,category,path,content_hash,imported_from,asset_role,created_at) VALUES(?,?,'body_pose',?,?,?,'scene_reference',?)")
      .run(assetId,id,path,hashFile(root,path),`Built-in assistant image generation; source ${input.sourcePath}`,Date.now());
    append(db,detail.proposal.projectId,id,{kind:"reference",assetId,views:input.views,prompt:input.prompt,inputReferences:input.referenceHashes,provider:"codex_imagegen",model:"not_reported",includedUsage:"not_reported",costUsd:null,billing:"Included assistant image usage; per-call money unreported, not zero. No paid image API fallback."});
    return refinementDetail(db,root,id);
  });
}
export type RefinementReview={candidateHash:string;domain:"identity"|"wardrobe";outcome:"approved"|"rejected";evidence:string;checks?:Array<{check:Check;status:"pass"|"fail"|"not_visible";evidence:string}>};
export function reviewWardrobeCandidate(db:DatabaseSync,root:string,id:string,input:RefinementReview) {
  if(!input||!["identity","wardrobe"].includes(input.domain)||!["approved","rejected"].includes(input.outcome)||!text(input.evidence))throw new Error("Distinct domain, decision and visual evidence are required.");
  return transaction(db,()=>{
    const d=refinementDetail(db,root,id);
    if(d.version.status!=="candidate"||d.candidateHash!==input.candidateHash)throw new Error("Stale candidate review; reload and compare.");
    if(!d.assets.length)throw new Error("Inspect candidate pixels before review.");
    if(input.domain==="wardrobe") {
      if(!Array.isArray(input.checks)||input.checks.length!==wardrobeChecks.length||!wardrobeChecks.every(k=>input.checks!.filter(c=>c.check===k&&text(c.evidence)&&["pass","fail","not_visible"].includes(c.status)).length===1))throw new Error("Every concrete wardrobe check needs visible evidence.");
      if(input.outcome==="approved"&&input.checks.some(c=>c.status!=="pass"))throw new Error("Failed or unverified wardrobe checks hold approval.");
    }
    append(db,d.proposal.projectId,id,{kind:"review",candidateHash:input.candidateHash,domain:input.domain,
      outcome:input.outcome,evidence:input.evidence,...(input.domain==="wardrobe"?{checks:input.checks}:{}),reviewer:"producer"});
    return refinementDetail(db,root,id);
  });
}
export function promoteWardrobeCandidate(db:DatabaseSync,root:string,id:string,input:{candidateHash:string;reason:string}) {
  if(!input||!text(input.reason))throw new Error("Promotion reason required.");
  return transaction(db,()=>{
    const d=refinementDetail(db,root,id);
    if(d.version.status!=="candidate"||d.candidateHash!==input.candidateHash)throw new Error("Stale candidate promotion.");
    const current=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").all(d.version.character_id);
    if(current.length!==1||current[0]!.id!==d.base.id||basis(db,root,d.base.id)!==d.baseHash)throw new Error("Approved basis changed; create a successor candidate.");
    if(d.proposal.unresolvedDecisions.length)throw new Error("Unresolved producer decisions hold promotion.");
    const views=new Set(d.history.filter(e=>e.kind==="reference").flatMap(e=>e.views as string[]));
    if(!wardrobeViews.every(v=>views.has(v)))throw new Error("Missing required wardrobe views.");
    for(const domain of ["identity","wardrobe"]) {
      const review=d.history.filter(e=>e.kind==="review"&&e.domain===domain&&e.candidateHash===d.candidateHash).at(-1);
      if(review?.outcome!=="approved")throw new Error(`Separate ${domain} approval required.`);
    }
    if(d.version.voice_id!==d.base.voice_id||d.version.voice_provider!==d.base.voice_provider)throw new Error("Wardrobe promotion cannot approve a different voice.");
    const description=wardrobeChecks.map(k=>`${k}: ${d.proposal.facts[k]}`).join("\n");
    // The reviewed successor replaces descriptive facts; previous descriptions
    // stay on the prior version, so contradictory garments cannot be combined.
    const old=d.base.locked_visual_facts?JSON.parse(d.base.locked_visual_facts):{description:"",prohibitedPromptPhrases:[]};
    const approvedNotes=`Identity lineage: character_versions:${d.base.id}, asset:${d.proposal.identityAssetId}. Approved identity preservation: ${d.proposal.identityNotes}. The candidate sheet is the approved current appearance; an older identity-only portrait supplies face geometry, never superseded facial hair or clothing. Wardrobe authority: character_versions:${id}.\n${description}\nIdentity and wardrobe approved separately; voice assignment carried forward without new approval.`;
    db.prepare("UPDATE character_versions SET status='approved',notes=?,locked_visual_facts=? WHERE id=?")
      .run(approvedNotes,JSON.stringify({description:`Identity: ${d.proposal.identityNotes}\n${description}`,prohibitedPromptPhrases:old.prohibitedPromptPhrases}),id);
    // Status is preference, not erasure of the previous approval or its assets.
    db.prepare("UPDATE character_versions SET status='superseded' WHERE id=?").run(d.base.id);
    const identity=d.baseAssets.find(a=>a.id===d.proposal.identityAssetId)!;
    db.prepare("INSERT INTO character_assets(id,character_version_id,category,path,content_hash,imported_from,asset_role,created_at) VALUES(?,?,'headshot',?,?,?,'scene_reference',?)")
      .run(randomUUID(),id,identity.path,identity.sha256,`Identity only; character_versions:${d.base.id}; character_assets:${identity.id}. Clothing is not wardrobe authority.`,Date.now());
    append(db,d.proposal.projectId,id,{kind:"promotion",oldVersionId:d.base.id,newVersionId:id,candidateHash:d.candidateHash,reason:input.reason,voiceApproval:"unchanged",existingProductions:"retained; no regeneration or rebinding"});
    return refinementDetail(db,root,id);
  });
}

/** Explicit roles for future keyframes; legacy versions remain labelled legacy. */
export function wardrobeReferenceRole(db:DatabaseSync,versionId:string,category:string):"identity_only"|"wardrobe"|"legacy_identity_and_wardrobe" {
  if(!events(db,versionId).some(e=>e.kind==="promotion"))return "legacy_identity_and_wardrobe";
  return category==="headshot"?"identity_only":"wardrobe";
}

/** New-media QC must see the approved garment, not an older portrait's clothes.
 * The coherent sheet also contains the separately reviewed current identity. */
export function approvedWardrobeQcReference(db:DatabaseSync,root:string,characterId:string):string|null {
  const rows=db.prepare(`SELECT cv.id FROM character_versions cv WHERE cv.character_id=? AND cv.status='approved'
    AND EXISTS(SELECT 1 FROM review_notes r WHERE r.subject_type='character_version' AND r.subject_id=cv.id
      AND r.note LIKE ? AND json_extract(substr(r.note,?), '$.kind')='promotion')`)
    .all(characterId,PREFIX+"%",PREFIX.length+1);
  if(!rows.length)return null;
  if(rows.length!==1)throw new Error("Ambiguous approved wardrobe QC version.");
  const d=refinementDetail(db,root,String(rows[0]!.id));
  const sheets=d.assets.filter(a=>a.category==="body_pose"&&a.asset_role==="scene_reference");
  if(sheets.length!==1)throw new Error("Need one exact approved wardrobe QC sheet.");
  return sheets[0]!.path;
}

/** A canon promotion cannot retcon an older take's acceptance. A deliberate
 * reuse/new candidate can be reviewed against its new target basis; original
 * takes and reviews remain untouched. Run before any critic call or mutation. */
export function assertWardrobeReviewBasis(db:DatabaseSync,attemptId:string):void {
  const attempt=db.prepare("SELECT shot_id,created_at,NULL AS extra_character FROM generation_attempts WHERE id=?").get(attemptId)
    ??db.prepare(`SELECT b.shot_id,a.created_at,b.character_id AS extra_character FROM coverage_keyframe_attempts a
      JOIN coverage_beats b ON b.id=a.coverage_beat_id WHERE a.id=?`).get(attemptId);
  if(!attempt)throw new Error("Missing retained attempt review basis.");
  const cast=new Set(db.prepare("SELECT character_id FROM shot_characters WHERE shot_id=?").all(attempt.shot_id!).map(r=>String(r.character_id)));
  if(attempt.extra_character)cast.add(String(attempt.extra_character));
  for(const characterId of cast) {
    const current=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").all(characterId);
    for(const v of current) {
      const promotion=events(db,String(v.id)).find(e=>e.kind==="promotion");
      if(promotion&&Number(attempt.created_at)<=Number(promotion.recordedAt))throw new Error("Retained take predates the current wardrobe promotion. Preserve its original visual authority; use an explicit reuse/new candidate for review against the successor canon.");
    }
  }
}
