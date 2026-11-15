/** One-off Nano Banana Pro location-reference candidate; no timeline selection. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const shotId = "capernaum-synagogue-exterior-jesus-era-nano-banana-pro-r2";
const prompt = `Use case: historical-scene
Asset type: HeartWord Mark 3 exterior location-reference candidate, not a selected timeline shot
Primary request: An outdoor view of the synagogue in Capernaum during Jesus's lifetime, approximately the early first century CE.
Scene/backdrop: A lived-in Jewish fishing village on the northwest shore of the Sea of Galilee. The synagogue is a modest but clearly communal building among low local homes and narrow dusty lanes, not isolated as a grand monument.
Subject: Plausible early Roman-period synagogue exterior built predominantly of dark local basalt stone. This is the OUTSIDE of the large approved interior shown in the set-reference image: the building must be broad and high enough to contain that spacious roof-beamed gathering room, long side seating walls, and high daylight openings. Give it a substantial but unornamented public-building mass, high narrow openings below a timber-and-earth roof, and a broad entrance. If the entrance is visible, use heavy wooden plank leaves turning on wooden pivot pegs seated in dark-basalt threshold sockets; no modern hinges, handles, or trim.
Style/medium: Photorealistic cinematic production still, materially grounded, realistic stone and timber texture, first-century Galilean setting.
Composition/framing: Wide 16:9 establishing view from the lane at human eye level; the synagogue facade and its relationship to neighboring basalt buildings are readable. No people or action are required.
Lighting/mood: Clear warm natural daylight with generous ambient fill; legible architecture, no dramatic darkness.
Constraints: The reference image is the approved INTERIOR SET, not a request to copy its people or camera framing. Use its room scale, roof height, basalt masonry, daylight openings, and doorway construction to make an exterior that could physically contain it. This is a historically plausible reconstruction, not a claim that the first-century facade is archaeologically known in detail. Avoid a small low shed. No later ornate white-limestone Capernaum synagogue, classical colonnade, carved capitals, Byzantine or modern religious symbols, crosses, modern hardware, signage, text, or watermark. No invented narrative event.`;

const result = await new GeminiImageProvider().generate({ shotId, prompt, characters: [], sceneReferences: [
  { path: "generated/keyframes/codex/91097824-29df-435c-ae00-ad839bdbc511/cd88e8a0-1f6e-4ad4-855f-dde1fd08d3b8.png" }
] }, { tier: "pro" });
if (result.provenance.model !== "gemini-3-pro-image" || !result.media?.path) throw new Error("Nano Banana Pro did not return a saved image.");
const imagePath = join(getDataDir(), "assets", result.media.path);
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", imagePath], { encoding: "utf8" })) as { streams: Array<{ width: number; height: number }> };
const { width, height } = probe.streams[0]!;
const cropWidth = Math.min(width, Math.floor(height * 16 / 9));
const cropHeight = Math.min(height, Math.floor(width * 9 / 16));
const cropX = Math.floor((width - cropWidth) / 2), cropY = Math.floor((height - cropHeight) / 2);
const finalPath = imagePath.replace(/\.png$/, "-16x9.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", imagePath, "-vf", `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`, "-frames:v", "1", finalPath]);
writeFileSync(finalPath.replace(/\.png$/, ".json"), JSON.stringify({
  status: "candidate_for_review", use: "Capernaum synagogue exterior location reference", timelineSelected: false,
  createdAt: new Date().toISOString(), providerRawPath: result.media.path, finalPath,
  sourceDimensions: { width, height }, finalDimensions: { width: cropWidth, height: cropHeight },
  provider: result.provenance.provider, model: result.provenance.model, estimatedCostUsd: result.cost.usd,
  prompt,
  historicalReferences: [
    "https://www.custodia.org/en/sanctuaries/capernaum/",
    "https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/entrance/"
  ]
}, null, 2));
console.log(JSON.stringify({ imagePath: finalPath, model: result.provenance.model, estimatedCostUsd: result.cost.usd }));
