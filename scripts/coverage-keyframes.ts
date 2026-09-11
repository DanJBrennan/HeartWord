import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { assetPath } from "../src/pipeline/media-generation/external-keyframes.js";
import {
  acceptCoverageBeatKeyframe,
  coverageBeatsNeedingKeyframes,
  importCoverageBeatKeyframe,
  prepareCoverageBeatBrief,
  type CoverageBeatBrief
} from "../src/pipeline/media-generation/external-coverage-keyframes.js";
import { recordCoverageBeatOverride } from "../src/pipeline/qc/director.js";

const [command, ...args] = process.argv.slice(2);
const db = getDb(),
  dataDir = getDataDir();

if (command === "prepare" && args.length === 3) {
  const [beatId, promptFile, rationaleFile] = args as [string, string, string];
  const brief = prepareCoverageBeatBrief(db, dataDir, beatId, readFileSync(promptFile, "utf8"), readFileSync(rationaleFile, "utf8"));
  const dir = join(dataDir, "exports", "coverage-beat-briefs", brief.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2), { flag: "wx" });
  writeFileSync(join(dir, "prompt.txt"), brief.prompt, { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        brief: join(dir, "brief.json"),
        beat: brief.context.beat,
        generationInputs: brief.generationInputs.map((r) => ({ ...r, path: assetPath(dataDir, r.path) })),
        references: brief.context.references.map((r) => ({ name: r.name, path: assetPath(dataDir, r.path) })),
        verses: brief.sources.map((s) => ({ role: s.role, verses: s.verses }))
      },
      null,
      2
    )
  );
} else if (command === "import" && args.length === 3) {
  console.log(
    JSON.stringify(
      importCoverageBeatKeyframe(db, dataDir, JSON.parse(readFileSync(args[0]!, "utf8")) as CoverageBeatBrief, args[1]!, readFileSync(args[2]!, "utf8")),
      null,
      2
    )
  );
} else if (command === "accept" && args.length === 1) {
  console.log(JSON.stringify(acceptCoverageBeatKeyframe(db, args[0]!), null, 2));
} else if (command === "status" && args.length === 1) {
  console.log(JSON.stringify(coverageBeatsNeedingKeyframes(db, args[0]!), null, 2));
} else if (command === "override" && (args.length === 2 || args.length === 3)) {
  const [beatId, noteFile, attemptId] = args as [string, string, string | undefined];
  // Omit <candidate-attempt-id> for a deliberate STANDING decision that
  // applies to every future candidate of this beat (e.g. a real,
  // permanent staging choice). Pass it to scope the exception to that
  // ONE candidate image only (e.g. "this specific regenerated composition
  // happens to have the floor obscured, but that won't generally be
  // true") -- see beat-scope.ts's matchesBeatScope for why a beat's
  // candidates can differ enough that this distinction matters, and
  // director.ts's matchesBeatScope note for why a coverage beat's
  // overrides must never bleed into a sibling BEAT's review either.
  console.log(JSON.stringify(recordCoverageBeatOverride(db, beatId, readFileSync(noteFile, "utf8"), attemptId), null, 2));
} else {
  console.error(
    "Usage: npx tsx scripts/coverage-keyframes.ts prepare <beat-id> <prompt.txt> <rationale.md> | " +
      "import <brief.json> <image.png> <review.md> | accept <beat-id> | " +
      "override <beat-id> <note.md> [candidate-attempt-id] | status <project-id>"
  );
  process.exitCode = 1;
}
