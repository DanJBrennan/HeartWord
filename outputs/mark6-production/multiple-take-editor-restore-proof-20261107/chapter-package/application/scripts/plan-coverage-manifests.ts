/**
 * Plans (or replans) coverage beats for every covered_sequence shot in a
 * project -- see src/pipeline/casting/build-coverage-manifest.ts. Safe to
 * re-run; skips any shot that already has a generated/accepted beat.
 *
 * Run: npx tsx scripts/plan-coverage-manifests.ts <project-id>
 */
import "dotenv/config";
import { buildCoverageManifestsForProject, reconcileCoveragePlans } from "../src/pipeline/casting/build-coverage-manifest.js";
import { getDb } from "../src/db/client.js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: plan-coverage-manifests.ts <project-id>");

const reconciled = reconcileCoveragePlans(projectId);
if (reconciled.length > 0) {
  console.log(`Reconciled ${reconciled.length} stale coverage_plan value(s) against current real durations:`);
  for (const r of reconciled) {
    console.log(
      `  ${(r.verseRef ?? r.shotId).padEnd(16)} ${r.from} -> ${r.to} (${(r.durationMs / 1000).toFixed(1)}s)` +
        `${r.plannedBeatsRemoved > 0 ? `, removed ${r.plannedBeatsRemoved} now-unneeded planned beat(s)` : ""}`
    );
  }
  console.log();
}

const result = buildCoverageManifestsForProject(projectId);
console.log(result.reasoning);
console.log();

for (const shot of result.shots) {
  console.log(`${shot.status.padEnd(28)} ${shot.verseRef ?? shot.shotId} -- ${shot.beatCount} beat(s)${shot.detail ? ` (${shot.detail})` : ""}`);
}

if (result.shots.some((s) => s.status === "planned")) {
  const db = getDb();
  console.log("\nBeat detail for newly planned shots:");
  for (const shot of result.shots.filter((s) => s.status === "planned")) {
    const beats = db
      .prepare(
        `SELECT sequence, beat_type, audio_start_ms, audio_end_ms, needs_lip_sync, requires_new_keyframe
         FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`
      )
      .all(shot.shotId) as any[];
    console.log(`\n  ${shot.verseRef} (${shot.shotId}):`);
    for (const b of beats) {
      const dur = ((b.audio_end_ms - b.audio_start_ms) / 1000).toFixed(1);
      console.log(
        `    ${b.sequence}. ${b.beat_type.padEnd(16)} ${(b.audio_start_ms / 1000).toFixed(1)}s-${(b.audio_end_ms / 1000).toFixed(1)}s (${dur}s)` +
          `${b.needs_lip_sync ? " [lip-sync]" : ""}${b.requires_new_keyframe ? " [new keyframe]" : " [reuse keyframe]"}`
      );
    }
  }
}
