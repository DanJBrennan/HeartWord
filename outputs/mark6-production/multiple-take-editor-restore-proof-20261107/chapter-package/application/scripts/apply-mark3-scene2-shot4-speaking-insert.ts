/**
 * Applies Dan's approved editorial revision for Mark 3:11:
 * keep the original two-person composition as a brief non-speaking bridge,
 * then insert a dedicated, single-face Hatam lip-sync shot of the man with
 * the unclean spirit. The original binding is retained as historical evidence;
 * the speaking insert receives its own immutable binding to the same source span.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const BRIDGE_SHOT_ID = "ffb0efa5-17ed-455a-a444-2f206a8643fd";
const INSERT_SHOT_ID = "cbe08d3c-9b3e-42f7-a982-9fd072ff1e15";
const SOURCE_IMAGE = "C:/Users/danbr/.codex/generated_images/01a0cfae-995e-7281-b679-e30c64aaeae7/exec-e0e9873a-0211-4153-812f-eb98a4b2e2de.png";
const INSERT_IMAGE = "generated/keyframes/codex/cbe08d3c-9b3e-42f7-a982-9fd072ff1e15/scene-2-shot-4-speaking-insert-v1.png";

const prompt = "Producer-approved close medium insert of the Man with the Unclean Spirit, created from his approved Hatam/Papuan close-up and the approved Mark 3:11 lakeshore keyframe. He is the only foreground speaking face; dense Papuan/Hatam crowd, Sea of Galilee, and hills appear behind him. No Jesus visible. No text, English, or invented speech.";

function run() {
  const db = getDb();
  const dataDir = getDataDir();
  const target = join(dataDir, "assets", INSERT_IMAGE);
  const existing = db.prepare("SELECT id FROM shots WHERE id=?").get(INSERT_SHOT_ID) as { id: string } | undefined;
  if (existing) {
    console.log("Speaking insert already applied.");
    return;
  }

  const bridge = db.prepare(`SELECT sh.scene_id,sh.verse_ref,sh.dialogue_character_id FROM shots sh WHERE sh.id=?`).get(BRIDGE_SHOT_ID) as { scene_id: string; verse_ref: string; dialogue_character_id: string } | undefined;
  const binding = db.prepare(`SELECT source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash FROM shot_utterance_bindings WHERE shot_id=?`).get(BRIDGE_SHOT_ID) as { source_audio_segment_id: string; source_start_ms: number; source_end_ms: number; character_version_id: string; source_hash: string } | undefined;
  if (!bridge || !binding) throw new Error("The approved Mark 3:11 shot or source binding is missing.");
  if (!existsSync(SOURCE_IMAGE)) throw new Error("The producer-approved close-up keyframe file is missing.");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(SOURCE_IMAGE, target);

  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    // Move the prior Scene 2 Shot 5 aside before claiming its position.
    db.prepare("UPDATE shots SET sequence=-5 WHERE scene_id=? AND sequence=5").run(bridge.scene_id);
    db.prepare(`UPDATE shots SET needs_lip_sync=0,dialogue_character_id=NULL,coverage_plan='single_clip',coverage_notes=?,status='keyframe_approved' WHERE id=?`).run(
      "Producer revision: retain this two-person Mark 3:11 composition as an approximately two-second non-speaking bridge. Assembly must keep continuous source audio underneath; the spoken source interval is carried by the following dedicated close-up insert.",
      BRIDGE_SHOT_ID
    );
    db.prepare("UPDATE shots SET sequence=6 WHERE scene_id=? AND sequence=-5").run(bridge.scene_id);
    db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,crowd_density,continuity_notes,spatial_view,status,created_at)
      VALUES (?,?,?,?,?,'close_up','static',1,?,'single_clip','packed',?,'reverse_view','keyframe_approved',?)`).run(
      INSERT_SHOT_ID,
      bridge.scene_id,
      5,
      "Dedicated close medium insert: the Man with the Unclean Spirit is the only foreground speaking face, crying out toward off-screen Jesus. Behind him, the dense crowd and Sea of Galilee remain visible from Jesus's perspective. This exact insert carries the real Hatam line only.",
      bridge.verse_ref,
      bridge.dialogue_character_id,
      "Direct continuation of Scene 2 Shot 4 after the two-second bridge. Preserve the approved man's Papuan identity, distressed brown garment, and the lakeshore crowd; no Jesus or other foreground face is visible.",
      now
    );
    db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(INSERT_SHOT_ID, bridge.dialogue_character_id);
    db.prepare(`INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), INSERT_SHOT_ID, binding.source_audio_segment_id, binding.source_start_ms, binding.source_end_ms, binding.character_version_id, binding.source_hash, now, "Dan");
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?, 'codex_imagegen','gpt-image','generate','1080p',?,'accepted',?,0,?)`).run(randomUUID(), INSERT_SHOT_ID, prompt, INSERT_IMAGE, now);
    const note = "Producer approved a split for Mark 3:11: retain the original two-person image as a short bridge, then use this exact single-speaker close-up for the real 1.933-second Hatam utterance. No invented audio; source audio remains continuous in assembly.";
    const insertNote = db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?,?,?,1,?)");
    insertNote.run(randomUUID(), PROJECT_ID, "shot", BRIDGE_SHOT_ID, "human", note, now);
    insertNote.run(randomUUID(), PROJECT_ID, "shot", INSERT_SHOT_ID, "human", note, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(JSON.stringify({ bridgeShot: BRIDGE_SHOT_ID, speakingInsert: INSERT_SHOT_ID, keyframe: INSERT_IMAGE }));
}

run();
