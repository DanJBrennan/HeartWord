import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root="";
vi.mock("../../src/db/client.js",()=>({getDataDir:()=>root,getDb:()=>db}));
import { assembleSingleShot } from "../../src/pipeline/assembly/assemble-single-shot.js";
const ffmpeg=(args:string[])=>execFileSync("ffmpeg",["-v","error","-n",...args],{stdio:["ignore","pipe","pipe"]});
beforeEach(()=>{
  root=mkdtempSync(join(tmpdir(),"hw-assemble-bound-"));mkdirSync(join(root,"assets"));db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
  for(const [name,frequency,duration] of [["original.wav",330,3],["earlier.wav",440,1],["foreign.wav",220,1]] as const)
    ffmpeg(["-f","lavfi","-i",`sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,"-c:a","pcm_s16le",join(root,"assets",name)]);
  ffmpeg(["-f","lavfi","-i","aevalsrc=0.15*sin(2*PI*t*if(lt(t\\,0.1)\\,440\\,if(lt(t\\,0.8)\\,880\\,660))):s=48000:d=1","-c:a","pcm_s16le",join(root,"assets","correct.wav")]);
  for(const color of ["red","blue"])ffmpeg(["-f","lavfi","-i",`color=${color}:s=160x90:r=24:d=1`,"-c:v","libx264","-pix_fmt","yuv420p",join(root,"assets",color+".mp4")]);
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',5,1,1),('old','hatam','mark',4,1,1);
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('speaker','Synthetic speaker','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,created_at)VALUES('v','speaker','current','approved',1),('stale','speaker','old','rejected',1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('scene','p',1,'Mark 5:9','Mark 5:9',1);
    INSERT INTO shots(id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,created_at)VALUES('shot','scene',1,'Synthetic utterance','Mark 5:9',1,'speaker',1);
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,created_at)VALUES
      ('prior','p','original_reading','original.wav',0,1000,'speaker','Mark 5:9',1),('original','p','original_reading','original.wav',1000,2000,'speaker','Mark 5:9',1),
      ('cast-prior','p','composite_cast_master','earlier.wav',0,1000,'speaker','Mark 5:9',1),('cast','p','composite_cast_master','correct.wav',0,1000,'speaker','Mark 5:9',1),
      ('cast-foreign','old','composite_cast_master','foreign.wav',0,1000,'speaker','Mark 4:9',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES
      ('raw','shot','synthetic','fixture','lip_sync','accepted','red.mp4',0,1),('held','shot','synthetic','fixture','lip_sync','hold_for_review','blue.mp4',0,2);
    INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('selected','shot','raw',0,700,1),('unselected','shot','held',0,700,2);`);
  const hash=createHash("sha256").update(readFileSync(join(root,"assets","original.wav"))).digest("hex");
  db.prepare("INSERT INTO composite_audio_source_map(composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at)VALUES('cast','original',?,'v',1)").run(hash);
  db.prepare("INSERT INTO shot_utterance_bindings(id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by)VALUES('binding','shot','original',1100,1800,'v',?,1,'Synthetic fixture reviewer')").run(hash);
});
afterEach(()=>{db?.close();if(root){if(!resolve(root).startsWith(resolve(tmpdir(),"hw-assemble-bound-")))throw Error("Unexpected fixture cleanup target.");rmSync(root,{recursive:true,force:true});root="";}});
function frequency(path:string,start:number,end:number){
  const bytes=ffmpeg(["-i",path,"-f","f32le","-ar","8000","-ac","1","pipe:1"]),pcm=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);let n=0;
  for(let i=Math.round(start*8000)+1;i<end*8000;i++)if(pcm[i-1]!<=0&&pcm[i]!>0)n++;return n/(end-start);
}
it("assembles the exact bound utterance rather than a same-verse line or old chapter, and excludes a newer held take",()=>{
  const result=assembleSingleShot(db,"shot"),path=join(root,"assets",result.assembledVideoPath);
  expect(result).toMatchObject({durationMs:700,hasDialogueAudio:true});
  // Only100-800ms of correct.wav is880Hz; its leading/trailing portions and both other takes differ.
  expect(frequency(path,0.02,0.67)).toBeCloseTo(880,-1);
  const pixel=ffmpeg(["-i",path,"-vf","scale=1:1","-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","pipe:1"]);
  expect(pixel[0]).toBeGreaterThan(200);expect(pixel[2]).toBeLessThan(30);
  expect(db.prepare("SELECT status FROM generation_attempts WHERE id='held'").get()!.status).toBe("hold_for_review");
});
it("holds a stale source binding without falling back to a verse match",()=>{
  db.exec("UPDATE shot_utterance_bindings SET source_hash='changed'");
  expect(()=>assembleSingleShot(db,"shot")).toThrow("approved source, voice");
  expect(db.prepare("SELECT COUNT(*) n FROM generation_attempts WHERE operation='assemble_shot'").get()!.n).toBe(0);
});
it("holds a stale cast voice mapping even when the verse label still matches",()=>{
  db.exec("UPDATE composite_audio_source_map SET voice_version_id='stale'");
  expect(()=>assembleSingleShot(db,"shot")).toThrow("verse fallback is prohibited");
});
it("scopes the legacy unbound lookup to this project",()=>{
  db.exec("DELETE FROM shot_utterance_bindings; UPDATE audio_segments SET verse_ref='Mark 5:8' WHERE id='cast-prior'");
  const result=assembleSingleShot(db,"shot");expect(frequency(join(root,"assets",result.assembledVideoPath),0.2,0.65)).toBeCloseTo(880,-1);
});
