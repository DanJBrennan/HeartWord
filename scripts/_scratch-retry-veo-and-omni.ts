import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiDraftVideoProvider } from "../src/providers/gemini/index.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const keyframeRelPath = "generated/keyframes/codex-coverage/0d43887a-8c20-4271-a6d8-3cafad177558/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea.png";
const keyframePath = join(dataDir, "assets", keyframeRelPath);
const prompt = "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat.";

// 1. Retry Veo once more, same image + prompt.
async function retryVeo() {
  const startImageBase64 = readFileSync(keyframePath).toString("base64");
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
  if (!submitData.name) { console.log("VEO RETRY: SUBMIT FAILED", JSON.stringify(submitData)); return; }
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
  console.log("\n=== VEO RETRY ===");
  console.log(sample ? "SUCCESS -- got a video sample" : `NO SAMPLE. Filtered: ${JSON.stringify(filtered)}`);
}

// 3. Try Omni draft tier with the same image + prompt.
async function tryOmni() {
  console.log("\n=== OMNI DRAFT ===");
  const provider = new GeminiDraftVideoProvider();
  try {
    const result = await provider.generateDraft({
      shotId: "_scratch-pilot-omni-fallback",
      prompt,
      characters: []
    });
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.log("FAILED:", (err as Error).message.slice(0, 1000));
  }
}

await retryVeo();
await tryOmni();
