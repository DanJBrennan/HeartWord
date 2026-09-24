/** Raise the new generated courtyard ambience to an audible review level. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { registerStandaloneLibraryAsset } from "../src/pipeline/media-generation/media-library.js";

const dataDir = getDataDir();
const source = "generated/media-library/capernaum-synagogue-arrival-and-town-life-omni-draft-r5-ambient.mp4";
const output = "generated/media-library/capernaum-synagogue-arrival-and-town-life-omni-draft-r5-ambient-audible.mp4";
const path = (relative: string) => join(dataDir, "assets", relative);
if (!existsSync(path(source))) throw new Error(`Missing generated take: ${path(source)}`);
if (existsSync(path(output))) throw new Error(`Refusing to overwrite retained take: ${path(output)}`);

// The provider's ambience is continuous but around -48 dB mean. Its highest
// measured peak is below -24 dB, leaving room for this fixed, transparent gain.
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-i", path(source),
  "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", "volume=20dB",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-movflags", "+faststart", path(output)],
  { stdio: ["ignore", "inherit", "inherit"], timeout: 120_000 });

const library = registerStandaloneLibraryAsset(getDb(), dataDir, {
  assetPath: output,
  title: "Capernaum synagogue: Jesus enters, audible courtyard ambience",
  location: "Capernaum synagogue exterior, first-century production reconstruction",
  tags: ["capernaum", "synagogue", "exterior", "town-life", "jesus-entering", "hatam", "papuan", "natural-ambience-draft"],
  language: "Hatam",
  canonRegion: "Papuan",
  provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", tier: "draft", sourceAsset: source,
    postprocess: "video stream copied unchanged; generated ambience raised 20 dB and encoded 48 kHz stereo AAC",
    reviewStatus: "hold_for_review" },
});
console.log(JSON.stringify({ output: path(output), library }, null, 2));
