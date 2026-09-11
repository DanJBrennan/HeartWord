import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { acceptKeyframe, assetPath, importKeyframe, keyframeStatus, prepareKeyframe, recordProducerOverride, type KeyframeBrief } from "../src/pipeline/media-generation/external-keyframes.js";
import { recordCanonDecision, runKeyframeCandidateReview } from "../src/pipeline/qc/director.js";

const [command, ...args] = process.argv.slice(2);
const db = getDb(), dataDir = getDataDir();
if (command === "prepare" && args.length === 3) {
  const [shotId, promptFile, rationaleFile] = args as [string, string, string];
  const brief = prepareKeyframe(db, dataDir, shotId, readFileSync(promptFile, "utf8"), readFileSync(rationaleFile, "utf8"));
  const dir = join(dataDir, "exports", "keyframe-briefs", brief.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2), { flag: "wx" });
  writeFileSync(join(dir, "prompt.txt"), brief.prompt, { flag: "wx" });
  console.log(JSON.stringify({ brief: join(dir, "brief.json"), generationInputs: brief.generationInputs.map(r =>
    ({ ...r, path: assetPath(dataDir, r.path) })), references: brief.context.references.map(r =>
    ({ name: r.name, path: assetPath(dataDir, r.path) })), verses: brief.sources.map(s =>
    ({ role: s.role, verses: s.verses })) }, null, 2));
} else if (command === "import" && args.length === 3) {
  console.log(JSON.stringify(importKeyframe(db, dataDir, JSON.parse(readFileSync(args[0]!, "utf8")) as KeyframeBrief,
    args[1]!, readFileSync(args[2]!, "utf8")), null, 2));
} else if (command === "status" && args.length === 1) {
  console.log(JSON.stringify(keyframeStatus(db, args[0]!), null, 2));
} else if (command === "accept" && args.length === 1) {
  console.log(JSON.stringify(acceptKeyframe(db, args[0]!), null, 2));
} else if (command === "override" && args.length === 2) {
  console.log(JSON.stringify(recordProducerOverride(db, args[0]!, readFileSync(args[1]!, "utf8")), null, 2));
} else if (command === "critique" && args.length === 1) {
  console.log(JSON.stringify(await runKeyframeCandidateReview(args[0]!), null, 2));
} else if (command === "canon-decision" && args.length === 2) {
  const [projectId, noteFile] = args as [string, string];
  recordCanonDecision(db, projectId, readFileSync(noteFile, "utf8"));
  console.log(`Canon decision recorded for project ${projectId} -- every future Critic call for this project will load it automatically.`);
} else {
  console.error("Usage: npx tsx scripts/keyframes.ts prepare <shot-id> <prompt.txt> <rationale.md> | import <brief.json> <image.png> <review.md> | critique <attempt-id> | accept <attempt-id> | override <attempt-id> <note.md> | canon-decision <project-id> <note.md> | status <project-id>");
  process.exitCode = 1;
}
