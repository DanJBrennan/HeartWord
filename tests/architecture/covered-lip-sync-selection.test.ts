import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { acceptCoveredLipSyncCandidate, acceptLipSyncCandidate } from "../../src/pipeline/voice-lipsync/candidate-selection.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

it("selects an approved speaking beat at its own offsets without occupying the setup", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("src/db/schema.sql", "utf8"));
    db.exec(`
      INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('jesus','Jesus','global','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','jesus','v1','approved',1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 3:3','Mark 3:3',1);
      INSERT INTO shots (id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,created_at) VALUES ('shot','scene',3,'Jesus speaks',1,'jesus',1);
      INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at) VALUES ('audio','p','original_reading','audio.mp3',0,8183,'jesus',1);
      INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by) VALUES ('binding','shot','audio',0,8183,'v','hash',1,'Dan');
      INSERT INTO coverage_beats (id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,needs_lip_sync,requires_new_keyframe,status,created_at) VALUES ('3a','shot',1,'master',0,2000,0,0,'accepted',1),('3b','shot',2,'lip_sync_insert',2000,8183,1,1,'accepted',1);
      INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('setup','shot','mock','mock','generate_coverage_base','accepted','setup.mp4',0,1),('take','shot','mock','mock','lip_sync','hold_for_review','take.mp4',0,2),('other','shot','mock','mock','lip_sync','hold_for_review','other.mp4',0,3);
      INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES ('setup-clip','shot','setup',0,2000,1);
    `);
    expect(() => acceptLipSyncCandidate(db, "p", "take")).toThrow(/exact coverage beat/);
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id='take'").get()).toMatchObject({ status: "hold_for_review" });
    const selected = acceptCoveredLipSyncCandidate(db, "p", "take", "3b");
    expect(selected.reused).toBe(false);
    expect(acceptCoveredLipSyncCandidate(db, "p", "take", "3b")).toMatchObject({ clipId: selected.clipId, reused: true });
    expect(db.prepare("SELECT timeline_start_ms,timeline_end_ms FROM clips WHERE generation_attempt_id='take'").get()).toMatchObject({ timeline_start_ms: 2000, timeline_end_ms: 8183 });
    expect(db.prepare("SELECT status FROM generation_attempts WHERE id='take'").get()).toMatchObject({ status: "accepted" });
    expect(() => acceptCoveredLipSyncCandidate(db, "p", "other", "3b")).toThrow(/overlaps/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM clips WHERE shot_id='shot'").get()).toMatchObject({ n: 2 });
  } finally { db.close(); }
});
