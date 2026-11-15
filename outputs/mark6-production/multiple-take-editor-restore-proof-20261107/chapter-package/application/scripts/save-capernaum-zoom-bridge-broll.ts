/** Save Dan-approved aerial-to-synagogue bridge as reusable Hatam b-roll. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { registerStandaloneLibraryAsset } from "../src/pipeline/media-generation/media-library.js";

const dataDir = getDataDir();
const source = "generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-v2-endpoint-locked.mp4";
const output = "generated/media-library/capernaum-aerial-to-synagogue-zoom-broll-v1.mp4";
const path = (relative: string) => join(dataDir, "assets", relative);
const hash = (relative: string) => createHash("sha256").update(readFileSync(path(relative))).digest("hex");
if (!existsSync(path(source))) throw new Error(`Missing approved bridge: ${path(source)}`);
if (existsSync(path(output))) {
  if (hash(source) !== hash(output)) throw new Error(`Retained b-roll differs from approved bridge: ${path(output)}`);
} else {
  copyFileSync(path(source), path(output));
}
const candidate = JSON.parse(readFileSync(path(source.replace(/\.mp4$/, ".json")), "utf8")) as {
  generatedCandidate?: { asset?: string; sha256?: string };
  firstFrame?: { asset?: string; sha256?: string };
  lastFrame?: { asset?: string; sha256?: string };
};
const library = registerStandaloneLibraryAsset(getDb(), dataDir, {
  assetPath: output,
  title: "Capernaum aerial descent to synagogue",
  location: "Capernaum lakeshore and synagogue exterior, first-century production reconstruction",
  tags: ["capernaum", "synagogue", "exterior", "aerial", "zoom", "establishing", "transition", "b-roll", "hatam", "papuan", "ambient"],
  language: "Hatam",
  canonRegion: "Papuan",
  provenance: {
    approval: { by: "Dan", date: "2026-09-24", scope: "Mark 3 intro shot two and reusable b-roll" },
    sourceAsset: source,
    sourceHash: hash(source),
    generatedCandidate: candidate.generatedCandidate,
    firstFrame: candidate.firstFrame,
    lastFrame: candidate.lastFrame,
    provider: "gemini",
    model: "veo-3.1-lite-generate-preview",
    postprocess: "first and last displayed frames pinned to adjoining source stills; native nonverbal ambience retained",
  },
});
console.log(JSON.stringify({ output: path(output), library }, null, 2));
