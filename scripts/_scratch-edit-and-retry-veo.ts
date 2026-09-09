import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiImageEditor } from "../src/providers/gemini/index.js";

const dataDir = getDataDir();
const keyframeRelPath = "generated/keyframes/codex-coverage/0d43887a-8c20-4271-a6d8-3cafad177558/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea.png";

const editor = new GeminiImageEditor();
const editResult = await editor.editRegion(
  { path: keyframeRelPath },
  "Only change the man lying on the mat in the foreground -- prop his head up slightly on a small folded cloth or cushion, and make sure his eyes are clearly open, alert, and looking toward Jesus with a hopeful, attentive expression. He is a paralyzed but fully conscious and alive man waiting to be healed, not unconscious or lifeless. Do not change his position on the mat, his clothing, any other person, the room, or the lighting."
);
console.log("EDIT RESULT:", JSON.stringify(editResult, null, 2));

// Retry Veo with the edited image.
const apiKey = process.env.GEMINI_API_KEY!;
const editedImagePath = join(dataDir, "assets", editResult.media!.path);
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
if (!submitData.name) { console.log("VEO SUBMIT FAILED", JSON.stringify(submitData)); process.exit(0); }
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
console.log("\n=== VEO WITH EDITED IMAGE ===");
console.log(sample ? "SUCCESS -- got a video sample" : `NO SAMPLE. Filtered: ${JSON.stringify(filtered)}`);
