/** Nano Banana Pro targeted edit: correct only the synagogue's main door construction. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiImageEditor } from "../src/providers/gemini/index.js";

const source = "generated/keyframes/capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r2-16x9.png";
const instruction = `Use case: precise-object-edit. Correct ONLY the prominent double-leaf entrance doors of the synagogue near the center-right of the image. Make the two leaves plain, heavy, weathered vertical wooden planks, with no diagonal barn-door braces, strap hinges, metal butt hinges, handles, latches, studs, or decorative hardware. Their historically appropriate construction is a simple pivot system: each leaf's own OUTER vertical edge terminates in short wooden pivot tenons at its top and bottom, seated discreetly in sockets in the underside of the lintel and the DARK-BASALT THRESHOLD directly at the jamb. Keep the pivot axes flush against the existing stone jambs; the pivots should be mostly concealed by the door leaves. IMPORTANT: do not add freestanding wooden posts, ground stakes, visible exterior columns, long poles, or a pivot socket out in the walkway. Keep the doorway width, lintel, sill and both partly open door leaves in their original positions. Do not modify the building or surrounding image: preserve the basalt walls, roof, high windows, shoreline, boats, neighboring houses, ground, warm light, camera perspective, and 16:9 composition. No people or new action.`;

const result = await new GeminiImageEditor().editRegion({ path: source }, instruction);
if (result.provenance.model !== "gemini-3-pro-image" || !result.media?.path) throw new Error("Nano Banana Pro door edit did not return an image.");
const root = join(getDataDir(), "assets");
const raw = join(root, result.media.path);
const final = join(root, "generated/keyframes/capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r4-pivot-doors-16x9.png");
if (existsSync(final)) throw new Error(`Refusing to overwrite ${final}`);
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", raw], { encoding: "utf8" })) as { streams: Array<{ width: number; height: number }> };
const { width, height } = probe.streams[0]!;
const cropWidth = Math.min(width, Math.floor(height * 16 / 9));
const cropHeight = Math.min(height, Math.floor(width * 9 / 16));
const x = Math.floor((width - cropWidth) / 2), y = Math.floor((height - cropHeight) / 2);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vf", `crop=${cropWidth}:${cropHeight}:${x}:${y}:exact=1,scale=1365:768`, "-frames:v", "1", final]);
writeFileSync(final.replace(/\.png$/, ".json"), JSON.stringify({
  status: "candidate_for_review", timelineSelected: false, source, providerRawPath: result.media.path,
  model: result.provenance.model, provider: result.provenance.provider, estimatedCostUsd: result.cost.usd,
  createdAt: new Date().toISOString(), finalDimensions: { width: 1365, height: 768 }, instruction
}, null, 2));
console.log(JSON.stringify({ final, providerRawPath: result.media.path, model: result.provenance.model }));
