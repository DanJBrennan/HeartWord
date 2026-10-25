import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import express from "express";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {listeningFolder,listeningHash,pcmWaveInfo,pcmWindow,readListeningReview,saveListeningReview,readListeningClip,recordListeningNarrationDecision,sourceSpeechBindingPrefix,type ListeningManifest} from "../../src/pipeline/ingestion/source-listening-review.js";
import {sourceReviewHashes} from "../../src/pipeline/ingestion/source-review.js";
import {applyListeningReview} from "../../src/pipeline/ingestion/apply-listening-review.js";
import {reconcileSourceRows} from "../../src/pipeline/ingestion/reconcile-source-rows.js";
import {speechCoverageSegments} from "../../src/pipeline/ingestion/continuous-speech.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db:import("node:sqlite").DatabaseSync,root="",manifest:ListeningManifest,server:ReturnType<express.Express["listen"]>|undefined;
vi.mock("../../src/db/client.js",()=>({getDb:()=>db,getDataDir:()=>root}));
function wave(){
 const b=Buffer.alloc(44+24000*2*2*2);b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(b.length-44,40);
 for(let n=0;n<48000;n++){b.writeInt16LE(n%32000,44+n*4);b.writeInt16LE(-(n%32000),46+n*4);}return b;
}
function put(path:string,bytes:Buffer|string){const p=join(root,"assets",path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes);}
function request(extra:Record<string,unknown>={}){return {startMs:1000,endMs:1130,action:"verify" as const,reviewerName:"Fixture reviewer",note:"Heard both edges",baseRevision:null,requestId:"request-1",manifestHash:readListeningReview(db,root,"p").manifestHash,attestation:"confirm",...extra};}
beforeEach(()=>{
 root=mkdtempSync(join(tmpdir(),"hw-listening-"));db=new DatabaseSync(":memory:");db.exec(readFileSync(new URL("../../src/db/schema.sql",import.meta.url),"utf8"));
 db.prepare("INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',5,1,1)").run();
 for(const path of ["fixture/source.docx","fixture/audio.mp3","fixture/english.docx"])put(path,path);
 db.prepare("INSERT INTO project_source_bindings VALUES ('p','fixture/source.docx','fixture/audio.mp3','fixture/english.docx','non_drama',?,?,?,'legacy',1)").run(...["fixture/source.docx","fixture/audio.mp3","fixture/english.docx"].map(p=>listeningHash(readFileSync(join(root,"assets",p)))));
 db.exec("INSERT INTO audio_segments VALUES ('a','p','original_reading','fixture/audio.mp3',0,2000,NULL,'Mark 5:7',80,1)");
 const wav=wave();put("fixture/source.wav",wav);put("fixture/initial.wav",pcmWindow(wav,500,1200));
 manifest={version:1,projectId:"p",title:"Synthetic chapter",...sourceReviewHashes(db,"p",root),originalAudioPath:"fixture/audio.mp3",originalAudioSha256:listeningHash("fixture/audio.mp3"),pcmPath:"fixture/source.wav",pcmSha256:listeningHash(wav),sampleRate:24000,channels:2,durationMs:2000,items:[{id:"quote-1",kind:"character",verseRef:"Mark 5:7",title:"Synthetic quotation",textHatam:"Synthetic source",englishContext:"Synthetic context",speakerName:"Fixture actor",characterId:null,voiceName:null,startMs:500,endMs:1200,initialClipPath:"fixture/initial.wav",contextClipPath:"fixture/initial.wav",warnings:["Unreviewed fixture"]}]};
 mkdirSync(listeningFolder(root,"p"),{recursive:true});writeFileSync(join(listeningFolder(root,"p"),"manifest.json"),JSON.stringify(manifest));
});
afterEach(async()=>{await new Promise<void>(r=>server?server.close(()=>r()):r());server=undefined;db?.close();if(root)rmSync(root,{recursive:true,force:true});});
it("extracts exact 0.001-second PCM boundaries, preserving both channels and sample values",()=>{
 const wav=wave(),clip=pcmWindow(wav,1001,1131),info=pcmWaveInfo(clip);
 expect(info).toMatchObject({sampleRate:24000,channels:2,frames:3120,durationMs:130});
 expect(clip.subarray(info.dataOffset)).toEqual(wav.subarray(44+24024*4,44+27144*4));
 for(const [a,b] of [[-10,1000],[1000,1000],[1000,2010],[1000.5,1130]])expect(()=>pcmWindow(wav,a!,b!)).toThrow("0.001");
 expect(()=>pcmWaveInfo(wav.subarray(0,90))).toThrow("truncated");
});
it("opening a prepared review does not write or verify anything",()=>{
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:0,items:[{current:null,history:[]}]});
 expect(readListeningClip(db,root,"p","quote-1")).toEqual(pcmWindow(wave(),500,1200));
 expect(db.prepare("SELECT count(*) n FROM review_notes").get()).toMatchObject({n:0});
});
it("keeps multi-verse speech-turn reviews separate from retained verse-window decisions",()=>{
 const verse=saveListeningReview(db,root,"p","quote-1",request());
 const speech:ListeningManifest={...manifest,title:"Synthetic speech turns",items:[{...manifest.items[0]!,id:"speech-run-1",verseRef:"Mark 5:7-9",title:"Continuous quotation",textHatam:"[Mark 5:7] Synthetic source\n[Mark 5:8-9] Continued source",startMs:600,endMs:1500}]};
 put("source-listening-review/p/speech-manifest.json",JSON.stringify(speech));
 expect(readListeningReview(db,root,"p","speech")).toMatchObject({scope:"speech",verifiedCount:0,items:[{id:"speech-run-1",current:null}]});
 const turn=saveListeningReview(db,root,"p","speech-run-1",{...request(),scope:"speech",manifestHash:readListeningReview(db,root,"p","speech").manifestHash,requestId:"speech-request",startMs:650,endMs:1400});
 expect(readListeningReview(db,root,"p","speech")).toMatchObject({verifiedCount:1,items:[{current:{id:turn.id,startMs:650,endMs:1400}}]});
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:1,items:[{current:{id:verse.id}}]});
 expect(readListeningClip(db,root,"p","speech-run-1","speech")).toEqual(pcmWindow(wave(),650,1400));
 expect(()=>saveListeningReview(db,root,"p","speech-run-1",request({scope:"speech"}))).toThrow("item changed");
});
it("records a producer's narrator-only correction against the reviewed passage without changing source or posing as a listener",()=>{
 const review=saveListeningReview(db,root,"p","quote-1",request({speakerLabel:"Fixture actor"}));
 const before=db.prepare("SELECT * FROM audio_segments").all();
 const input={itemId:"quote-1",manifestHash:readListeningReview(db,root,"p").manifestHash,reviewId:review.id,reviewerName:"Codex recording producer answer",evidence:"Producer explicitly confirmed this passage is narrator-only."};
 const decision=recordListeningNarrationDecision(db,root,"p",input);
 expect(recordListeningNarrationDecision(db,root,"p",input).id).toBe(decision.id);
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:1,items:[{current:{id:review.id,reviewerName:"Fixture reviewer"},resolution:{treatment:"narration",evidence:input.evidence}}]});
 expect(db.prepare("SELECT * FROM audio_segments").all()).toEqual(before);
 expect(()=>recordListeningNarrationDecision(db,root,"p",{...input,evidence:"different"})).toThrow("different narration decision");
 saveListeningReview(db,root,"p","quote-1",request({action:"draft",requestId:"new-revision",baseRevision:review.id}));
 expect(readListeningReview(db,root,"p").items[0]!.resolution).toBeNull();
 const revised=saveListeningReview(db,root,"p","quote-1",request({action:"verify",requestId:"reverified",baseRevision:readListeningReview(db,root,"p").items[0]!.current!.id}));
 const reconciled=recordListeningNarrationDecision(db,root,"p",{...input,reviewId:revised.id,evidence:"Producer reaffirmed narrator-only after a new listening revision."});
 expect(reconciled.id).not.toBe(decision.id);
 expect(readListeningReview(db,root,"p").items[0]!.resolution).toMatchObject({treatment:"narration",evidence:"Producer reaffirmed narrator-only after a new listening revision."});
});
it("reconciles approximate source rows while retaining both listening manifests, verified WAVs and a narrator decision",()=>{
 db.prepare("UPDATE audio_segments SET end_ms=1200 WHERE id='a'").run();
 db.exec("INSERT INTO audio_segments VALUES ('b','p','original_reading','fixture/audio.mp3',1200,2000,NULL,'Mark 5:8',80,1)");
 const hashes=sourceReviewHashes(db,"p",root);
 manifest={...manifest,...hashes,items:[{...manifest.items[0]!,startMs:0,endMs:1200},{...manifest.items[0]!,id:"v8",kind:"narration",verseRef:"Mark 5:8",startMs:1200,endMs:2000}]};
 writeFileSync(join(listeningFolder(root,"p"),"manifest.json"),JSON.stringify(manifest));
 const speech:ListeningManifest={...manifest,title:"Speech review",items:[{...manifest.items[0]!,id:"speech-1",startMs:650,endMs:1500}]};
 writeFileSync(join(listeningFolder(root,"p"),"speech-manifest.json"),JSON.stringify(speech));
 const verseReview=saveListeningReview(db,root,"p","quote-1",request());
 const speechManifestHash=readListeningReview(db,root,"p","speech").manifestHash;
 const speechReview=saveListeningReview(db,root,"p","speech-1",{...request(),scope:"speech",manifestHash:speechManifestHash,requestId:"speech-review",startMs:700,endMs:1400});
 recordListeningNarrationDecision(db,root,"p",{itemId:"speech-1",manifestHash:speechManifestHash,reviewId:speechReview.id,reviewerName:"Fixture producer",evidence:"Narrated action confirmed",scope:"speech"});
 const backupPath=join(root,"backup.sqlite");writeFileSync(backupPath,"retained fixture snapshot");
 const input={projectId:"p",verseManifestHash:readListeningReview(db,root,"p").manifestHash,speechManifestHash,sourceHash:hashes.sourceHash,originalAlignmentHash:hashes.alignmentHash,reviewerName:"Fixture producer",evidence:"Approximate navigation only; preserve exact listening evidence.",backupPath,boundaries:[{afterItemId:"quote-1",toMs:1300,basis:"Move into the reviewed pause."}]};
 expect(()=>reconcileSourceRows(db,root,{...input,boundaries:[{afterItemId:"quote-1",toMs:1100,basis:"Wrong edge"}]})).toThrow("outside its proposed row");
 expect(db.prepare("SELECT count(*) n FROM audio_segments WHERE project_id='p'").get()).toMatchObject({n:2});
 const applied=reconcileSourceRows(db,root,input);
 expect(reconcileSourceRows(db,root,input).id).toBe(applied.id);
 expect(applied).toMatchObject({originalAlignmentHash:hashes.alignmentHash,manifestHashes:{verse:input.verseManifestHash,speech:speechManifestHash},boundaryRevisions:[{afterItemId:"quote-1",fromMs:1200,toMs:1300}]});
 expect(sourceReviewHashes(db,"p",root)).toMatchObject({sourceHash:hashes.sourceHash,alignmentHash:applied.appliedAlignmentHash});
 expect(db.prepare("SELECT start_ms,end_ms,verse_ref FROM audio_segments WHERE project_id='p' ORDER BY start_ms").all()).toMatchObject([{start_ms:0,end_ms:1300,verse_ref:"Mark 5:7"},{start_ms:1300,end_ms:2000,verse_ref:"Mark 5:8"}]);
 expect(readListeningReview(db,root,"p").reconciliation).toMatchObject({id:applied.id});
 expect(readListeningReview(db,root,"p").items[0]!.current).toMatchObject({id:verseReview.id});
 expect(readListeningReview(db,root,"p").items[0]!.sourceRow).toEqual({startMs:0,endMs:1300,verseRef:"Mark 5:7"});
 expect(readListeningReview(db,root,"p","speech")).toMatchObject({reconciliation:{id:applied.id},items:[{current:{id:speechReview.id},resolution:{treatment:"narration"}}]});
 expect(readListeningClip(db,root,"p","speech-1","speech")).toEqual(pcmWindow(wave(),700,1400));
 const rowsBefore=db.prepare("SELECT * FROM audio_segments ORDER BY start_ms").all();
 const revised=saveListeningReview(db,root,"p","quote-1",request({baseRevision:verseReview.id,requestId:"later-review",startMs:1001,endMs:1131,speakerLabel:"Jesus"}));
 expect(revised).toMatchObject({previousRevision:verseReview.id,verified:true,startMs:1001,endMs:1131});
 expect(readListeningReview(db,root,"p").items[0]).toMatchObject({current:{id:revised.id},sourceRow:{startMs:0,endMs:1300},history:[{id:verseReview.id},{id:revised.id}]});
 expect(readListeningClip(db,root,"p","quote-1")).toEqual(pcmWindow(wave(),1001,1131));
 expect(db.prepare("SELECT * FROM audio_segments ORDER BY start_ms").all()).toEqual(rowsBefore);
 const speechRevised=saveListeningReview(db,root,"p","speech-1",{...request({scope:"speech",manifestHash:speechManifestHash,baseRevision:speechReview.id,requestId:"speech-revised",startMs:701,endMs:1399})});
 expect(readListeningReview(db,root,"p","speech").items[0]).toMatchObject({current:{id:speechRevised.id},resolution:null});
 expect(db.prepare("SELECT * FROM audio_segments ORDER BY start_ms").all()).toEqual(rowsBefore);
 const originalHash=sourceReviewHashes(db,"p",root);
 db.prepare("UPDATE audio_segments SET verse_ref='Mark 5:7-8' WHERE start_ms=0").run();
 const boundHash=sourceReviewHashes(db,"p",root);
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES('binding','p','project','p','qc',?,0,9)").run(sourceSpeechBindingPrefix+JSON.stringify({id:"binding",projectId:"p",reconciliationId:applied.id,sourceHash:originalHash.sourceHash,previousAlignmentHash:originalHash.alignmentHash,appliedAlignmentHash:boundHash.alignmentHash,manifestHashes:{verse:input.verseManifestHash,speech:speechManifestHash},reviewIds:[speechRevised.id],windows:[{itemId:"speech-1",reviewId:speechRevised.id,startMs:701,endMs:1399,characterId:null,treatment:"original"}]}));
 expect(readListeningReview(db,root,"p").items[0]!.current).toMatchObject({id:revised.id});
 expect(readListeningReview(db,root,"p","speech").items[0]!.current).toMatchObject({id:speechRevised.id});
 expect(()=>saveListeningReview(db,root,"p","speech-1",{...request(),scope:"speech",manifestHash:speechManifestHash,baseRevision:speechRevised.id,requestId:"after-binding"})).toThrow("applied");
 db.prepare("DELETE FROM review_notes WHERE note LIKE ?").run("Source listening reconciliation revision v1\n%");
 expect(()=>readListeningReview(db,root,"p")).toThrow("changed after source-row reconciliation");
});
it("saves a millisecond window and a reviewed speaker label without attributing the source row",()=>{
 const saved=saveListeningReview(db,root,"p","quote-1",request({startMs:1001,endMs:1131,speakerLabel:"Jesus"}));
 expect(saved).toMatchObject({startMs:1001,endMs:1131,speakerLabel:"Jesus",verified:true});
 expect(readListeningClip(db,root,"p","quote-1")).toEqual(pcmWindow(wave(),1001,1131));
 expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE id='a'").get()).toMatchObject({speaker_character_id:null});
});
it("retains each named revision and WAV, invalidating verification on a later saved edit without changing source",()=>{
 const original=db.prepare("SELECT * FROM audio_segments").all();
 const draft=saveListeningReview(db,root,"p","quote-1",request({action:"draft"}));
 expect(draft.verified).toBe(false);
 const verified=saveListeningReview(db,root,"p","quote-1",request({requestId:"request-2",baseRevision:draft.id}));
 expect(readListeningReview(db,root,"p").verifiedCount).toBe(1);
 const edited=saveListeningReview(db,root,"p","quote-1",request({action:"draft",startMs:1010,requestId:"request-3",baseRevision:verified.id}));
 expect(edited.previousRevision).toBe(verified.id);
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:0,items:[{current:{id:edited.id,verified:false},history:[{id:draft.id},{id:verified.id},{id:edited.id}]}]});
 expect(readFileSync(join(root,"assets",verified.clipPath))).toEqual(pcmWindow(wave(),1000,1130));
 expect(readListeningClip(db,root,"p","quote-1")).toEqual(pcmWindow(wave(),1010,1130));
 expect(db.prepare("SELECT * FROM audio_segments").all()).toEqual(original);
 expect(db.prepare("SELECT count(*) n FROM source_alignment_reviews").get()).toMatchObject({n:0});
});
it("requires a named, explicit confirmation and valid millisecond bounds",()=>{
 for(const extra of [{reviewerName:" "},{attestation:undefined},{startMs:1000.5},{endMs:2001},{startMs:1200},{manifestHash:"wrong"},{baseRevision:"missing"}])expect(()=>saveListeningReview(db,root,"p","quote-1",request(extra))).toThrow();
 expect(()=>saveListeningReview(db,root,"p","missing",request())).toThrow("item changed");
 expect(()=>readListeningReview(db,root,"../p")).toThrow();
 expect(db.prepare("SELECT count(*) n FROM review_notes").get()).toMatchObject({n:0});
});
it("rejects stale sources, alignment and prepared audio before saving",()=>{
 const input=request();put("fixture/source.wav",wave().fill(0,100,102));
 expect(()=>saveListeningReview(db,root,"p","quote-1",input)).toThrow("audio changed");put("fixture/source.wav",wave());
 db.exec("UPDATE audio_segments SET end_ms=1990");expect(()=>saveListeningReview(db,root,"p","quote-1",input)).toThrow("alignment changed");db.exec("UPDATE audio_segments SET end_ms=2000");
 put("fixture/audio.mp3","changed source");expect(()=>saveListeningReview(db,root,"p","quote-1",input)).toThrow("Bound source inputs changed");
 expect(db.prepare("SELECT count(*) n FROM review_notes").get()).toMatchObject({n:0});
});
it("handles retries once and prevents another tab or an old retry from replacing newer review",()=>{
 const input=request(),first=saveListeningReview(db,root,"p","quote-1",input);
 expect(saveListeningReview(db,root,"p","quote-1",input).id).toBe(first.id);
 expect(()=>saveListeningReview(db,root,"p","quote-1",{...input,note:"changed"})).toThrow("different review");
 expect(()=>saveListeningReview(db,root,"p","quote-1",{...input,requestId:"other-tab"})).toThrow("Another review");
 saveListeningReview(db,root,"p","quote-1",{...input,baseRevision:first.id,requestId:"second",action:"draft"});
 expect(()=>saveListeningReview(db,root,"p","quote-1",input)).toThrow("after this request");
 expect(db.prepare("SELECT count(*) n FROM review_notes").get()).toMatchObject({n:2});
});
it("does not reuse saved approvals after a prepared manifest changes and detects damaged saved audio",()=>{
 const r=saveListeningReview(db,root,"p","quote-1",request());put(r.clipPath,"damaged");expect(()=>readListeningClip(db,root,"p","quote-1")).toThrow("saved clip changed");
 manifest.items[0]!.textHatam="Reconciled source quotation";writeFileSync(join(listeningFolder(root,"p"),"manifest.json"),JSON.stringify(manifest));
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:0,items:[{current:null,staleHistory:true}]});
 expect(db.prepare("SELECT count(*) n FROM review_notes").get()).toMatchObject({n:1});
});
it("serves the review page, precise saved WAV and current verification through the project API",async()=>{
 const {projectsRouter}=await import("../../src/server/routes/projects.js");const app=express();app.use(express.json());app.use("/api/projects",projectsRouter);server=app.listen(0);await new Promise(r=>server!.once("listening",r));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/projects/p/source-listening-review`;
 expect(await (await fetch(url.replace('/source-listening-review','/audio-segments?layer=original_reading'))).json()).toMatchObject({sourceListeningReviewAvailable:true});
 expect(await (await fetch(url.replace('/p/source-listening-review','/other/audio-segments?layer=original_reading'))).json()).toMatchObject({sourceListeningReviewAvailable:false});
 const html=await (await fetch(url)).text();expect(html).toContain('step="0.001"');expect(html).toContain('data-step="-1"');expect(html).toContain('data-step="10"');expect(html).toContain('data-step="-100"');expect(html).toContain('data-step="100"');expect(html).toContain('data-action="verify"');expect(html).toContain('source-listening-review.js');
 expect(await (await fetch(url+"/data")).json()).toMatchObject({verifiedCount:0});
 const response=await fetch(url+"/items/quote-1",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request())});expect(response.status).toBe(201);
 expect(await (await fetch(url+"/data")).json()).toMatchObject({verifiedCount:1});
 const clip=await fetch(url+"/items/quote-1/audio");expect(clip.headers.get("content-type")).toContain("audio/wav");expect(Buffer.from(await clip.arrayBuffer())).toEqual(pcmWindow(wave(),1000,1130));
 expect((await fetch(url+"/items/quote-1",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request({startMs:1001}))})).status).toBe(409);
 const speech={...manifest,items:[{...manifest.items[0]!,id:"speech-run-1",startMs:600,endMs:1500}]};put("source-listening-review/p/speech-manifest.json",JSON.stringify(speech));
 expect(await (await fetch(url+"/data?scope=speech")).json()).toMatchObject({scope:"speech",verifiedCount:0,items:[{id:"speech-run-1"}]});
 const speechClip=await fetch(url+"/items/speech-run-1/audio?scope=speech");expect(Buffer.from(await speechClip.arrayBuffer())).toEqual(pcmWindow(wave(),500,1200));
});

function readyToApply(extraItems:ListeningManifest["items"]=[]) {
 const name=Buffer.from("word/document.xml"),body=Buffer.from('<w:document>'+Array.from({length:43},(_,i)=>`<w:p><w:r><w:t>${i+1}Supplied fixture verse ${i+1}.</w:t></w:r></w:p>`).join('')+'</w:document>'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(body.length,20);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+body.length,16);
 const docx=Buffer.concat([local,name,body,central,name,end]);put("fixture/source.docx",docx);put("fixture/english.docx",docx);
 db.prepare("UPDATE project_source_bindings SET docx_hash=?,reference_hash=? WHERE project_id='p'").run(listeningHash(docx),listeningHash(docx));
 db.exec("UPDATE projects SET status='held'; INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES('speaker','Fixture actor','global','approved','Papuan',1,1)");
 manifest.items[0]!.characterId="speaker";manifest.items.push(...extraItems);Object.assign(manifest,sourceReviewHashes(db,"p",root));writeFileSync(join(listeningFolder(root,"p"),"manifest.json"),JSON.stringify(manifest));
 saveListeningReview(db,root,"p","quote-1",request());
 return {projectId:"p",reviewerName:"Fixture reviewer",evidence:"Explicit fixture instruction: apply the listened boundaries, retain narrator and hold film.",backupPath:"fixture-backup.sqlite",resolutions:[] as Array<{itemId:string;treatment:"covered"|"narration";coveredBy?:string;evidence:string}>};
}
it("atomically applies exact speech bounds, retains outside source audio and leaves applied reviews readable without whole-chapter approval",()=>{
 const input=readyToApply(),bytes=readFileSync(join(listeningFolder(root,"p"),"manifest.json")),notesBefore=db.prepare("SELECT * FROM review_notes").all();
 const result=applyListeningReview(db,root,input),rows=db.prepare("SELECT start_ms,end_ms,speaker_character_id FROM audio_segments ORDER BY start_ms").all();
 expect(rows).toEqual([{start_ms:0,end_ms:1000,speaker_character_id:null},{start_ms:1000,end_ms:1130,speaker_character_id:"speaker"},{start_ms:1130,end_ms:2000,speaker_character_id:null}]);
 expect(result.beforeSegments).toHaveLength(1);expect(result.windows).toHaveLength(1);
 expect(readFileSync(join(listeningFolder(root,"p"),"manifest.json"))).toEqual(bytes);
 expect(db.prepare("SELECT * FROM review_notes WHERE id=?").get(notesBefore[0]!.id!)).toEqual(notesBefore[0]);
 expect(readListeningReview(db,root,"p")).toMatchObject({verifiedCount:1,resolvedCount:1,application:{id:result.id}});
 expect(()=>saveListeningReview(db,root,"p","quote-1",request({requestId:"after-apply"}))).toThrow("have been applied");
 expect(applyListeningReview(db,root,input).id).toBe(result.id);
 expect(db.prepare("SELECT count(*) n FROM source_alignment_reviews").get()).toMatchObject({n:0});expect(db.prepare("SELECT status FROM projects").get()).toMatchObject({status:"held"});
 db.exec("UPDATE audio_segments SET end_ms=1990 WHERE end_ms=2000");expect(()=>readListeningReview(db,root,"p")).toThrow("alignment changed");
});
it("resolves a covered duplicate and an explicit narrator fragment without manufacturing individual verifications",()=>{
 const original=manifest.items[0]!,input=readyToApply([
  {...original,id:"tail",kind:"alignment",startMs:1110,endMs:1130,characterId:null},
  {...original,id:"narrator",kind:"alignment",startMs:300,endMs:400,characterId:null},
 ]);
 expect(()=>applyListeningReview(db,root,input)).toThrow("Unresolved listening item");
 input.resolutions=[{itemId:"tail",treatment:"covered",coveredBy:"quote-1",evidence:"Producer heard one utterance; tail is within the verified parent."},{itemId:"narrator",treatment:"narration",evidence:"Producer confirms that fragment belongs to the original narrator."}];
 const application=applyListeningReview(db,root,input),review=readListeningReview(db,root,"p");
 expect(application.windows).toHaveLength(2);expect(review).toMatchObject({verifiedCount:1,resolvedCount:3});expect(review.items.find(i=>i.id==="tail")!.current).toBeNull();
 expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE start_ms=300 AND end_ms=400").get()).toMatchObject({speaker_character_id:null});
 expect(db.prepare("SELECT count(*) n FROM edit_commands WHERE command_type='confirm_continuous_speech'").get()).toMatchObject({n:5});
});
it("rolls back all splits, mappings and attributions if the source application fails partway through",()=>{
 const input=readyToApply(),before=db.prepare("SELECT * FROM audio_segments").all(),notes=db.prepare("SELECT * FROM review_notes").all();
 db.exec("CREATE TRIGGER refuse_confirmation BEFORE INSERT ON edit_commands WHEN NEW.command_type='confirm_continuous_speech' BEGIN SELECT RAISE(ABORT,'fixture confirmation failure'); END");
 expect(()=>applyListeningReview(db,root,input)).toThrow("fixture confirmation failure");
 expect(db.prepare("SELECT * FROM audio_segments").all()).toEqual(before);expect(db.prepare("SELECT * FROM review_notes").all()).toEqual(notes);
 for(const table of ["source_alignment_segment_splits","source_alignment_speaker_attributions","source_alignment_corrections"])expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()).toMatchObject({n:0});
 expect(db.isTransaction).toBe(false);expect(readListeningReview(db,root,"p").verifiedCount).toBe(1);
});
it("retains tiny narrator rounding remnants without assuming larger unlabelled intervals are narration",()=>{
 db.exec("DELETE FROM audio_segments; INSERT INTO audio_segments VALUES('lead','p','original_reading','fixture/audio.mp3',0,299,NULL,'Mark 5:7',80,1),('rounding','p','original_reading','fixture/audio.mp3',299,401,NULL,NULL,NULL,1),('middle','p','original_reading','fixture/audio.mp3',401,600,NULL,'Mark 5:7',80,1),('unknown','p','original_reading','fixture/audio.mp3',600,800,NULL,NULL,NULL,1),('last','p','original_reading','fixture/audio.mp3',800,2000,NULL,'Mark 5:7',80,1)");
 const item=manifest.items[0]!,input=readyToApply([{...item,id:"narrator",kind:"alignment",startMs:300,endMs:400,characterId:null}]);
 input.resolutions=[{itemId:"narrator",treatment:"narration",evidence:"Producer explicitly keeps this fragment in the original narrator voice."}];applyListeningReview(db,root,input);
 const coverage=speechCoverageSegments(db,"p");expect(coverage.find(s=>s.startMs===299)).toMatchObject({speakerId:null,reviewedNarration:true});expect(coverage.find(s=>s.startMs===400)).toMatchObject({speakerId:null,reviewedNarration:true});expect(coverage.find(s=>s.startMs===600)?.reviewedNarration).not.toBe(true);
});
