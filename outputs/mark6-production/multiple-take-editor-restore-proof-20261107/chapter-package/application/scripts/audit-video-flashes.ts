/** Inspect a completed chapter render for rapid post-render scene-cut flashes. */
import { resolve } from "node:path";
import { auditRenderedFlashes } from "../src/pipeline/qc/flash-detection.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: npx tsx scripts/audit-video-flashes.ts <chapter-render.mp4>");
const flashes = auditRenderedFlashes(resolve(input));
console.log(JSON.stringify({
  input, frameRate: 24, maximumFlashFrames: 5, sceneCutThreshold: 0.08,
  findings: flashes.map(finding => ({ ...finding, endFrame: finding.endFrameExclusive - 1 }))
}, null, 2));
