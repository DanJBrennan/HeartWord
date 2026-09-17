import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptLipSyncCandidate } from "../../src/pipeline/voice-lipsync/candidate-selection.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
describe("lip-sync candidate selection",()=>it("requires explicit acceptance and then reuses its clip",()=>{
  const db=new DatabaseSync(":memory:"); try { db.exec(readFileSync("src/db/schema.sql","utf8"));
    db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1); INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Speaker','global','approved','Papuan',1,1); INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1); INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 2:1','Mark 2:1',1); INSERT INTO shots (id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,created_at) VALUES ('sh','s',1,'speak',1,'c',1); INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at) VALUES ('a','p','original_reading','audio.mp3',0,1000,'c',1); INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by) VALUES ('b','sh','a',100,900,'v','abcdef',1,'producer'); INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('ga','sh','mock','mock','lip_sync','hold_for_review','candidate.mp4',0,1)");
    expect(acceptLipSyncCandidate(db,'p','ga')).toMatchObject({reused:false}); expect(acceptLipSyncCandidate(db,'p','ga')).toMatchObject({reused:true}); expect(db.prepare("SELECT status FROM generation_attempts WHERE id='ga'").get()).toMatchObject({status:'accepted'}); expect(db.prepare("SELECT timeline_end_ms FROM clips").get()).toMatchObject({timeline_end_ms:800});
  } finally {db.close();}
}));
