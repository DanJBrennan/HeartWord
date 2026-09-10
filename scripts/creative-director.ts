/**
 * Runs the Creative Director agent (src/pipeline/creative-direction/
 * index.ts) against one or more real narration coverage gaps (see
 * scripts/report-narration-coverage.ts) and prints its proposals for
 * review. Proposing ideas is cheap (one LLM call per gap) and
 * deliberately does not generate any keyframes/video itself -- a human
 * reviews the printed ideas and decides which to actually build.
 *
 * Usage: npx tsx scripts/creative-director.ts "Mark 2:1-5 (narration)" 36955
 *        (verse_ref and gap_ms come straight from the coverage report)
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { proposeGapFillers } from "../src/pipeline/creative-direction/index.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

async function run() {
  const [verseRefArg, gapMsArg] = process.argv.slice(2);
  if (!verseRefArg || !gapMsArg) {
    console.error('Usage: npx tsx scripts/creative-director.ts "Mark 2:1-5 (narration)" 36955');
    process.exit(1);
  }
  const db = getDb();
  const proposal = await proposeGapFillers(db, PROJECT_ID, verseRefArg, Number(gapMsArg));

  console.log(`\nCreative Director proposal for ${proposal.narrationSpanVerseRef} (gap: ${(proposal.gapMs / 1000).toFixed(1)}s)`);
  console.log("=".repeat(80));
  for (const idea of proposal.ideas) {
    const opTag = idea.operation === "new_shot" ? idea.kind.toUpperCase() : idea.operation.toUpperCase();
    const target = idea.targetShotVerseRef ? ` [target: ${idea.targetShotVerseRef}]` : "";
    const durationLabel = idea.operation === "extend_existing" ? `+${idea.estimatedDurationSec}s` : `~${idea.estimatedDurationSec}s`;
    console.log(`\n[${opTag}]${target} ${idea.label} (${durationLabel}${idea.framing ? `, ${idea.framing}` : ""}${idea.cameraMovement ? `, ${idea.cameraMovement}` : ""})`);
    console.log(`  Characters: ${idea.charactersInvolved.join(", ") || "(none)"}`);
    console.log(`  Description: ${idea.description}`);
    console.log(`  Why this beat: ${idea.narrativeRationale}`);
    console.log(`  Decorum: ${idea.decorumRationale}`);
  }
  console.log(`\nSaved as creative_direction_proposals row ${proposal.id}.`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
