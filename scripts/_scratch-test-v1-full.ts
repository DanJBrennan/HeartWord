import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");
const url = `https://generativelanguage.googleapis.com/v1/interactions?key=${apiKey}`;

async function test(label: string, body: any, saveAs?: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json() as any;
  console.log(`\n=== ${label} -> ${res.status} ===`);
  if (data.error) { console.log("ERROR:", JSON.stringify(data.error)); return; }
  const outStep = data.steps?.find((s: any) => s.type === "model_output");
  const content = outStep?.content?.[0];
  console.log("content type:", content?.type, "mime:", content?.mime_type, "bytes(b64):", content?.data?.length);
  if (content?.data && saveAs) {
    writeFileSync(join(process.env.TEMP || "/tmp", saveAs), Buffer.from(content.data, "base64"));
    console.log("saved:", saveAs);
  }
}

// Omni video draft under v1, corrected shape.
await test("v1 omni draft video", {
  model: "gemini-omni-1.1-flash",
  input: [{ type: "user_input", content: [
    { type: "image", data: srcImg, mime_type: "image/png" },
    { type: "text", text: "The man in this photo slowly nods once, calmly. Keep everything else identical." }
  ]}],
  response_format: { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
}, "v1-omni-draft.mp4");

// Nano Banana image edit under v1, corrected shape (re-confirm since first test above already showed 200 -- now capture actual bytes).
await test("v1 image edit", {
  model: "gemini-3.1-flash-image",
  input: [{ type: "user_input", content: [
    { type: "image", data: srcImg, mime_type: "image/png" },
    { type: "text", text: "Only change the background to a warm sunset orange gradient. Keep the man -- face, hair, garment, pose -- completely unchanged." }
  ]}],
  response_format: { type: "image", mime_type: "image/jpeg" }
}, "v1-edit.jpg");
