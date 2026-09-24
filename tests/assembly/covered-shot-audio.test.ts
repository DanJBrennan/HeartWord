import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { resolveCoveredShotAudio } from "../../src/pipeline/assembly/assemble-covered-shot.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at)
      VALUES ('jesus','Jesus','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,created_at)
      VALUES ('voice','jesus','v1','approved',1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 3:3','Mark 3:3',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,created_at)
      VALUES ('shot','scene',3,'Jesus speaks.','Mark 3:3',1,'jesus',1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,created_at)
      VALUES ('original','p','original_reading','original.mp3',29569,37752,'jesus','Mark 3:3',1),
             ('composite','p','composite_cast_master','cast.mp3',0,8173,'jesus',NULL,1);
    INSERT INTO composite_audio_source_map (composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at)
      VALUES ('composite','original','approved-hash','voice',1);
    INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by)
      VALUES ('binding','shot','original',29569,37752,'voice','approved-hash',1,'Dan');`);
  return db;
}

it("assembles a covered shot from its approved source mapping when composite verse_ref is null", () => {
  const db = fixture();
  try {
    expect(resolveCoveredShotAudio(db, "shot", 8183)).toEqual({ sourcePath: "cast.mp3", startMs: 0, endMs: 8173 });
    db.prepare("UPDATE shot_utterance_bindings SET source_start_ms=? WHERE shot_id='shot'").run(31569);
    expect(resolveCoveredShotAudio(db, "shot", 6183)).toEqual({ sourcePath: "cast.mp3", startMs: 1998, endMs: 8173 });
  } finally { db.close(); }
});

it("never falls back to a verse match when the approved mapping has changed", () => {
  const db = fixture();
  try {
    db.prepare("UPDATE composite_audio_source_map SET source_hash='different' WHERE composite_segment_id='composite'").run();
    db.prepare("UPDATE audio_segments SET verse_ref='Mark 3:3' WHERE id='composite'").run();
    expect(() => resolveCoveredShotAudio(db, "shot", 8183)).toThrow(/lacks one current cast-master segment/);
  } finally { db.close(); }
});

it("preserves verse matching for legacy covered shots without an utterance binding", () => {
  const db = fixture();
  try {
    db.prepare("DELETE FROM shot_utterance_bindings WHERE shot_id='shot'").run();
    db.prepare("UPDATE audio_segments SET verse_ref='Mark 3:3' WHERE id='composite'").run();
    expect(resolveCoveredShotAudio(db, "shot", 8183)).toEqual({ sourcePath: "cast.mp3", startMs: 0, endMs: 8173 });
  } finally { db.close(); }
});
