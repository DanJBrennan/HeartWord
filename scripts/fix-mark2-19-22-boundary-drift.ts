/**
 * Fixes the same class of ingestion-segmentation error as
 * fix-mark2-12-quote-boundary.ts, this time across a cascading run of
 * boundary drift found while auditing every Mark 2 composite_cast_master
 * row against generated/alignment/mark-2/chapter-alignment.json (the
 * Gemini-verified chapter-wide word alignment).
 *
 * Confirmed via overlap analysis (which real verse's alignment segments
 * each DB row's [start_ms,end_ms) span actually covers) that the
 * automated ingestion split (confidence 70-75) drew the Mark 2:19-22
 * dialogue boundaries (all one continuous Jesus monologue -- the
 * bridegroom/cloth/wineskins parable) too early, so each row mostly
 * contains the END of the PREVIOUS verse's audio instead of its own:
 *
 *   old "Mark 2:19" (289305-296528) -> actually still verse 18's tail
 *   old "Mark 2:20" (296528-298252) -> actually verse 19's tail
 *   old "Mark 2:21" (298252-333571) -> actually verses 19+20+start of 21
 *   old "Mark 2:22" (333571-366009) -> actually end of 21 + partial 22
 *
 * Real boundaries per chapter-alignment.json segments 62-83 (all
 * verses=[19|20|21|22], quotePurity 1 except the "Yesus buhup" narration
 * opener at segment 62, quotePurity 0, which stays with the preceding
 * narration row rather than being voiced as Jesus's own dialogue):
 *
 *   Mark 2:19 (narration "18-19" absorbs "Yesus buhup" opener): 298590-316350
 *   Mark 2:20: 316870-326030
 *   Mark 2:21: 326830-338980
 *   Mark 2:22: 341890-359950
 *
 * Speaker is already correctly Jesus (b78bed54) on all four rows --
 * unlike the 2:12 bug, this is a pure boundary-drift fix, no speaker
 * reassignment needed.
 *
 * Mark 2:25-26 was also flagged by a naive per-row check but turned out
 * to be a false positive: its verse_ref spans two verses combined, and
 * its real content correctly covers both real verse 25 (397350-404510)
 * and real verse 26 (405340-423980) -- left untouched.
 */
import "dotenv/config";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const db = getDb();
const dataDir = getDataDir();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

db.prepare(`UPDATE audio_segments SET end_ms = 298590 WHERE id = 'f4144efc-2bac-4c22-9652-49cbe3d72299'`).run(); // 2:18-19 (narration): now ends right before the real quote, absorbing "Yesus buhup"
db.prepare(`UPDATE audio_segments SET start_ms = 298590, end_ms = 316350 WHERE id = 'e96d71cf-21c9-4415-aeae-201208d1382b'`).run(); // 2:19: now the real quote span
db.prepare(`UPDATE audio_segments SET start_ms = 316870, end_ms = 326030 WHERE id = '0e781287-9335-4589-84a2-8f8dcc5fd13b'`).run(); // 2:20: now the real quote span
db.prepare(`UPDATE audio_segments SET start_ms = 326830, end_ms = 338980 WHERE id = '540c202e-d2f9-44eb-aa2c-4e175f85ed0c'`).run(); // 2:21: now the real quote span
db.prepare(`UPDATE audio_segments SET start_ms = 341890, end_ms = 359950 WHERE id = 'b108ff2d-21e8-4894-93ec-8441d40b9934'`).run(); // 2:22: now the real quote span
db.prepare(`UPDATE audio_segments SET start_ms = 359950 WHERE id = '4068bba1-27de-4726-aacb-734ee94efa77'`).run(); // 2:22-24 (narration): starts right after the real 2:22 quote now

console.log("audio_segments boundaries corrected.");

const composeDir = join(dataDir, "assets", "generated", "hatam", "mark-2", "composite_cast_master");
for (const stale of [
  "15-mark-2-18-19-narration-passthrough.mp3",
  "16-mark-2-19-elevenlabs.mp3",
  "17-mark-2-20-elevenlabs.mp3",
  "18-mark-2-21-elevenlabs.mp3",
  "19-mark-2-22-elevenlabs.mp3",
  "20-mark-2-22-24-narration-passthrough.mp3",
]) {
  const p = join(composeDir, stale);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`removed stale ${stale}`);
  }
}

const result = await runVoicing(projectId);
console.log("runVoicing result:", JSON.stringify(result, null, 2));
