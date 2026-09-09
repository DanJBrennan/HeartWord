import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
const dataDir = getDataDir();
const startImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");
const endImg = readFileSync(join(dataDir, "assets", "characters", "peter", "lip_sync_closeup", "close-up-neutral-v3.png")).toString("base64");

const body = {
  model: "gemini-omni-1.1-flash",
  input: [
    { type: "image", data: startImg, mime_type: "image/png" },
    { type: "image", data: endImg, mime_type: "image/png" },
    { type: "text", text: "A camera pan/dissolve from the first man to the second man, as if turning to look at someone else standing nearby." }
  ],
  response_format: { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
};
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
console.log("status:", res.status);
const data = await res.json() as any;
if (data.error) { console.log("ERROR:", JSON.stringify(data.error)); process.exit(0); }
const videoStep = data.steps.find((s: any) => s.type === "model_output");
const videoContent = videoStep?.content.find((c: any) => c.type === "video");
if (!videoContent) { console.log("No video content. Steps:", JSON.stringify(data.steps).slice(0,1000)); process.exit(0); }
const outPath = join(process.env.TEMP || "/tmp", "omni-guided-test.mp4");
writeFileSync(outPath, Buffer.from(videoContent.data, "base64"));
console.log("Saved to:", outPath, "bytes:", videoContent.data.length);
