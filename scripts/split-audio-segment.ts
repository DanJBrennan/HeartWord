/**
 * Splits one shared original_reading audio_segments row into phrase-level
 * per-verse sub-segments -- see src/pipeline/ingestion/split-segment.ts.
 * Dry-run by default (prints the proposal only); pass --apply to commit
 * it to the database. Applying does NOT call any paid provider -- it's a
 * database change plus local ffmpeg analysis. Re-running voicing
 * afterward (a separate, deliberate step) is what actually spends
 * ElevenLabs credits, and only for the newly split verses.
 *
 * Run:
 *   npx tsx scripts/split-audio-segment.ts <project-id> <segment-id> <verseRef1> <verseRef2> ...
 *   npx tsx scripts/split-audio-segment.ts <project-id> <segment-id> <verseRef1> <verseRef2> ... --apply
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { applySplit, proposeSplit } from "../src/pipeline/ingestion/split-segment.js";
import { extractClip } from "../src/pipeline/voicing/extract-clip.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((a) => a !== "--apply");
const [projectId, segmentId, ...verseRefs] = positional;

if (!projectId || !segmentId || verseRefs.length < 2) {
  throw new Error(
    "Usage: split-audio-segment.ts <project-id> <segment-id> <verseRef1> <verseRef2> [...] [--apply]"
  );
}

const db = getDb();
const dataDirAssetsPath = join(getDataDir(), "assets");

const proposal = proposeSplit(db, dataDirAssetsPath, segmentId, verseRefs);

console.log(
  `Splitting ${proposal.originalVerseRef} (${((proposal.originalEndMs - proposal.originalStartMs) / 1000).toFixed(1)}s, ` +
    `segment ${proposal.segmentId}) into ${proposal.subSegments.length} sub-segments:\n`
);
for (const sub of proposal.subSegments) {
  console.log(
    `  ${sub.verseRef.padEnd(14)} ${(sub.startMs / 1000).toFixed(2)}s - ${(sub.endMs / 1000).toFixed(2)}s ` +
      `(${(sub.durationMs / 1000).toFixed(1)}s)  confidence=${sub.confidence ?? "n/a"}`
  );
}

const lowConfidence = proposal.subSegments.filter((s) => s.confidence !== null && s.confidence < 60);
if (lowConfidence.length > 0) {
  console.log(
    `\nNote: ${lowConfidence.length} boundary(ies) are low-confidence heuristic guesses (pause-length-based, no ` +
      `ASR/forced-alignment, no ability to read Hatam) -- listen to the actual cut points before trusting them.`
  );
}

if (!apply) {
  const previewDir = join(getDataDir(), "exports", "audio-split-preview", proposal.segmentId);
  mkdirSync(previewDir, { recursive: true });
  const absSourcePath = join(dataDirAssetsPath, proposal.sourcePath);
  proposal.subSegments.forEach((sub, i) => {
    const safeVerse = sub.verseRef.replace(/[^a-z0-9]+/gi, "-");
    const outPath = join(previewDir, `${String(i + 1).padStart(2, "0")}-${safeVerse}.mp3`);
    extractClip(absSourcePath, sub.startMs, sub.endMs, outPath);
  });
  console.log(
    `\nPreview clips written to ${previewDir} -- listen to each before trusting these cut points, especially any ` +
      `unexpectedly short segment. Dry run only -- no database changes made. Re-run with --apply once the ` +
      `boundaries are confirmed (adjust verseRefs/order here first if a cut point needs to move).`
  );
} else {
  applySplit(db, projectId, proposal);
  console.log(
    `\nApplied: audio_segments row ${proposal.segmentId} replaced with ${proposal.subSegments.length} rows. ` +
      `No provider was called -- this is a database + local ffmpeg change only.\n` +
      `Next: re-run voicing for this project to generate composite_cast_master audio for the new verse segments ` +
      `(this DOES call ElevenLabs -- it will reuse every other segment's existing cached file and only generate ` +
      `the ${proposal.subSegments.length} new ones), then re-run plan-coverage-manifests.ts for Scene 3's shots.`
  );
}
