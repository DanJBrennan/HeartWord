/** Imports the thirteen approved-scope Codex ImageGen outputs as held Mark 4
 * review candidates. It never accepts a keyframe or creates video. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { importKeyframe, type KeyframeBrief } from "../src/pipeline/media-generation/external-keyframes.js";
import { importCoverageBeatKeyframe, type CoverageBeatBrief } from "../src/pipeline/media-generation/external-coverage-keyframes.js";

const dataDir = getDataDir();
const db = getDb();
const briefDir = join(dataDir, "assets", "generated", "keyframe-briefs", "mark4-jesus-coverage");
const imageDir = "C:\\Users\\danbr\\.codex\\generated_images\\01a0dfe2-0eda-78a3-a8ed-9c78be041c30";
const sourceFiles: Record<string, string> = {
  "v09-speaking": "exec-d4571aaa-ad9e-426f-82fe-c150b0e0347b.png",
  "v11-beat1-master": "exec-943e2ce8-f7b7-4ad8-b60c-0ebb4fcdd85c.png",
  "v11-beat2-insert": "exec-c87b4863-b693-4345-97f1-42a92668a9cb.png",
  "v11-beat3-reaction": "exec-f0a183ba-a28d-48c4-a063-32facc81a566.png",
  "v11-beat4-landing": "exec-bc28ce9a-8309-4200-b6f3-cfbfee2ac679.png",
  "v13-speaking": "exec-74a23a9d-30d5-47a1-818e-494bfb79a0b2.png",
  "v21-first-beat1-master": "exec-03aee016-20c1-4a3b-b5b8-9fc588118e69.png",
  "v21-first-beat2-insert": "exec-aa363ad4-d401-4cf9-b853-2d829e3bff25.png",
  "v21-second-speaking": "exec-a0b39e5b-df07-4a12-936e-48c31bfb6ff2.png",
  "v21-third-speaking": "exec-50d5ba4e-da70-4800-b887-20250d185e36.png",
  "v26-speaking": "exec-9483497e-e608-478e-aea1-3f29df5bd9c6.png",
  "v30-first-speaking": "exec-526e5c86-6178-4a71-998a-c99200a6ad6b.png",
  "v30-second-speaking": "exec-33871970-833d-4eee-8ae1-f521d8227317.png"
};

const briefs = new Map<string, { kind: "shot" | "beat"; brief: KeyframeBrief | CoverageBeatBrief }>();
for (const file of readdirSync(briefDir)) {
  if (!file.endsWith(".json")) continue;
  const value = JSON.parse(readFileSync(join(briefDir, file), "utf8")) as { key: string; kind: "shot" | "beat"; brief: KeyframeBrief | CoverageBeatBrief };
  briefs.set(value.key, value);
}

const imported: Array<{ key: string; kind: string; path: string }> = [];
for (const [key, sourceFile] of Object.entries(sourceFiles)) {
  const saved = briefs.get(key);
  if (!saved) throw new Error(`Missing prepared brief for ${key}.`);
  const review = `Visual review: 16:9 landscape candidate, readable exposure, approved Papuan Jesus face/hair/beard and cream-with-indigo canon wardrobe are visible where Jesus appears. The composition matches the producer-approved ${key.replaceAll("-", " ")} coverage role. Held for Dan's producer review; no video generated.`;
  const importedResult = saved.kind === "shot"
    ? importKeyframe(db, dataDir, saved.brief as KeyframeBrief, join(imageDir, sourceFile), review)
    : importCoverageBeatKeyframe(db, dataDir, saved.brief as CoverageBeatBrief, join(imageDir, sourceFile), review);
  imported.push({ key, kind: saved.kind, path: importedResult.imagePath });
}
console.log(JSON.stringify({ imported, status: "hold_for_review", videoGenerated: false }, null, 2));
