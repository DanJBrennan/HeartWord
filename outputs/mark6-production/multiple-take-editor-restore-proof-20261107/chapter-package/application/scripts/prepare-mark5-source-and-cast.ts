/** Bounded production preparation, not a new pipeline stage. No film dispatch.
 * Usage: npx tsx scripts/prepare-mark5-source-and-cast.ts init|align|repair-source|import|verify
 * import reads the retained built-in image receipts; align never retries a
 * saved submission. Candidate approval and film generation are separate work. */
import "dotenv/config";
import {DatabaseSync,backup} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {getDataDir,getDb} from "../src/db/client.js";
import {discoverSourcePaths,resolveAndBindSourcePaths} from "../src/pipeline/ingestion/source-catalog.js";
import {parseChapterTitle,parseSourceHeadings,parseSourceText,parseSourceTextByVerse} from "../src/pipeline/ingestion/parse-source-text.js";
import {getAudioDurationMs} from "../src/pipeline/ingestion/detect-silences.js";
import {runIngestionWithAlignment} from "../src/pipeline/ingestion/index.js";
import {alignWithGemini} from "../src/pipeline/ingestion/gemini-alignment.js";
import {generateJsonWithImagesMetered} from "../src/providers/gemini-text.js";
import {reconcileAvatarBudget} from "../src/pipeline/voice-lipsync/performance-direction.js";
import {reserveCrewModelSpend,settleCrewModelSpend} from "../src/pipeline/creative-direction/model-spend.js";

const root=getDataDir(),folder=join(root,"scratch","mark5-preparation-20261020");
const output=join(root,"assets","preparation","hatam-mark5-20261020");
const manifestPath=join(folder,"manifest.json"),receiptPath=join(folder,"image-receipts.json");
const hash=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
const digest=(value:unknown)=>hash(JSON.stringify(value));
const save=(path:string,value:unknown)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+"\n");};
const read=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const definitions=[
 {key:"gerasene-man",name:"Gerasene man (Mark 5)",basis:"Mark 5:2-20",speaking:"Direct quotations in 5:7,9,12 are spoken through this man; distinguish reported speech and the plural spirits in source attribution. No separate visible demon design.",appearance:"Proposed Papuan man around 35-45, lean sinewy build, long narrow face, high cheekbones, loosely grown tightly coiled hair to the ears, sparse uneven beard. Distinct from Jesus and the Mark 3 possessed man. Worn muted brown knee-length tunic with plain waist tie before restoration; modest intact coverage. After restoration, same face and hair in a clean undyed tunic and soft slate-brown rectangular shoulder wrap. No supernatural anatomy, villain caricature, exposed wounds or reenacted self-harm.",views:"large neutral head-and-shoulders likeness, front standing in worn clothing, side/back in worn clothing, seated composed in clean clothing. Keep the same man across all four views; this is a proposed two-state wardrobe, not historical evidence of its exact colors."},
 {key:"jairus",name:"Jairus",basis:"Mark 5:22-24,35-43",speaking:"Quoted request at 5:23. Do not invent spoken lines from later reported actions.",appearance:"Proposed Papuan father around 45-55, medium broad build, oval face, closely cropped salt-and-pepper curls, short rounded salt-and-pepper beard, recognizable gentle brow. Plain well-kept pale flax calf-length tunic, restrained dark umber shoulder mantle and plain woven waist sash, leather sandals. His synagogue role does not make him a high priest: no priestly regalia, ornate jewelry or modern religious headwear. Distinct silhouette from Jesus and Peter.",views:"large head-and-shoulders likeness, front full-body, side/back full-body, seated attentive. Same person, identical clothing in every view; neutral reference expressions rather than a performed story scene."},
 {key:"jairus-daughter",name:"Daughter of Jairus",basis:"Mark 5:23,35-43; age twelve stated at 5:42",speaking:"No quoted dialogue; no voice assignment needed.",appearance:"A Papuan girl explicitly twelve years old, clearly a child, slight age-appropriate build, round youthful face and short natural tight curls. Modest loose plain soft ochre ankle-length tunic with elbow-length sleeves, simple woven waist tie and sandals. Natural child proportions, ordinary appearance, no makeup or jewelry. All views fully clothed and neutral, no illness dramatization or death imagery in this identity proposal.",views:"large neutral head-and-shoulders likeness, front full-body, side/back full-body, seated calmly. Same twelve-year-old child and the same modest clothing in every view. Story-state resting/waking references can be prepared after identity approval; do not invent wounds or symptoms."},
 {key:"jairus-wife",name:"Wife of Jairus (mother of the girl)",basis:"Mark 5:40",speaking:"No quoted dialogue; no voice assignment needed.",appearance:"Proposed Papuan woman around 35-45, medium build, softly square face, broad cheekbones, dark tightly coiled hair mostly under a plain dull sage headscarf. Modest simple warm stone-colored ankle-length tunic, sage shoulder cloth and narrow woven waist tie, leather sandals. Distinct from the older crowd women and from the woman with the bleeding condition. No jewelry, ornate trim or modern clothing.",views:"large neutral head-and-shoulders likeness, front full-body, side/back full-body, seated attentive. Same person, consistent headscarf drape and clothing across all views; neutral expression, not a narrated scene."},
 {key:"woman-bleeding",name:"Woman with the bleeding condition (Mark 5)",basis:"Mark 5:25-34",speaking:"Quoted words at 5:28; 5:33 reports her account without supplying new dialogue. Keep narrator and direct speech separate.",appearance:"Proposed Papuan adult woman around 40-50, slender build, long oval face, high cheekbones, slightly tired eyes, dark natural coiled hair under a plain muted plum headscarf. Modest faded earth-red ankle-length tunic and subdued plum shoulder wrap, narrow plain waist tie, leather sandals. Dignified realistic person, visibly different from Jairus's wife and existing crowd women. The source gives twelve years of illness, not an exact age: this actor age and palette are proposals. No blood, visible injuries, emaciation caricature, jewelry or invented physical symptoms.",views:"large neutral head-and-shoulders likeness, front full-body, side/back full-body, seated attentive. Same person and outfit in every view; illness/healing performance is not part of this neutral identity proposal."}
];
const stylePaths=["characters/jesus/motion/motion-neutral-standing-v3.png","characters/crowd-older-woman-cream/body_pose/motion-neutral-standing-v1.png","characters/crowd-young-woman/body_pose/motion-neutral-standing-v1.png"];
function snapshot(db:DatabaseSync){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t=>{const table=String(t.name);return {table,rows:db.prepare(`SELECT rowid AS preparation_rowid,* FROM "${table}" ORDER BY rowid`).all().map(r=>({rowid:r.preparation_rowid,sha256:digest(r)}))};});}
function note(db:DatabaseSync,projectId:string,subjectType:string,subjectId:string,value:unknown){db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,?,?,'qc',?,0,?)").run(randomUUID(),projectId,subjectType,subjectId,"Mark 5 preparation v1\n"+JSON.stringify(value),Date.now());}

