import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const geminiKey = process.env.GEMINI_API_KEY!;
const klingKey = process.env.KLING_API_KEY_1!;
const dataDir = getDataDir();
const keyframePath = join(dataDir, "assets", "generated/edits/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea-0ad985c8.jpg");
const imageBase64 = readFileSync(keyframePath).toString("base64");
const prompt = "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat, eyes open, alert and hopeful.";

async function tryVeoFull(attemptNum: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${geminiKey}`;
  const submitRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt, image: { bytesBase64Encoded: imageBase64, mimeType: "image/jpeg" } }],
      parameters: { aspectRatio: "16:9", durationSeconds: 4, resolution: "720p" }
    })
  });
  const submitData = await submitRes.json() as any;
  if (!submitData.name) { console.log(`Veo full attempt ${attemptNum}: SUBMIT FAILED`, JSON.stringify(submitData).slice(0,300)); return null; }
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${submitData.name}?key=${geminiKey}`;
  let final;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const pollRes = await fetch(pollUrl);
    const pollData = await pollRes.json() as any;
    if (pollData.done) { final = pollData; break; }
  }
  const sample = final?.response?.generateVideoResponse?.generatedSamples?.[0];
  const filtered = final?.response?.generateVideoResponse?.raiMediaFilteredReasons;
  if (!sample) { console.log(`Veo full attempt ${attemptNum}: FILTERED -- ${JSON.stringify(filtered)}`); return null; }
  let videoBuffer: Buffer;
  if (sample.video.bytesBase64Encoded) {
    videoBuffer = Buffer.from(sample.video.bytesBase64Encoded, "base64");
  } else {
    const fileRes = await fetch(sample.video.uri, { headers: { "x-goog-api-key": geminiKey } });
    videoBuffer = Buffer.from(await fileRes.arrayBuffer());
  }
  const outPath = join(process.env.TEMP || "/tmp", `veo-full-attempt${attemptNum}.mp4`);
  writeFileSync(outPath, videoBuffer);
  console.log(`Veo full attempt ${attemptNum}: SUCCESS -- ${outPath}`);
  return outPath;
}

async function tryKlingModel(modelName: string, mode: string | undefined) {
  const HOST = "https://api-singapore.klingai.com";
  const body: any = { model_name: modelName, image: imageBase64, prompt, duration: "5", aspect_ratio: "16:9" };
  if (mode) body.mode = mode;
  const submitRes = await fetch(`${HOST}/v1/videos/image2video`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${klingKey}` },
    body: JSON.stringify(body)
  });
  const submitData = await submitRes.json() as any;
  console.log(`Kling ${modelName}${mode ? '/'+mode : ''} submit:`, submitRes.status, JSON.stringify(submitData).slice(0,300));
  if (submitData.code !== 0 || !submitData.data?.task_id) return null;
  const taskId = submitData.data.task_id;
  let final;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const pollRes = await fetch(`${HOST}/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${klingKey}` } });
    const pollData = await pollRes.json() as any;
    if (pollData.data?.task_status === "succeed" || pollData.data?.task_status === "failed") { final = pollData; break; }
  }
  const videoUrl = final?.data?.task_result?.videos?.[0]?.url;
  if (!videoUrl) { console.log(`Kling ${modelName}${mode ? '/'+mode : ''}: FAILED -- ${JSON.stringify(final?.data).slice(0,300)}`); return null; }
  const vidRes = await fetch(videoUrl);
  const buf = Buffer.from(await vidRes.arrayBuffer());
  const outPath = join(process.env.TEMP || "/tmp", `kling-${modelName}${mode ? '-'+mode : ''}.mp4`);
  writeFileSync(outPath, buf);
  console.log(`Kling ${modelName}${mode ? '/'+mode : ''}: SUCCESS -- ${outPath}`);
  return outPath;
}

// Push Veo harder: 2 more attempts with the FULL model against the edited keyframe.
await tryVeoFull(1);
await tryVeoFull(2);

// Try Kling's other models on the same input.
await tryKlingModel("kling-v1-6", undefined);
await tryKlingModel("kling-v1-6", "pro");
