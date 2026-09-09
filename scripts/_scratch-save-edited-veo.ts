import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const editedImagePath = join(dataDir, "assets", "generated/edits/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea-0ad985c8.jpg");
const startImageBase64 = readFileSync(editedImagePath).toString("base64");
const prompt = "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat, eyes open, alert and hopeful.";

const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning?key=${apiKey}`;
const submitRes = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instances: [{ prompt, image: { bytesBase64Encoded: startImageBase64, mimeType: "image/jpeg" } }],
    parameters: { aspectRatio: "16:9", durationSeconds: 4, resolution: "720p" }
  })
});
const submitData = await submitRes.json() as any;
const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${submitData.name}?key=${apiKey}`;
let final;
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 15000));
  const pollRes = await fetch(pollUrl);
  const pollData = await pollRes.json() as any;
  if (pollData.done) { final = pollData; break; }
}
const sample = final?.response?.generateVideoResponse?.generatedSamples?.[0];
if (!sample?.video) { console.log("NO SAMPLE:", JSON.stringify(final).slice(0,500)); process.exit(0); }
let videoBuffer: Buffer;
if (sample.video.bytesBase64Encoded) {
  videoBuffer = Buffer.from(sample.video.bytesBase64Encoded, "base64");
} else {
  const fileRes = await fetch(sample.video.uri, { headers: { "x-goog-api-key": apiKey } });
  videoBuffer = Buffer.from(await fileRes.arrayBuffer());
}
const outPath = join(process.env.TEMP || "/tmp", "veo-edited-paralytic.mp4");
writeFileSync(outPath, videoBuffer);
console.log("Saved:", outPath, videoBuffer.length, "bytes");
