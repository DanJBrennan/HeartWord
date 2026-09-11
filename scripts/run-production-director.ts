/**
 * End-to-end: Creative Director proposes ideas for one real narration
 * gap, the Production Director negotiates (up to 10 rounds per idea),
 * then implements whatever got approved (real keyframe/video generation
 * for new_shot ideas; printed instructions for reorder/extend ideas,
 * since those are timeline edits this project still manages by hand in
 * scripts/assemble-full-chapter-with-inserts.ts).
 *
 * Usage: npx tsx scripts/run-production-director.ts "Mark 2:5-8 (narration)" 11083
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { proposeGapFillers } from "../src/pipeline/creative-direction/index.js";
import { negotiateGapProposal } from "../src/pipeline/creative-direction/production-director.js";
import { implementApprovedIdeas } from "../src/pipeline/creative-direction/implement.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

async function run() {
  const [verseRefArg, gapMsArg] = process.argv.slice(2);
  if (!verseRefArg || !gapMsArg) {
    console.error('Usage: npx tsx scripts/run-production-director.ts "Mark 2:5-8 (narration)" 11083');
    process.exit(1);
  }
  const db = getDb();

  console.log(`Creative Director: proposing ideas for ${verseRefArg} (gap ${gapMsArg}ms)...`);
  const proposal = await proposeGapFillers(db, PROJECT_ID, verseRefArg, Number(gapMsArg));
  console.log(`  -> ${proposal.ideas.length} initial idea(s) proposed.`);

  console.log(`\nProduction Director: negotiating...`);
  const outcome = await negotiateGapProposal(db, PROJECT_ID, proposal);
  console.log(`  -> ${outcome.approvedIdeas.length} approved, ${outcome.rejectedIdeas.length} rejected, ` +
    `${outcome.roundsUsed} round(s) used, ${outcome.forcedFinalCount} forced-final decision(s), ` +
    `estimated cost $${outcome.estimatedCostUsd.toFixed(2)}.`);

  for (const idea of outcome.approvedIdeas) {
    console.log(`\n  APPROVED [${idea.operation}] ${idea.label}: ${idea.description}`);
  }
  for (const idea of outcome.rejectedIdeas) {
    console.log(`\n  REJECTED [${idea.operation}] ${idea.label}: ${idea.description}`);
  }

  if (outcome.approvedIdeas.length === 0) {
    console.log("\nNothing approved -- stopping before implementation.");
    return;
  }

  console.log(`\nProduction Director: implementing approved ideas...`);
  const result = await implementApprovedIdeas(db, PROJECT_ID, outcome.approvedIdeas);

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
