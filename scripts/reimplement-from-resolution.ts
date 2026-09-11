/**
 * Re-runs implementApprovedIdeas against the most recent stored
 * director_resolutions row for a gap, without re-running the
 * negotiation (avoids a wasted LLM call / different ideas when only the
 * implementation step needed a fix -- e.g. the shotId-sanitization bug
 * caught right after the first real run).
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { implementApprovedIdeas } from "../src/pipeline/creative-direction/implement.js";
import type { GapFillIdea } from "../src/pipeline/creative-direction/index.js";

async function run() {
  const [verseRefArg] = process.argv.slice(2);
  if (!verseRefArg) {
    console.error('Usage: npx tsx scripts/reimplement-from-resolution.ts "Mark 2:5-8 (narration)"');
    process.exit(1);
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT project_id, approved_ideas_json FROM director_resolutions WHERE narration_span_verse_ref = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(verseRefArg) as { project_id: string; approved_ideas_json: string } | undefined;
  if (!row) throw new Error(`No director_resolutions row found for ${verseRefArg}`);
  const approvedIdeas: GapFillIdea[] = JSON.parse(row.approved_ideas_json);

  const result = await implementApprovedIdeas(db, row.project_id, approvedIdeas);
  for (const shot of result.newShots) {
    console.log(`  BUILT ${shot.label}: keyframe=${shot.keyframePath}, video=${shot.videoPath} (tier=${shot.videoTier}, $${shot.costUsd.toFixed(2)})`);
  }
  for (const edit of result.timelineEdits) {
    console.log(`  TIMELINE EDIT NEEDED [${edit.operation} -> ${edit.targetShotVerseRef}]: ${edit.instruction}`);
  }
  for (const failure of result.failures) {
    console.log(`  FAILED ${failure.label}: ${failure.error}`);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