const action=process.argv[2];
if(action==="init"){
 if(existsSync(manifestPath))throw Error("Preparation already initialized; use the retained manifest.");
 mkdirSync(folder,{recursive:true});mkdirSync(output,{recursive:true});
 const before=new DatabaseSync(join(root,"db","heartword.sqlite"),{readOnly:true});
 if(before.prepare("SELECT id FROM projects WHERE language='hatam' AND book='mark' AND chapter=5").get())throw Error("Mark 5 already exists; inspect it before preparation.");
 const baseline=snapshot(before),backupPath=join(root,"backups",`before-mark5-preparation-${Date.now()}.sqlite`);mkdirSync(dirname(backupPath),{recursive:true});await backup(before,backupPath);save(join(folder,"baseline.json"),baseline);
 const approved=before.prepare(`SELECT c.id,c.name,cv.id versionId,cv.version_label versionLabel,cv.voice_provider,cv.voice_id FROM characters c JOIN character_versions cv ON cv.character_id=c.id AND cv.status='approved' WHERE c.region='Papuan' AND c.canon_status='approved' ORDER BY c.name`).all().map(c=>({...c,id:String(c.id),versionId:String(c.versionId),assets:before.prepare("SELECT id,category,path,asset_role,story_state,content_hash FROM character_assets WHERE character_version_id=? ORDER BY id").all(c.versionId!).map(a=>({...a,sha256:hash(readFileSync(join(root,"assets",String(a.path))))}))}));before.close();
 const db=getDb(),projectId=randomUUID(),now=Date.now();
 db.prepare("INSERT INTO projects(id,language,book,chapter,stage,status,created_at,updated_at) VALUES(?,'hatam','mark',5,'ingestion','held',?,?)").run(projectId,now,now);
 const paths=resolveAndBindSourcePaths(db,{id:projectId,language:"hatam",book:"mark",chapter:5});
 const verses=parseSourceTextByVerse(paths.docxPath),reference=parseSourceTextByVerse(paths.referencePath);
 save(join(output,"source.json"),{title:parseChapterTitle(paths.docxPath,5),paths,durationMs:getAudioDurationMs(paths.audioPath),headings:parseSourceHeadings(paths.docxPath),paragraphGroups:parseSourceText(paths.docxPath,"mark",5),verses:verses.map(v=>({...v,english:reference.find(e=>e.verse===v.verse)?.text??null})),files:[paths.docxPath,paths.audioPath,paths.referencePath].map(path=>({path,sha256:hash(readFileSync(path))}))});
 const candidates=definitions.map(d=>{const characterId=randomUUID(),versionId=randomUUID();
  db.prepare("INSERT INTO characters(id,name,scope_kind,scope_book,scope_chapter,canon_status,region,created_at,updated_at) VALUES(?,?,'chapter','mark',5,'candidate','Papuan',?,?)").run(characterId,d.name,now,now);
  db.prepare("INSERT INTO character_versions(id,character_id,version_label,status,notes,created_at) VALUES(?,?,'v1-candidate','candidate',?,?)").run(versionId,characterId,JSON.stringify({sourceBasis:d.basis,speech:d.speaking,proposedAppearance:d.appearance,status:"Awaiting Dan's image/identity/wardrobe review. No voice approval or film generation."}),now);
  const prompt=`Use case: historical-scene. Asset type: UNAPPROVED character casting reference sheet for HeartWord Films, not a film frame. Create a 16:9 landscape sheet in four clean panels with natural realistic photographic faces, consistent identity and full-body proportions. Neutral warm gray-beige studio background and soft even daylight. Input images 1-3 are STYLE AND REGIONAL CASTING REFERENCES ONLY: use their restrained realistic photographic treatment, first-century tunics and Papuan/Melanesian casting. Do not copy any reference person's identity, costume color-block or exact pose. The requested person is a NEW distinct identity. Subject: ${d.appearance} Layout/views: ${d.views} Keep headshot readable and body views complete with feet. Do not copy the reference sheet as one scene or add people. All panels show this single person's alternate reference views. Clothing is proposed first-century Galilee/Gerasene reconstruction with Papuan faces, not modern Papua. No decorative hanging fringe or modern trim, no logos, no names, no labels, no captions, no text, no watermark. Do not introduce a narrative event or other named character. Any exact age not stated in Scripture, palette and garment detail here are proposed casting choices, not historical facts.`;
  const candidate={...d,characterId,versionId,prompt,styleReferences:stylePaths.map(path=>({path,sha256:hash(readFileSync(join(root,"assets",path)))}))};
  note(db,projectId,"character_version",versionId,{kind:"candidate_proposal",...candidate,approval:"unapproved",voiceApproval:"none"});return candidate;
 });
 note(db,projectId,"project",projectId,{kind:"scope",authorization:"Dan: source and cast preparation, current approved disciple canon; present new candidates and cost estimate before film generation.",filmGeneration:"held_by_producer",approvedCanonSnapshot:approved.map(c=>({characterId:c.id,versionId:c.versionId})),backupPath});
 const manifest={projectId,backupPath,output,approved,candidates,sourcePreparationCapUsd:10,filmGenerationAuthorized:false,recordedOn:"2026-10-20"};save(manifestPath,manifest);save(join(output,"manifest.json"),manifest);
 reconcileAvatarBudget(db,{projectId,actor:"Codex — authorized Mark 5 source preparation",evidence:`New project created after SQLite-supported backup ${backupPath}; no earlier Mark 5 workspace, calls, ledger or external dispatch in this task. Zero pre-existing Mark 5 liabilities is scoped to this new film; not a claim about other chapters/account bills. Preparation capped at $10; film generation awaits Dan.`,unreportedUpperBoundUsd:0,outstandingUpperBoundUsd:0,idempotencyKey:"mark5-initial-source-preparation-20261020"});
 console.log(JSON.stringify({projectId,backupPath,output,candidates:candidates.map(c=>({name:c.name,versionId:c.versionId})),filmGenerationAuthorized:false},null,2));
}else if(action==="align"){
 const m=read(manifestPath),db=getDb();
 if(db.prepare("SELECT 1 FROM alignment_evidence WHERE project_id=?").get(m.projectId))throw Error("Saved alignment already exists; inspect it, do not blindly repeat paid calls.");
 const runId=randomUUID(),start=Date.now();let sequence=0,spent=0;
 process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD="2";
 db.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,created_at,worker_pid) VALUES(?,?,'planning',?,?,'held',?,?)").run(runId,m.projectId,digest({scope:"source evidence only",projectId:m.projectId}),JSON.stringify({kind:"source_preparation",filmGenerationAuthorized:false,capUsd:10,callUpperBoundUsd:2,pricingSource:"https://ai.google.dev/gemini-api/docs/pricing",pricingCheckedOn:"2026-10-20",upperBoundBasis:"Both supported models cap output at 65536 tokens. Flash $0.75/$3.75 and Pro $2/$12 per million prompt/output tokens for this small prompt. $2 bounds the model output plus this <200k prompt; reserve separately before every call. Exact usage retained; invoices unverified."}),start,process.pid);
 const identify=async(audio:Buffer,context:string,model:string)=>{
  if(spent+2>m.sourcePreparationCapUsd)throw Error("Preparation cap holds further source calls.");
  if(!["gemini-3.6-flash","gemini-3.1-pro-preview"].includes(model)||context.length>100000)throw Error("Source model/context outside evidenced reservation bounds.");
  const id=randomUUID(),reservation=reserveCrewModelSpend(db,m.projectId,id),seq=++sequence;
  const prompt=`Reference text:\n${context}\n\nAttached audio is consecutive narration or an announcement. Return {isScripture:boolean,span?:string}; Scripture span must be exact verbatim reference words. Identify only words actually audible; do not infer speaker identities, translate, invent or complete missing text. This is provisional audio/text matching, not fluent-language attestation.`;
  db.prepare("INSERT INTO production_events(id,run_id,sequence,role,round,prompt,model,cost_usd,created_at) VALUES(?,?,?,'source_alignment_evidence',1,?,?,NULL,?)").run(id,runId,seq,JSON.stringify({prompt,audioSha256:hash(audio),mimeType:"audio/wav"}),model,Date.now());
  try{const r=await generateJsonWithImagesMetered<{isScripture:boolean;span?:string}>(prompt,[{mimeType:"audio/wav",data:audio.toString("base64")}],{type:"object",properties:{isScripture:{type:"boolean"},span:{type:"string"}},required:["isScripture"]},model);
   const inputRate=model==="gemini-3.6-flash"?.75:2,outputRate=model==="gemini-3.6-flash"?3.75:12;
   const cost=(r.usage.promptTokenCount*inputRate+(r.usage.candidatesTokenCount+r.usage.thoughtsTokenCount)*outputRate)/1e6;
   if(!r.usage.totalTokenCount)throw Error("Missing usage; retain unknown liability rather than claim zero.");
   db.prepare("UPDATE production_events SET output_json=?,cost_usd=? WHERE id=?").run(JSON.stringify({result:r.result,usage:r.usage,estimateUsd:cost,invoiceVerified:false,inputRate,outputRate,rateSource:"https://ai.google.dev/gemini-api/docs/pricing",rateDate:"2026-10-20"}),cost,id);
   db.prepare("INSERT INTO cost_ledger_entries(id,project_id,amount_usd,created_at) VALUES(?,?,?,?)").run(randomUUID(),m.projectId,cost,Date.now());settleCrewModelSpend(db,m.projectId,reservation,id,cost);spent+=cost;
   console.log(JSON.stringify({call:seq,model,estimateUsd:cost,totalEstimateUsd:spent}));return r.result;
  }catch(error){db.prepare("UPDATE production_events SET error=? WHERE id=?").run((error as Error).message,id);throw error;}
 };
 const result=await runIngestionWithAlignment(m.projectId,input=>alignWithGemini({...input,identify}));
 const evidence=db.prepare("SELECT status,model,result_json FROM alignment_evidence WHERE project_id=?").get(m.projectId);
 const intervals=db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(m.projectId);
 const report={projectId:m.projectId,result,estimatedApiUsd:spent,paidCalls:sequence,sourceAttestation:"not supplied",speakerAttribution:"not approved; candidate speakers pending",evidence:evidence?{...evidence,result:JSON.parse(String(evidence.result_json)),result_json:undefined}:null,intervals};
 save(join(output,"alignment.json"),report);note(db,m.projectId,"project",m.projectId,{kind:"source_preparation_result",reportPath:"preparation/hatam-mark5-20261020/alignment.json",filmGeneration:"held_by_producer",sourceAttestation:"not supplied",estimatedApiUsd:spent});
 db.prepare("UPDATE production_runs SET result_json=?,completed_at=? WHERE id=?").run(JSON.stringify({kind:"source_preparation",...result,estimatedApiUsd:spent,paidCalls:sequence,filmGenerationAuthorized:false}),Date.now(),runId);
 console.log(JSON.stringify({result,estimatedApiUsd:spent,paidCalls:sequence,intervals:intervals.length},null,2));
}else if(action==="repair-source"){
 const m=read(manifestPath),db=getDb(),originalReport=join(output,"alignment-before-parser-repair.json");
 if(existsSync(originalReport))throw Error("Parser repair already recorded; inspect rather than replay.");
 if(!existsSync(join(output,"alignment.json")))throw Error("Wait for the initial source pass to finish.");
 copyFileSync(join(output,"alignment.json"),originalReport,constants.COPYFILE_EXCL);
 const priorRows=db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY start_ms,id").all(m.projectId);
 save(join(output,"source-intervals-before-parser-repair.json"),priorRows);
 const oldSource=read(join(output,"source.json"));copyFileSync(join(output,"source.json"),join(output,"source-before-parser-repair.json"),constants.COPYFILE_EXCL);
 const p=discoverSourcePaths({language:"hatam",book:"mark",chapter:5}),verses=parseSourceTextByVerse(p.docxPath),reference=parseSourceTextByVerse(p.referencePath);
 save(join(output,"source.json"),{...oldSource,paragraphGroups:parseSourceText(p.docxPath,"mark",5),verses:verses.map(v=>({...v,english:reference.find(e=>e.verse===v.verse)?.text??null})),parserRepair:{reason:"Retain the supplied Hatam 5:9 reply and English 5:24 crowd continuation before the next verse marker.",originalDocumentsChanged:false,originalReport:"alignment-before-parser-repair.json"}});
 const cache=new Map<string,unknown>();
 const events=db.prepare("SELECT e.prompt,e.output_json,e.model FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.role='source_alignment_evidence' AND e.output_json IS NOT NULL ORDER BY e.created_at").all(m.projectId);
 for(const e of events){const input=JSON.parse(String(e.prompt)),out=JSON.parse(String(e.output_json));cache.set(`${e.model}:${input.audioSha256}`,out.result);}
 let reused=0,missing=0;
 const result=await runIngestionWithAlignment(m.projectId,input=>alignWithGemini({...input,identify:async(audio,_context,model)=>{const retained=cache.get(`${model}:${hash(audio)}`);if(!retained){missing++;throw Error("No retained exact-clip evidence; targeted review remains required. No paid retry submitted.");}reused++;return retained;}}));
 const evidence=db.prepare("SELECT status,model,result_json FROM alignment_evidence WHERE project_id=? ORDER BY created_at DESC LIMIT 1").get(m.projectId);
 const report={projectId:m.projectId,result,estimatedApiUsd:read(originalReport).estimatedApiUsd,paidCalls:read(originalReport).paidCalls,repair:{retainedAudioResponsesReused:reused,missingRetainedEvidence:missing,newPaidCalls:0,previousReport:"alignment-before-parser-repair.json",limitations:"Retained responses were prompted with the earlier parsed reference. Local rematching uses the complete corrected source; no omitted source words were fabricated. Remaining uncovered words and timing need targeted evidence."},sourceAttestation:"not supplied",speakerAttribution:"candidate speakers pending",evidence:evidence?{...evidence,result:JSON.parse(String(evidence.result_json)),result_json:undefined}:null,intervals:db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(m.projectId)};
 save(join(output,"alignment.json"),report);
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'human',?,0,?)").run(randomUUID(),m.projectId,m.projectId,"Producer instruction — Dan, this conversation: prepare Hatam Mark 5 source and cast using current approved disciples; show new character candidates and cost estimate before film generation. This is a generation hold, not source/canon/voice approval.",Date.now());
 note(db,m.projectId,"project",m.projectId,{kind:"parser_repair",result,paidCalls:0,retainedAudioResponsesReused:reused,sourceDocumentsUnchanged:true,reportPath:"preparation/hatam-mark5-20261020/alignment.json"});
 console.log(JSON.stringify({result,reused,missing,newPaidCalls:0},null,2));
}else if(action==="target-source"){
 const m=read(manifestPath),db=getDb(),old=read(join(output,"alignment.json"));
 if(!old.repair)throw Error("First reconcile the parser using retained evidence.");
 if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND json_extract(brief_json,'$.kind')='targeted_source_repair'").get(m.projectId))throw Error("Targeted source check already retained; do not blindly repeat.");
 const paths=discoverSourcePaths({language:"hatam",book:"mark",chapter:5});
 const {execFileSync}=await import("node:child_process");
 const targets=old.evidence.result.segments.filter((s:any)=>s.status!=="matched"&&s.endMs-s.startMs>=400);
 const targetHashes=new Set(targets.map((s:any)=>hash(execFileSync("ffmpeg",["-v","error","-ss",String(Math.max(0,s.startMs/1000-.1)),"-t",String((s.endMs-s.startMs)/1000+.2),"-i",paths.audioPath,"-f","wav","-ac","1","-ar","16000","pipe:1"]))));
 const cache=new Map<string,unknown>();for(const e of db.prepare("SELECT e.prompt,e.output_json,e.model FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.role='source_alignment_evidence' AND e.output_json IS NOT NULL ORDER BY e.created_at").all(m.projectId)){cache.set(`${e.model}:${JSON.parse(String(e.prompt)).audioSha256}`,JSON.parse(String(e.output_json)).result);}
 const runId=randomUUID();let calls=0,spent=0,reused=0;process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD="2";
 db.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,created_at,worker_pid) VALUES(?,?,'planning',?,?,'held',?,?)").run(runId,m.projectId,digest(targets),JSON.stringify({kind:"targeted_source_repair",targets,reason:"Explicit changed-reference recheck after recovered continuation text, plus retained unresolved source spans; never film generation or blind retry",capUsd:10}),Date.now(),process.pid);
 copyFileSync(join(output,"alignment.json"),join(output,"alignment-before-targeted-check.json"),constants.COPYFILE_EXCL);
 const identify=async(audio:Buffer,context:string,model:string)=>{
  const audioHash=hash(audio),key=`${model}:${audioHash}`;
  if(!targetHashes.has(audioHash)){const retained=cache.get(key);if(!retained)throw Error("No retained evidence for this non-target clip; no call submitted.");reused++;return retained;}
  if(calls>=targets.length*2||old.estimatedApiUsd+spent+2>m.sourcePreparationCapUsd)throw Error("Targeted source preparation cap reached.");
  const eventId=randomUUID(),reservation=reserveCrewModelSpend(db,m.projectId,eventId),seq=++calls;
  const prompt=`Corrected complete reference text:\n${context}\n\nThis retained audio interval needs a targeted evidence check. The previous parser omitted a continuation of verse 9; that omission was a software error, not a problem in the supplied document. Return {isScripture:boolean,span?:string}; the span must contain only exact reference words actually audible. A title can be matched using its supplied text. Never infer speaker identities or complete inaudible words. Uncertain audio remains unassigned.`;
  db.prepare("INSERT INTO production_events(id,run_id,sequence,role,round,prompt,model,cost_usd,created_at) VALUES(?,?,?,'source_alignment_evidence',1,?,?,NULL,?)").run(eventId,runId,seq,JSON.stringify({prompt,audioSha256:audioHash,mimeType:"audio/wav",changedReference:true}),model,Date.now());
  try{const r=await generateJsonWithImagesMetered<{isScripture:boolean;span?:string}>(prompt,[{mimeType:"audio/wav",data:audio.toString("base64")}],{type:"object",properties:{isScripture:{type:"boolean"},span:{type:"string"}},required:["isScripture"]},model);
   if(!r.usage.totalTokenCount)throw Error("Missing usage; retained unknown liability.");
   const inputRate=model==="gemini-3.6-flash"?.75:2,outputRate=model==="gemini-3.6-flash"?3.75:12,cost=(r.usage.promptTokenCount*inputRate+(r.usage.candidatesTokenCount+r.usage.thoughtsTokenCount)*outputRate)/1e6;
   db.prepare("UPDATE production_events SET output_json=?,cost_usd=? WHERE id=?").run(JSON.stringify({result:r.result,usage:r.usage,estimateUsd:cost,invoiceVerified:false,inputRate,outputRate,rateSource:"https://ai.google.dev/gemini-api/docs/pricing",rateDate:"2026-10-20"}),cost,eventId);
   db.prepare("INSERT INTO cost_ledger_entries(id,project_id,amount_usd,created_at) VALUES(?,?,?,?)").run(randomUUID(),m.projectId,cost,Date.now());settleCrewModelSpend(db,m.projectId,reservation,eventId,cost);spent+=cost;cache.set(key,r.result);console.log(JSON.stringify({targetedCall:calls,model,costUsd:cost,result:r.result}));return r.result;
  }catch(error){db.prepare("UPDATE production_events SET error=? WHERE id=?").run((error as Error).message,eventId);throw error;}
 };
 // Reuse the same stage with a changed-reference evidence pass; preserve the
 // earlier report and raw outputs. No existing reviewed binding is replaced.
 const result=await runIngestionWithAlignment(m.projectId,input=>alignWithGemini({...input,identify}));
 const evidence=db.prepare("SELECT source_hash,status,model,result_json FROM alignment_evidence WHERE project_id=? ORDER BY created_at DESC LIMIT 1").get(m.projectId);
 // The stage can reuse its existing parser-repaired cache. Explicitly compute
 // this new evidence first when that cache is present, then persist/re-run once.
 if(calls===0){
  const {detectSilences}=await import("../src/pipeline/ingestion/detect-silences.js"),{alignmentKey}=await import("../src/pipeline/ingestion/gemini-alignment.js"),{parseNarratedParagraphTitles}=await import("../src/pipeline/ingestion/parse-source-text.js");
  const verses=parseSourceTextByVerse(paths.docxPath),title=parseChapterTitle(paths.docxPath,5),fresh=await alignWithGemini({audioPath:paths.audioPath,verses,chapterTitle:title,titles:parseNarratedParagraphTitles(paths.docxPath),durationMs:getAudioDurationMs(paths.audioPath),gaps:detectSilences(paths.audioPath),identify});
  const key=alignmentKey(paths.audioPath,verses,undefined,title??"");
  note(db,m.projectId,"project",m.projectId,{kind:"retained_alignment_revision",before:db.prepare("SELECT * FROM alignment_evidence WHERE project_id=? AND source_hash=?").get(m.projectId,key),reason:"Changed-reference targeted evidence retained; prior raw replies/reports remain."});
  db.prepare("UPDATE alignment_evidence SET result_json=?,status=?,created_at=? WHERE project_id=? AND source_hash=?").run(JSON.stringify(fresh),fresh.coverage<.95||fresh.segments.some(s=>s.status==="unresolved")?"critical_hold":"provisional",Date.now(),m.projectId,key);
 }
 const finalResult=calls?await runIngestionWithAlignment(m.projectId):result;
 const finalEvidence=db.prepare("SELECT status,model,result_json FROM alignment_evidence WHERE project_id=? ORDER BY created_at DESC LIMIT 1").get(m.projectId)!;
 const report={...old,result:finalResult,estimatedApiUsd:old.estimatedApiUsd+spent,paidCalls:old.paidCalls+calls,targetedCheck:{targets,calls,estimateUsd:spent,retainedResponsesReused:reused,priorReport:"alignment-before-targeted-check.json"},evidence:{...finalEvidence,result:JSON.parse(String(finalEvidence.result_json)),result_json:undefined},intervals:db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(m.projectId)};
 save(join(output,"alignment.json"),report);save(join(output,"targeted-source-check.json"),report.targetedCheck);
 db.prepare("UPDATE production_runs SET result_json=?,completed_at=? WHERE id=?").run(JSON.stringify({kind:"targeted_source_repair",...finalResult,calls,estimatedApiUsd:spent,filmGenerationAuthorized:false}),Date.now(),runId);
 note(db,m.projectId,"project",m.projectId,{kind:"source_preparation_result",...finalResult,reportPath:"preparation/hatam-mark5-20261020/alignment.json",estimatedApiUsd:report.estimatedApiUsd,filmGeneration:"held_by_producer"});
 console.log(JSON.stringify({result:finalResult,calls,estimateUsd:spent,coverage:report.evidence.result.coverage},null,2));
}else if(action==="refresh-metadata"){
 const m=read(manifestPath),db=getDb(),old=read(join(output,"alignment.json")),saved=join(output,"alignment-before-metadata-fix.json");
 if(existsSync(saved))throw Error("Metadata refresh already retained; inspect the current evidence.");
 const {detectSilences}=await import("../src/pipeline/ingestion/detect-silences.js"),{alignmentKey}=await import("../src/pipeline/ingestion/gemini-alignment.js"),{parseNarratedParagraphTitles}=await import("../src/pipeline/ingestion/parse-source-text.js");
 const paths=discoverSourcePaths({language:"hatam",book:"mark",chapter:5}),verses=parseSourceTextByVerse(paths.docxPath),title=parseChapterTitle(paths.docxPath,5),cache=new Map<string,unknown>();
 for(const e of db.prepare("SELECT e.prompt,e.output_json,e.model FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.role='source_alignment_evidence' AND e.output_json IS NOT NULL ORDER BY e.created_at").all(m.projectId))cache.set(`${e.model}:${JSON.parse(String(e.prompt)).audioSha256}`,JSON.parse(String(e.output_json)).result);
 let reused=0;const fresh=await alignWithGemini({audioPath:paths.audioPath,verses,chapterTitle:title,titles:parseNarratedParagraphTitles(paths.docxPath),durationMs:getAudioDurationMs(paths.audioPath),gaps:detectSilences(paths.audioPath),identify:async(audio,_context,model)=>{const result=cache.get(`${model}:${hash(audio)}`);if(!result)throw Error("No retained exact audio response; no new provider request.");reused++;return result;}});
 copyFileSync(join(output,"alignment.json"),saved,constants.COPYFILE_EXCL);
 const key=alignmentKey(paths.audioPath,verses,undefined,title??"");db.prepare("UPDATE alignment_evidence SET result_json=?,status=?,created_at=? WHERE project_id=? AND source_hash=?").run(JSON.stringify(fresh),fresh.coverage<.95||fresh.segments.some(s=>s.status==="unresolved")?"critical_hold":"provisional",Date.now(),m.projectId,key);
 const result=await runIngestionWithAlignment(m.projectId,async()=>{throw Error("Metadata refresh cannot submit a provider request.");});
 const row=db.prepare("SELECT status,model FROM alignment_evidence WHERE project_id=? AND source_hash=?").get(m.projectId,key)!;
 const report={...old,result,metadataRefresh:{reused,newPaidCalls:0,reason:"An exact complete two-word supplied chapter title can anchor without a redundant strong call; standalone punctuation is not counted as an unheard word.",sourceAttestation:"not supplied"},evidence:{...row,result:fresh},intervals:db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(m.projectId)};
 save(join(output,"alignment.json"),report);note(db,m.projectId,"project",m.projectId,{kind:"source_preparation_result",...result,sourceAttestation:"not supplied",sourceStatus:"provisional; named source review and speaker approval still required",reportPath:"preparation/hatam-mark5-20261020/alignment.json",estimatedApiUsd:report.estimatedApiUsd,filmGeneration:"held_by_producer"});
 console.log(JSON.stringify({result,reused,newPaidCalls:0,coverage:fresh.coverage,uncoveredVerses:fresh.uncoveredVerses,unresolved:fresh.segments.filter(s=>s.status!=="matched")},null,2));
}else if(action==="import"){
 const m=read(manifestPath),receipts=read(receiptPath),db=getDb();
 for(const c of m.candidates){const r=receipts.find((r:{key:string})=>r.key===c.key);if(!r)throw Error("Missing built-in image: "+c.key);
  const version=db.prepare("SELECT status FROM character_versions WHERE id=?").get(c.versionId);if(version?.status!=="candidate")throw Error("Candidate authority changed.");
  const targetRel=`characters/mark5-candidates/${c.key}/reference-sheet-r1.png`,target=join(root,"assets",targetRel),bytes=readFileSync(r.outputPath);
  if(existsSync(target)){if(hash(readFileSync(target))!==hash(bytes))throw Error("Retained candidate pixels differ; create a new revision.");continue;}
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error("Original built-in PNG required.");
  mkdirSync(dirname(target),{recursive:true});copyFileSync(r.outputPath,target,constants.COPYFILE_EXCL);
  const assetId=randomUUID();db.prepare("INSERT INTO character_assets(id,character_version_id,category,path,content_hash,imported_from,asset_role,created_at) VALUES(?,?,'turnaround',?,?,?,'scene_reference',?)").run(assetId,c.versionId,targetRel,hash(bytes),"Built-in assistant image generation; "+r.outputPath,Date.now());
  note(db,m.projectId,"character_version",c.versionId,{kind:"candidate_image",assetId,path:targetRel,sha256:hash(bytes),prompt:c.prompt,styleReferences:c.styleReferences,provider:"codex_imagegen",model:"not_reported",includedUsage:"not_reported",costUsd:null,approval:"unapproved",observations:r.observations??"Awaiting visual review"});
  copyFileSync(target,join(output,c.key+"-candidate-r1.png"),constants.COPYFILE_EXCL);
 }
 console.log("Imported five retained candidate sheets; no promotion, voice assignment or film dispatch.");
}else if(action==="verify"){
 const m=read(manifestPath),db=new DatabaseSync(join(root,"db","heartword.sqlite"),{readOnly:true}),baseline=read(join(folder,"baseline.json"));
 const preserved=baseline.map((t:{table:string;rows:Array<{rowid:number;sha256:string}>})=>{const current=new Map(db.prepare(`SELECT rowid AS preparation_rowid,* FROM "${t.table}"`).all().map(r=>[r.preparation_rowid,digest(r)]));const changed=t.rows.filter(r=>current.get(r.rowid)!==r.sha256);if(changed.length)throw Error("Original rows changed in "+t.table);return {table:t.table,originalRows:t.rows.length,unchanged:true};});
 for(const c of m.approved)for(const a of c.assets)if(hash(readFileSync(join(root,"assets",a.path)))!==a.sha256)throw Error("Approved canon bytes changed: "+a.path);
 const candidates=m.candidates.map((c:{name:string;characterId:string;versionId:string})=>({name:c.name,...db.prepare("SELECT c.canon_status,cv.status,cv.voice_id,(SELECT count(*) FROM character_assets a WHERE a.character_version_id=cv.id) assets FROM characters c JOIN character_versions cv ON cv.character_id=c.id WHERE cv.id=?").get(c.versionId)}));
 if(candidates.some((c:any)=>c.status!=="candidate"||c.canon_status!=="candidate"||c.voice_id!==null))throw Error("Unexpected candidate approval or voice assignment.");
 const filmCounts=db.prepare(`SELECT (SELECT count(*) FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=?) shots,(SELECT count(*) FROM generation_attempts a JOIN shots sh ON sh.id=a.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=?) attempts,(SELECT count(*) FROM chapter_renders WHERE project_id=?) renders`).get(m.projectId,m.projectId,m.projectId);
 if(Object.values(filmCounts!).some(n=>n!==0))throw Error("Film-generation boundary was crossed.");
 const report={projectId:m.projectId,backupPath:m.backupPath,preserved,originalRows:preserved.reduce((n:number,t:{originalRows:number})=>n+t.originalRows,0),originalCanonFiles:m.approved.reduce((n:number,c:{assets:unknown[]})=>n+c.assets.length,0),candidates,filmCounts,foreignKeyIssues:db.prepare("PRAGMA foreign_key_check").all()};
 save(join(output,"preservation.json"),report);console.log(JSON.stringify({...report,preserved:undefined},null,2));db.close();
}else throw Error("Use init, align, repair-source, import or verify.");
