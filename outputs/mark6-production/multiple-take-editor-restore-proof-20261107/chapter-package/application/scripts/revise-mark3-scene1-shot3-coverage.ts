/**
 * Records Dan's approved Mark 3 Scene 1 Shot 3 coverage edit:
 * preserve the accepted staging view for two seconds, then cut to a new
 * canonical-Jesus lip-sync insert for the rest of the already-approved line.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50";
const JESUS_ID = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const STAGING_KEYFRAME = "generated/keyframes/codex/b3d64f2d-90ff-4b6c-8cda-dd98391a0d50/scene-1-shot-3-distinct-principal-r2.png";

const db = getDb();
const binding = db.prepare(
  "SELECT source_end_ms - source_start_ms AS duration FROM shot_utterance_bindings WHERE shot_id = ?"
).get(SHOT_ID) as { duration: number } | undefined;
if (!binding || binding.duration <= 2_000) {
  throw new Error("Shot 3 needs an approved utterance binding longer than the two-second setup.");
}
const existing = db.prepare("SELECT COUNT(*) AS count FROM coverage_beats WHERE shot_id = ?").get(SHOT_ID) as { count: number };
if (existing.count > 0) {
  throw new Error("Shot 3 already has coverage beats; refusing to overwrite them.");
}

const now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  const insert = db.prepare(
    `INSERT INTO coverage_beats
      (id, shot_id, sequence, beat_type, audio_start_ms, audio_end_ms, audio_confidence,
       needs_lip_sync, character_id, requires_new_keyframe, keyframe_asset_path, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insert.run(
    randomUUID(), SHOT_ID, 1, "master", 0, 2_000, 100, 0, null, 0, STAGING_KEYFRAME,
    "Dan-approved Shot 3A: retain the accepted medium-close synagogue view as a two-second staging setup before the spoken line; no on-camera speech performance.",
    "accepted", now
  );
  insert.run(
    randomUUID(), SHOT_ID, 2, "lip_sync_insert", 2_000, binding.duration, 100, 1, JESUS_ID, 1, null,
    "Dan-approved Shot 3B: close, eye-level canonical-Jesus performance from the Man with Withered Hand's perspective. Keep the established synagogue softly readable behind Jesus; Jesus is the only visible speaking face and performs the remainder of the exact approved Hatam source-audio interval.",
    "planned", now
  );
  db.prepare(
    "INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(), PROJECT_ID, "shot", SHOT_ID, "human",
    "Dan approved a covered-sequence revision: retain Shot 3's approved view for two seconds, then cut to a new canon-locked Jesus lip-sync insert for the remainder of the bound utterance.",
    1, now
  );
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify({ setupMs: 2_000, lipSyncMs: binding.duration - 2_000 }));
