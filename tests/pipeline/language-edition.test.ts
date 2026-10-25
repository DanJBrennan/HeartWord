import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertEditionInputsCurrent, createLanguageEdition, preflightLanguageEdition, readLanguageEditionOrigin, readLanguageEditionPlan, reviseLanguageEdition } from "../../src/pipeline/language-edition.js";
import { parseReferenceOnlyVerseMarkers, parseSourceTextByVerse } from "../../src/pipeline/ingestion/parse-source-text.js";
import { materializeEditionCasting, materializeEditionMedia, materializeEditionScenes } from "../../src/pipeline/language-edition-stages.js";
import { sourceReviewHashes } from "../../src/pipeline/ingestion/source-review.js";
import { exportChapterPackage, restoreChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
import { acceptEditionTitleCandidate, buildChapterTitleCard, buildEditionTitleCandidate } from "../../src/pipeline/assembly/chapter-title-card.js";
import { approveEditionVoiceAudition, assertEditionVoiceAuditionApproved, validateEditionAuditionScope } from "../../src/pipeline/language-edition-audition.js";
import { readAcceptedEditorialOpening } from "../../src/pipeline/assembly/editorial-beats.js";
import { VOICE_CHANGER_DEFAULTS } from "../../src/providers/elevenlabs.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let dataDir:string, db:InstanceType<typeof DatabaseSync>;
const title={bookChapter:"Markus 4",languageName:"Meyah",authority:"Dan approved 2026-10-22",durationMs:4000,profile:"mark4-serif-over-establishing" as const,
  backgroundFramePath:"generated/editorial/mark4-intro/establishing-r1.png"};
const input={renderId:"render",targetLanguage:"meyah",title};
const pictureHash=createHash("sha256").update("selected donor picture").digest("hex");
const normalizedTimeline=JSON.stringify([{shotId:"shot",path:"films/scene.mp4",sha256:pictureHash,sourceStartMs:0,startMs:0,endMs:1000}]);
function asset(path:string,content:string|Buffer){const file=join(dataDir,"assets",path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content);}
function docx(lines:string[]):Buffer{const name=Buffer.from("word/document.xml"),bytes=Buffer.from(`<w:document>${lines.map(line=>`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:document>`),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);return Buffer.concat([local,name,bytes,central,name,end]);}
beforeEach(()=>{
  dataDir=mkdtempSync(join(tmpdir(),"heartword-edition-")); db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('donor','hatam','mark',4,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('scene','donor',1,'Mark 4:1','Mark 4:1',1);
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('jesus','Jesus','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,voice_provider,voice_id,created_at)VALUES('voice','jesus','approved','approved','elevenlabs','voice-id',1);
    INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('portrait','voice','headshot','canon/jesus.png',1);
    INSERT INTO shots(id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,created_at)VALUES('shot','scene',1,'Teaching',1,'jesus',1);
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at)VALUES('speech','donor','original_reading','donor.wav',0,1000,'Mark 4:1',1);
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at)VALUES('cast','donor','composite_cast_master','cast/master.mp3',0,1000,'jesus',1);
    INSERT INTO composite_audio_source_map VALUES('cast','speech','audio-sha','voice',1);
    INSERT INTO shot_utterance_bindings VALUES('binding','shot','speech',0,1000,'voice','audio-sha',1,'Dan');
    INSERT INTO chapter_renders VALUES('render','donor','films/mark4.mp4',5000,1,1);
    INSERT INTO chapter_render_manifests VALUES('render','[]','[{"segmentId":"speech","sourceStartMs":0,"sourceEndMs":1000,"startMs":0,"endMs":1000}]');
    INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES('donor-approval','donor',1,'producer_decision','{"renderId":"render","decision":"approved"}','donor-approved-render',1);`);
  db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id='render'").run(normalizedTimeline);
  db.exec(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('donor-frame','shot','fixture','fixture','generate','accepted','films/scene-frame.png',0,1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('donor-picture','shot','fixture','fixture','lip_sync','accepted','films/scene.mp4',0,1);
    INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('donor-clip','shot','donor-picture',0,1000,1);`);
  asset("canon/jesus.png","approved visual");asset("films/mark4.mp4","approved film");
  asset("donor.wav","retained donor audio evidence");
  asset("films/scene.mp4","selected donor picture");asset("films/scene-frame.png","selected donor frame");
  asset("cast/master.mp3","retained cast audio");asset("cast/master.mp3.json",JSON.stringify({voiceId:"voice-id",requestSettings:VOICE_CHANGER_DEFAULTS}));
  asset("generated/editorial/mark4-intro/establishing-r1.png","clean lake frame");
  asset("source/meyah/text/Mark/Mark 4.docx",docx(["MARK 4","1Meyah source words."]));
  asset("source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3","approved audio");
  asset("source/english-esv/text/Mark/Mark 4.docx",docx(["MARK 4","1English reference."]));
});
afterEach(()=>{db.close();rmSync(dataDir,{recursive:true,force:true});});
describe("language edition identity",()=>{
  it("preflights read-only, then creates one normal target and immutable origin",()=>{
    const before=Number((db.prepare("SELECT COUNT(*) n FROM projects").get() as {n:number}).n);
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    expect(pre.status).toBe("ready");expect(pre.holds).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) n FROM projects").get() as {n:number}).n).toBe(before);
    const request={...input,requestId:"first-edition-001",checkedFingerprint:pre.fingerprint!};
    const created=createLanguageEdition(db,dataDir,"donor",request);
    expect(created.created).toBe(true);
    expect(created.project.language).toBe("meyah");
    expect(readLanguageEditionOrigin(db,created.project.id)?.preflight.target.title).toEqual(title);
    expect((db.prepare("SELECT COUNT(*) n FROM stage_executions WHERE project_id=?").get(created.project.id) as {n:number}).n).toBe(0);
    expect(createLanguageEdition(db,dataDir,"donor",request)).toMatchObject({created:false,project:{id:created.project.id}});
    expect(()=>createLanguageEdition(db,dataDir,"donor",{...request,title:{...title,languageName:"Other"}})).toThrow(/Request ID/);
    expect(()=>createLanguageEdition(db,dataDir,"donor",{...request,requestId:"second-edition-002"})).toThrow(/already has an unrelated workspace/);
  });
  it("holds opaque donor recipes, missing target files, changed inputs and wrong title",()=>{
    db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id='render'").run('{"picture":[]}');
    expect(preflightLanguageEdition(db,dataDir,"donor",input).holds.join(" ")).toContain("normalized picture");
    db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id='render'").run(normalizedTimeline);
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    asset("films/mark4.mp4","changed film");
    expect(()=>createLanguageEdition(db,dataDir,"donor",{...input,requestId:"stale-input-001",checkedFingerprint:pre.fingerprint!})).toThrow(/Preflight inputs changed/);
    expect(preflightLanguageEdition(db,dataDir,"donor",{...input,title:{...title,bookChapter:"Mark 3"}}).status).toBe("held");
  });
  it("records exact target speech correspondence with parent hashes and rejects foreign audio",()=>{
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"mapped-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-speech',?,'original_reading','meyah.wav',100,900,'Mark 4:1','jesus',1)").run(target);
    const parent=readLanguageEditionPlan(db,target)!.hash;
    const correspondence=[{donorShotId:"shot",targetSegmentId:"target-speech",targetStartMs:150,targetEndMs:850,treatment:"replace_avatar" as const,reason:"Reviewed exact Jesus window"}];
    const request={requestId:"mapping-review-001",expectedParentHash:parent,correspondence,reviewer:"Dan",evidence:"Source listening review"};
    const saved=reviseLanguageEdition(db,target,request);
    expect(saved.created).toBe(true);
    expect(reviseLanguageEdition(db,target,request).created).toBe(false);
    expect(readLanguageEditionPlan(db,target)?.revision?.correspondence).toEqual(correspondence);
    expect(()=>reviseLanguageEdition(db,target,{...request,requestId:"mapping-review-002"})).toThrow(/parent revision/);
    expect(()=>reviseLanguageEdition(db,target,{...request,requestId:"mapping-review-003",expectedParentHash:saved.revision.revisionHash,
      correspondence:[{...correspondence[0]!,targetSegmentId:"speech"}]})).toThrow(/target original-reading/);
  });
  it("retains Meyah-style reference-only markers without inventing Scripture",()=>{
    const path=join(dataDir,"assets/source/meyah/text/Mark/Mark 4.docx");
    writeFileSync(path,docx(["MARK 4","5Meyah text with straight \"quotes\".","6 (4:5)","18More supplied text.","19 (4:18)","20Next text."]));
    expect(parseReferenceOnlyVerseMarkers(path).map(marker=>marker.raw)).toEqual(["6 (4:5)","19 (4:18)"]);
    const verses=parseSourceTextByVerse(path);
    expect(verses.map(verse=>verse.verse)).toEqual([5,18,20]);
    expect(verses[0]?.referenceOnlyFollowing?.[0]?.verse).toBe(6);
    expect(verses[1]?.referenceOnlyFollowing?.[0]?.verse).toBe(19);
    expect(preflightLanguageEdition(db,dataDir,"donor",input).sourceQuestions).toHaveLength(2);
  });
  it("uses normal scene and casting boundaries after exact target review without copying donor approvals",()=>{
    const pre=preflightLanguageEdition(db,dataDir,"donor",input),target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"stage-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    const audioPath="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-speech',?,'original_reading',?,0,1000,'Mark 4:1','jesus',1)").run(target,audioPath);
    expect(materializeEditionScenes(db,dataDir,target).ok).toBe(false);
    const hashes=sourceReviewHashes(db,target,dataDir);
    db.prepare("INSERT INTO source_alignment_reviews VALUES('target-review',?,'Dan','confirm',?,?,'Reviewed source alignment and wording',1)").run(target,hashes.sourceHash,hashes.alignmentHash);
    expect(materializeEditionScenes(db,dataDir,target).ok).toBe(true);
    expect(materializeEditionCasting(db,dataDir,target).ok).toBe(false);
    const parent=readLanguageEditionPlan(db,target)!.hash;
    reviseLanguageEdition(db,target,{requestId:"stage-map-001",expectedParentHash:parent,reviewer:"Dan",evidence:"Exact target phrase review",
      correspondence:[{donorShotId:"shot",targetSegmentId:"target-speech",targetStartMs:0,targetEndMs:1000,treatment:"replace_avatar",reason:"Same reviewed Jesus passage"}]});
    expect(materializeEditionCasting(db,dataDir,target).ok).toBe(true);
    const targetShot=db.prepare("SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?").get(target) as {id:string};
    expect(targetShot.id).not.toBe("shot");
    expect(db.prepare("SELECT source_audio_segment_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?").get(targetShot.id)).toEqual({source_audio_segment_id:"target-speech",source_start_ms:0,source_end_ms:1000});
    expect((db.prepare("SELECT COUNT(*) n FROM generation_attempts WHERE shot_id=?").get(targetShot.id) as {n:number}).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM clips WHERE shot_id=?").get(targetShot.id) as {n:number}).n).toBe(0);
    expect(materializeEditionMedia(db,dataDir,target).ok).toBe(true);
    expect((db.prepare("SELECT COUNT(*) n FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted'").get(targetShot.id) as {n:number}).n).toBe(1);
    expect(materializeEditionMedia(db,dataDir,target).ok).toBe(true);
    expect((db.prepare("SELECT COUNT(*) n FROM stage_executions WHERE project_id=?").get(target) as {n:number}).n).toBe(0);
    const packageDir=join(dataDir,"edition-package"),restoreDir=join(dataDir,"edition-restored");
    const originalOrigin=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition'").get(target) as {payload:string};
    exportChapterPackage(db,dataDir,target,packageDir,{includeApplication:false});
    restoreChapterPackage(packageDir,restoreDir);
    const reopened=new DatabaseSync(join(restoreDir,"db/heartword.sqlite"));try{
      renameSync(join(dataDir,"assets"),join(dataDir,"assets-hidden"));
      expect(reopened.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(reopened.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition'").get(target)).toEqual(originalOrigin);
      expect(reopened.prepare("SELECT id FROM chapter_renders WHERE id='render'").get()).toEqual({id:"render"});
      expect(reopened.prepare("SELECT id FROM shot_utterance_bindings WHERE shot_id=?").get(targetShot.id)).toBeTruthy();
      expect(()=>assertEditionInputsCurrent(reopened,restoreDir,target)).not.toThrow();
      expect(createLanguageEdition(reopened,restoreDir,"donor",{...input,requestId:"stage-edition-001",checkedFingerprint:pre.fingerprint!}).created).toBe(false);
    }finally{renameSync(join(dataDir,"assets-hidden"),join(dataDir,"assets"));reopened.close();}
    db.prepare("UPDATE audio_segments SET start_ms=10,end_ms=1010 WHERE id='target-speech'").run();
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/Target source interval/);
  });
  it("holds changed pinned voice, title background, keyframe and target recording bytes",()=>{
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"changed-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    db.prepare("UPDATE character_versions SET voice_id='changed-under-same-version' WHERE id='voice'").run();
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/canon or voice/);
    db.prepare("UPDATE character_versions SET voice_id='voice-id' WHERE id='voice'").run();
    const sidecar="cast/master.mp3.json",savedSidecar=readFileSync(join(dataDir,"assets",sidecar));
    asset(sidecar,JSON.stringify({voiceId:"voice-id",requestSettings:{...VOICE_CHANGER_DEFAULTS,voice_settings:{stability:0.25}}}));
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/historical ElevenLabs/);
    asset(sidecar,savedSidecar);
    asset("films/scene-frame.png","changed frame");
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/keyframe/);
    asset("films/scene-frame.png","selected donor frame");
    asset(title.backgroundFramePath,"changed clean background");
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/title background/);
    asset(title.backgroundFramePath,"clean lake frame");
    const targetAudio="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    asset(targetAudio,"changed target recording");
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).toThrow(/target source/);
  });
  it("reuses a selected non-speaking picture trim without carrying donor audio or provider cost",()=>{
    const donorVideo=join(dataDir,"assets/films/cutaway.mp4");
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=320x180:r=24","-f","lavfi","-i","sine=frequency=440:sample_rate=48000",
      "-t","1.2","-c:v","libx264","-c:a","aac","-shortest",donorVideo]);
    const cutawayHash=createHash("sha256").update(readFileSync(donorVideo)).digest("hex");
    db.exec(`INSERT INTO shots(id,scene_id,sequence,action,needs_lip_sync,created_at)VALUES('cutaway','scene',2,'Listening',0,1);
      INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('cutaway-frame','cutaway','fixture','fixture','generate','accepted','films/cutaway-frame.png',0,1);
      INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('cutaway-picture','cutaway','fixture','fixture','generate_final_video','accepted','films/cutaway.mp4',0,1);
      INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('cutaway-clip','cutaway','cutaway-picture',0,1200,1);`);
    asset("films/cutaway-frame.png","accepted scene frame");
    db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id='render'").run(JSON.stringify([
      {shotId:"shot",path:"films/scene.mp4",sha256:pictureHash,sourceStartMs:0,startMs:0,endMs:1000},
      {shotId:"cutaway",path:"films/cutaway.mp4",sha256:cutawayHash,sourceStartMs:100,startMs:1000,endMs:2000}]));
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    expect(pre.status).toBe("ready");
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"cutaway-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    const audioPath="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-speech',?,'original_reading',?,0,1000,'Mark 4:1','jesus',1)").run(target,audioPath);
    const hashes=sourceReviewHashes(db,target,dataDir);
    db.prepare("INSERT INTO source_alignment_reviews VALUES('cutaway-review',?,'Dan','confirm',?,?,'Reviewed target source',1)").run(target,hashes.sourceHash,hashes.alignmentHash);
    expect(materializeEditionScenes(db,dataDir,target).ok).toBe(true);
    reviseLanguageEdition(db,target,{requestId:"cutaway-map-001",expectedParentHash:readLanguageEditionPlan(db,target)!.hash,reviewer:"Dan",evidence:"Reviewed target sound and listener cutaway",
      correspondence:[{donorShotId:"shot",targetSegmentId:"target-speech",targetStartMs:0,targetEndMs:1000,treatment:"replace_avatar",reason:"Visible target speech"},
        {donorShotId:"cutaway",targetSegmentId:null,targetStartMs:null,targetEndMs:null,treatment:"reuse_picture",reason:"Listener has no speech mouth"}]});
    expect(materializeEditionCasting(db,dataDir,target).ok).toBe(true);
    expect(materializeEditionMedia(db,dataDir,target).ok).toBe(true);
    const reuse=db.prepare(`SELECT ga.result_asset_path path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
      WHERE sc.project_id=? AND sh.action='Listening' AND ga.operation='generate_final_video'`).get(target) as {path:string};
    const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",join(dataDir,"assets",reuse.path)],{encoding:"utf8"})) as {streams:Array<{codec_type:string}>};
    expect(probe.streams.map(stream=>stream.codec_type)).toEqual(["video"]);
    expect((db.prepare("SELECT COALESCE(SUM(amount_usd),0) sum FROM cost_ledger_entries WHERE project_id=?").get(target) as {sum:number}).sum).toBe(0);
  });
  it("builds and explicitly selects the pinned Meyah title through the normal opening beat",()=>{
    const background=join(dataDir,"assets",title.backgroundFramePath);
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=navy:s=1280x720:r=24","-frames:v","1","-y",background]);
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    expect(pre.status).toBe("ready");
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"title-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    const audioPath="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-speech',?,'original_reading',?,0,1000,'Mark 4:1','jesus',1)").run(target,audioPath);
    const hashes=sourceReviewHashes(db,target,dataDir);
    db.prepare("INSERT INTO source_alignment_reviews VALUES('title-review',?,'Dan','confirm',?,?,'Reviewed source',1)").run(target,hashes.sourceHash,hashes.alignmentHash);
    expect(materializeEditionScenes(db,dataDir,target).ok).toBe(true);
    reviseLanguageEdition(db,target,{requestId:"title-map-001",expectedParentHash:readLanguageEditionPlan(db,target)!.hash,reviewer:"Dan",evidence:"Reviewed target audio",
      correspondence:[{donorShotId:"shot",targetSegmentId:"target-speech",targetStartMs:0,targetEndMs:1000,treatment:"replace_avatar",reason:"Same Jesus action"}]});
    expect(materializeEditionCasting(db,dataDir,target).ok).toBe(true);
    const candidate=buildEditionTitleCandidate(db,dataDir,target);
    expect(candidate).toMatchObject({title:"Markus 4",language:"Meyah",durationMs:4000});
    expect(buildEditionTitleCandidate(db,dataDir,target)).toEqual(candidate);
    expect(()=>acceptEditionTitleCandidate(db,dataDir,target,{sha256:"wrong",reviewer:"Dan",evidence:"Viewed title"})).toThrow();
    const accepted=acceptEditionTitleCandidate(db,dataDir,target,{sha256:candidate.sha256,reviewer:"Dan",evidence:"Reviewed lettering and clean lake"});
    expect(acceptEditionTitleCandidate(db,dataDir,target,{sha256:candidate.sha256,reviewer:"Dan",evidence:"Reviewed lettering and clean lake"})).toEqual(accepted);
    expect(readAcceptedEditorialOpening(db,dataDir,target)).toMatchObject([{id:accepted.editorialBeatId,durationMs:4000,path:candidate.path}]);
    const packageDir=join(dataDir,"title-package"),restoreDir=join(dataDir,"title-restored");
    exportChapterPackage(db,dataDir,target,packageDir,{includeApplication:false});restoreChapterPackage(packageDir,restoreDir);
    const reopened=new DatabaseSync(join(restoreDir,"db/heartword.sqlite"));try{
      expect(readAcceptedEditorialOpening(reopened,restoreDir,target)).toMatchObject([{id:accepted.editorialBeatId,durationMs:4000,path:candidate.path}]);
    }finally{reopened.close();}
  });
  it("binds a reviewed mouth window across contiguous target speech segments without guessing a verse boundary",()=>{
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"run-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    const audioPath="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-a',?,'original_reading',?,0,1000,'Mark 4:1','jesus',1)").run(target,audioPath);
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-b',?,'original_reading',?,1000,2000,'Mark 4:1','jesus',1)").run(target,audioPath);
    const hashes=sourceReviewHashes(db,target,dataDir);
    db.prepare("INSERT INTO source_alignment_reviews VALUES('run-review',?,'Dan','confirm',?,?,'Reviewed contiguous performance',1)").run(target,hashes.sourceHash,hashes.alignmentHash);
    const members=db.prepare("SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? ORDER BY start_ms").all(target);
    const run={id:"reviewed-run",characterId:"jesus",verseRef:"Mark 4:1",startMs:0,endMs:2000,sourcePath:audioPath,
      audioHash:createHash("sha256").update(readFileSync(join(dataDir,"assets",audioPath))).digest("hex"),internalVerseTiming:"unresolved",reviewerName:"Dan",evidence:"Continuous Jesus speech",members};
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES('run-command',?,2,'confirm_continuous_speech',?,'run-command',2)")
      .run(target,JSON.stringify({run,sourceHash:hashes.sourceHash}));
    expect(materializeEditionScenes(db,dataDir,target).ok).toBe(true);
    reviseLanguageEdition(db,target,{requestId:"run-map-001",expectedParentHash:readLanguageEditionPlan(db,target)!.hash,reviewer:"Dan",evidence:"Listened to exact window across the old row edge",
      correspondence:[{donorShotId:"shot",targetSegmentId:"target-a",targetSpeechRunId:"reviewed-run",targetStartMs:500,targetEndMs:1500,
        treatment:"replace_avatar",reason:"Exact phrase timing independently checked"}]},dataDir);
    expect(materializeEditionCasting(db,dataDir,target).ok).toBe(true);
    const binding=db.prepare("SELECT source_audio_segment_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE source_audio_segment_id='target-a'").get();
    expect(binding).toEqual({source_audio_segment_id:"target-a",source_start_ms:500,source_end_ms:1500});
    expect(db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='bind_speech_run_utterance'").get(target)).toBeTruthy();
    expect(()=>assertEditionInputsCurrent(db,dataDir,target)).not.toThrow();
  });
  it("holds bulk target voicing until a short, exact, heard cast sample is approved",()=>{
    const pre=preflightLanguageEdition(db,dataDir,"donor",input);
    const target=createLanguageEdition(db,dataDir,"donor",{...input,requestId:"audition-edition-001",checkedFingerprint:pre.fingerprint!}).project.id;
    const audioPath="source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3";
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at)VALUES('target-audition',?,'original_reading',?,0,3000,'Mark 4:1','jesus',1)").run(target,audioPath);
    const hashes=sourceReviewHashes(db,target,dataDir);
    db.prepare("INSERT INTO source_alignment_reviews VALUES('audition-source-review',?,'Dan','confirm',?,?,'Reviewed exact target words',1)")
      .run(target,hashes.sourceHash,hashes.alignmentHash);
    reviseLanguageEdition(db,target,{requestId:"audition-map-001",expectedParentHash:readLanguageEditionPlan(db,target)!.hash,reviewer:"Dan",evidence:"Matched Jesus target words",
      correspondence:[{donorShotId:"shot",targetSegmentId:"target-audition",targetStartMs:0,targetEndMs:3000,treatment:"replace_avatar",reason:"Same teaching"}]});
    expect(()=>assertEditionVoiceAuditionApproved(db,dataDir,target)).toThrow(/held until/);
    expect(()=>validateEditionAuditionScope(db,dataDir,target,["target-audition"])).not.toThrow();
    db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at)VALUES('target-cast',?,'composite_cast_master','generated/meyah/cast.mp3',0,3000,'jesus',1)").run(target);
    const sourceSha=createHash("sha256").update(readFileSync(join(dataDir,"assets",audioPath))).digest("hex");
    db.prepare("INSERT INTO composite_audio_source_map VALUES('target-cast','target-audition',?,'voice',1)").run(sourceSha);
    asset("generated/meyah/cast.mp3","converted Meyah audition");
    asset("generated/meyah/cast.mp3.json",JSON.stringify({voiceId:"voice-id",voiceVersionId:"voice",requestSettings:VOICE_CHANGER_DEFAULTS,
      sourceStartMs:0,sourceEndMs:3000,originalSegmentId:"target-audition"}));
    expect(()=>approveEditionVoiceAudition(db,dataDir,target,{sourceSegmentIds:["target-audition"],reviewer:"Dan",evidence:"Native listener approved exact words"})).not.toThrow();
    expect(()=>assertEditionVoiceAuditionApproved(db,dataDir,target)).not.toThrow();
    asset("generated/meyah/cast.mp3","changed converted voice");
    expect(()=>assertEditionVoiceAuditionApproved(db,dataDir,target)).toThrow(/stale/);
  });
  it("renders generic Markus 5 and Hatam display strings on a clean title frame",()=>{
    const background=join(dataDir,"assets/mark5-clean.png"),video=join(dataDir,"mark5-title.mp4");
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=navy:s=1280x720:r=24","-frames:v","1",background]);
    expect(buildChapterTitleCard({backgroundFrame:background,bookChapter:"Markus 5",languageName:"Hatam",outputVideo:video,durationMs:4000}))
      .toEqual({path:video,durationMs:4000});
    const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","json",video],{encoding:"utf8"})) as {format:{duration:string}};
    expect(Number(probe.format.duration)).toBeCloseTo(4,1);
    expect(()=>buildChapterTitleCard({backgroundFrame:background,bookChapter:"Markus 5",languageName:"Hatam",outputVideo:video,durationMs:4000})).toThrow(/exclusive/);
  });
});
