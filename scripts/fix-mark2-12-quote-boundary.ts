/**
 * Fixes a real ingestion-time segmentation error found by Dan watching
 * the assembled Shot 10 (Mark 2:12, "crowd spokesperson amazed") and
 * asking why the spokesperson's real quote ("we have never seen
 * anything like this") wasn't audible/wasn't showing quote marks in the
 * Hatam caption.
 *
 * Root cause (confirmed against generated/alignment/mark-2/chapter-
 * alignment.json, the Gemini-verified chapter-wide word alignment): the
 * original ingestion split (confidence 55/25, an automated guess) drew
 * the "Mark 2:12" dialogue segment at 148102-155984ms, which is only the
 * narrator's framing sentence ("...and glorified God, saying"). The real
 * quoted words ("Mbenjen! Igingat mindur di nok gini ei igyai him
 * bigyo.") actually start at 156190ms and end at 160900ms -- sitting
 * inside what was tagged as pure narration ("Mark 2:12-14 (narration)",
 * 155984-181828ms) with no speaker attached.
 *
 * Also corrects speaker_character_id: it pointed at the RETIRED
 * composite group character (324a5375...), which has no approved voice
 * (hence the earlier fallback to passthrough narrator audio), instead of
 * the current canon spokesperson "Crowd witness (stern man,
 * spokesperson)" (435ab44b...), who already has an approved ElevenLabs
 * voice.
 *
 * After correcting the 3 affected original_reading boundaries, deletes
 * the 3 now-stale composite_cast_master files so runVoicing extracts
 * fresh clips at the corrected boundaries (and re-voices the real
 * quote via ElevenLabs voice conversion instead of passthrough).
 */
import "dotenv/config";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const db = getDb();
const dataDir = getDataDir();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const spokesperson = "435ab44b-bafc-48bc-bc02-5d3d313ab705";

db.prepare(`UPDATE audio_segments SET end_ms = 156190 WHERE id = '47b02a04-eb2e-4cc2-968e-f91525ad4dc3'`).run(); // 2:11-12 (narration): ends before the quote now
db.prepare(`UPDATE audio_segments SET start_ms = 156190, end_ms = 160900, speaker_character_id = ? WHERE id = 'bf27627d-decb-4040-aae9-3183628ecc83'`).run(spokesperson); // 2:12: now the real quote span, correct speaker
db.prepare(`UPDATE audio_segments SET start_ms = 160900 WHERE id = '28dfc26a-694e-472b-afa3-6afb939fe082'`).run(); // 2:12-14 (narration): starts after the quote now

console.log("audio_segments boundaries corrected.");

const composeDir = join(dataDir, "assets", "generated", "hatam", "mark-2", "composite_cast_master");
for (const stale of ["06-mark-2-11-12-narration-passthrough.mp3", "07-mark-2-12-passthrough.mp3", "08-mark-2-12-14-narration-passthrough.mp3"]) {
  const p = join(composeDir, stale);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`removed stale ${stale}`);
  }
}

const result = await runVoicing(projectId);
console.log("runVoicing result:", JSON.stringify(result, null, 2));
