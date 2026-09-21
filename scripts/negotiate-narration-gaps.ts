/**
 * Creative Director proposes gap-filling ideas for a chapter's measured
 * narration shortfalls; the Production Director negotiates each one. Stops
 * there -- it never calls implementApprovedIdeas, so nothing is generated
 * and no image/video money is spent. Approved ideas are recorded in
 * director_resolutions / director_negotiation_log for a producer to act on
 * deliberately.
 *
 * This differs from scripts/run-production-director.ts, which is hardcoded
 * to one project, takes a single gap by hand, and proceeds straight into
 * real keyframe/video generation.
 *
 * Gaps come from the narration-coverage advisory
 * (src/pipeline/casting/narration-coverage.ts), so this works before any
 * media exists for the chapter.
 *
 * Skips any gap that already has a director_resolution, so re-running
 * after adding a lower threshold negotiates only what is genuinely new
 * rather than paying to re-decide settled gaps. Pass --force to
 * re-negotiate everything (e.g. after the shot plan changed).
 *
 * Usage: npx tsx scripts/negotiate-narration-gaps.ts <projectId> [minGapSeconds] [--force]
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { computeNarrationCoverage } from "../src/pipeline/casting/narration-coverage.js";
import { proposeGapFillers } from "../src/pipeline/creative-direction/index.js";
import { negotiateGapProposal } from "../src/pipeline/creative-direction/production-director.js";

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const [projectId, minGapArg] = args.filter(arg => arg !== "--force");
  if (!projectId) {
    console.error("Usage: npx tsx scripts/negotiate-narration-gaps.ts <projectId> [minGapSeconds] [--force]");
    process.exit(1);
  }
  const minGapMs = Number(minGapArg ?? 4) * 1000;
  const db = getDb();

  const settled = new Set(
    force ? [] : (db.prepare(
      "SELECT DISTINCT narration_span_verse_ref FROM director_resolutions WHERE project_id = ?"
    ).all(projectId) as Array<{ narration_span_verse_ref: string }>).map(row => row.narration_span_verse_ref)
  );

  const coverage = computeNarrationCoverage(db, projectId);
  const eligible = coverage.spans.filter(span => span.status === "short" && span.gapMs >= minGapMs)
    .sort((a, b) => b.gapMs - a.gapMs);
  const short = eligible.filter(span => !settled.has(`${span.verseRef} (narration)`));
  const skipped = eligible.length - short.length;
  if (skipped > 0) console.log(`Skipping ${skipped} gap(s) that already have a recorded resolution (pass --force to redo them).`);

  console.log(`${coverage.spans.length} narration span(s); ${short.length} with a shortfall of at least ${(minGapMs / 1000).toFixed(1)}s.`);
  console.log(`Total measured gap: ${(coverage.totalGapMs / 1000).toFixed(1)}s. Negotiating only -- nothing will be generated.\n`);

  let approvedTotal = 0;
  let rejectedTotal = 0;
  let estimatedCostUsd = 0;
  let modelCostUsd = 0;

  for (const span of short) {
    const verseRef = `${span.verseRef} (narration)`;
    console.log(`--- ${verseRef}: ${(span.gapMs / 1000).toFixed(1)}s short ---`);
    try {
      const proposal = await proposeGapFillers(db, projectId, verseRef, span.gapMs);
      const outcome = await negotiateGapProposal(db, projectId, proposal);
      approvedTotal += outcome.approvedIdeas.length;
      rejectedTotal += outcome.rejectedIdeas.length;
      estimatedCostUsd += outcome.estimatedCostUsd;
      // Both halves, or this under-reports by roughly half: proposing the
      // ideas costs a call of its own before the Director sees them.
      const gapModelCostUsd = (proposal.modelCostUsd ?? 0) + outcome.modelCostUsd;
      modelCostUsd += gapModelCostUsd;
      console.log(`  ${outcome.approvedIdeas.length} approved / ${outcome.rejectedIdeas.length} rejected, ` +
        `${outcome.roundsUsed} round(s), reasoning cost $${gapModelCostUsd.toFixed(4)}, ` +
        `est. generation cost if built: $${outcome.estimatedCostUsd.toFixed(2)}`);
      for (const idea of outcome.approvedIdeas) {
        console.log(`    APPROVED [${idea.operation}/${idea.kind}] ${idea.label} (~${idea.estimatedDurationSec}s): ${idea.description}`);
      }
      for (const idea of outcome.rejectedIdeas) {
        console.log(`    rejected [${idea.operation}/${idea.kind}] ${idea.label}`);
      }
    } catch (error) {
      console.log(`  SKIPPED: ${(error as Error).message}`);
    }
    console.log();
  }

  console.log(`TOTAL: ${approvedTotal} approved, ${rejectedTotal} rejected across ${short.length} gap(s).`);
  console.log(`Reasoning cost actually spent on this run: $${modelCostUsd.toFixed(4)} (recorded to cost_ledger_entries).`);
  console.log(`Estimated generation cost if every approved idea is built: $${estimatedCostUsd.toFixed(2)} -- not spent.`);
  console.log("Nothing was generated. Review director_resolutions before building anything.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
