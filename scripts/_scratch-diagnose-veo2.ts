import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();

async function tryVeo(label: string, imagePath: string, prompt: string) {
  const startImageBase64 = readFileSync(imagePath).toString("base64");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning?key=${apiKey}`;
  const submitRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt, image: { bytesBase64Encoded: startImageBase64, mimeType: "image/png" } }],
      parameters: { aspectRatio: "16:9", durationSeconds: 4, resolution: "720p" }
    })
  });
  const submitData = await submitRes.json() as any;
  if (!submitData.name) { console.log(`${label}: SUBMIT FAILED`, JSON.stringify(submitData)); return; }
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${submitData.name}?key=${apiKey}`;
  let final;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const pollRes = await fetch(pollUrl);
    const pollData = await pollRes.json() as any;
    if (pollData.done) { final = pollData; break; }
  }
  const sample = final?.response?.generateVideoResponse?.generatedSamples?.[0];
  const filtered = final?.response?.generateVideoResponse?.raiMediaFilteredReasons;
  console.log(`\n=== ${label} ===`);
  console.log(sample ? "SUCCESS -- got a video sample" : `NO SAMPLE. Filtered reasons: ${JSON.stringify(filtered)}`);
}

// Test A: known-good Andrew headshot (worked fine with Omni earlier) + a totally generic prompt.
await tryVeo(
  "Andrew headshot + generic prompt",
  join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png"),
  "The man in this photo slowly nods once, calmly. Ambient room tone only, no dialogue."
);

// Test B: the actual Shot 7 master keyframe + a minimal, stripped-down prompt (no "packed", no "scribes").
await tryVeo(
  "Shot 7 master keyframe + minimal prompt",
  join(dataDir, "assets", "generated/keyframes/codex-coverage/0d43887a-8c20-4271-a6d8-3cafad177558/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea.png"),
  "Static shot, subtle natural movement, ambient room tone only, no dialogue."
);
