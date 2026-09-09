import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");

for (const model of ["gemini-3.1-flash-image", "gemini-3-pro-image"]) {
  console.log(`\n=== model: ${model} ===`);
  const body = {
    model,
    input: [
      { type: "image", data: srcImg, mime_type: "image/png" },
      { type: "text", text: "Only change the background behind the man to a warm sunset orange gradient. Keep the man himself -- face, hair, garment, pose -- completely unchanged." }
    ],
    response_format: { type: "image", mime_type: "image/jpeg" }
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log("status:", res.status);
  const data = await res.json() as any;
  if (data.error) { console.log("ERROR:", JSON.stringify(data.error)); continue; }
  const outStep = data.steps?.find((s: any) => s.type === "model_output");
  const imgContent = outStep?.content.find((c: any) => c.type === "image");
  if (imgContent) {
    const outPath = join(process.env.TEMP || "/tmp", `omni-edit-${model}.jpg`);
    writeFileSync(outPath, Buffer.from(imgContent.data, "base64"));
    console.log("Got IMAGE. Saved to:", outPath);
  } else {
    console.log("No image content:", JSON.stringify(outStep?.content).slice(0, 300));
  }
}
