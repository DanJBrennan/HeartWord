import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");

const body = {
  model: "gemini-omni-1.1-flash",
  input: [
    { type: "image", data: srcImg, mime_type: "image/png" },
    { type: "text", text: "Only change the background behind the man to a warm sunset orange gradient. Keep the man himself -- face, hair, garment, pose -- completely unchanged. Output a single still image, not a video." }
  ],
  response_format: { type: "image", mime_type: "image/jpeg" }
};
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const data = await res.json() as any;
for (const step of data.steps) {
  console.log(`step type=${step.type}`);
  if (step.content) {
    for (const c of step.content) {
      const preview = { ...c };
      if (preview.data) preview.data = `<${preview.data.length} base64 chars>`;
      if (preview.text) preview.text = preview.text.slice(0, 200);
      console.log("  content:", JSON.stringify(preview));
    }
  }
}
const outStep = data.steps.find((s: any) => s.type === "model_output");
const imgContent = outStep?.content.find((c: any) => c.type === "image");
if (imgContent) {
  const outPath = join(process.env.TEMP || "/tmp", "omni-edit-test2.jpg");
  writeFileSync(outPath, Buffer.from(imgContent.data, "base64"));
  console.log("Saved image to:", outPath);
} else {
  const vidContent = outStep?.content.find((c: any) => c.type === "video");
  if (vidContent) {
    const outPath = join(process.env.TEMP || "/tmp", "omni-edit-test2.mp4");
    writeFileSync(outPath, Buffer.from(vidContent.data, "base64"));
    console.log("Got VIDEO instead of image. Saved to:", outPath);
  }
}
