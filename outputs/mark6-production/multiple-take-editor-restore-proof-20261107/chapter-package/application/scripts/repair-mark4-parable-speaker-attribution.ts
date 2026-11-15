/**
 * Repairs the producer-identified attribution gap in the Sower parable.
 * Mark 4:3 begins Jesus's direct speech; the source remains his speech
 * through verse 8.  Verse 9 retains its independently reviewed narrated
 * lead-in and existing Jesus response, so it is deliberately not changed.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { recordSourceAlignmentSpeakerAttribution } from "../src/pipeline/ingestion/source-alignment-speaker-attributions.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const jesusId = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const db = getDb();
const rows = db.prepare(`SELECT id, verse_ref, start_ms, end_ms
  FROM audio_segments
  WHERE project_id=? AND layer='original_reading' AND verse_ref IN ('mark 4:4','mark 4:5','mark 4:6','mark 4:7','mark 4:8')
    AND speaker_character_id IS NULL
  ORDER BY start_ms`).all(projectId) as Array<{ id: string; verse_ref: string; start_ms: number; end_ms: number }>;

if (rows.length !== 7) throw new Error(`Expected the seven unassigned Mark 4:4-8 parable intervals, found ${rows.length}.`);
db.exec("BEGIN IMMEDIATE");
try {
  for (const row of rows) recordSourceAlignmentSpeakerAttribution(db, {
    projectId, audioSegmentId: row.id, characterId: jesusId,
    verseRef: row.verse_ref.replace(/^mark/, "Mark"), reviewerName: "Dan Brennan",
    evidence: "Producer review of the completed Mark 4 film identified this as Jesus continuing the Sower parable begun in Mark 4:3; it is not narrator speech."
  });
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }

const result = await runVoicing(projectId, { sourceSegmentIds: rows.map(row => row.id) });
if (!result.ok || result.generated !== rows.length || result.skippedNoVoice) {
  throw new Error(`Scoped parable cast-audio preparation failed: ${result.reasoning}`);
}
console.log(JSON.stringify({ repairedIntervals: rows.map(({ verse_ref, start_ms, end_ms }) => ({ verse_ref, start_ms, end_ms })), voicing: result }, null, 2));
