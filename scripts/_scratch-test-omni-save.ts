import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
const imgPath = join(getDataDir(), "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png");
const imgB64 = readFileSync(imgPath).toString("base64");

const body = {
  model: "gemini-omni-1.1-flash",
  input: [
    { type: "image", data: imgB64, mime_type: "image/png" },
    { type: "text", text: "The man in this photo slowly nods once, calmly. Keep everything else in the frame identical." }
  ],
  response_format: { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
};
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const data = await res.json() as any;
const videoStep = data.steps.find((s: any) => s.type === "model_output");
const videoContent = videoStep.content.find((c: any) => c.type === "video");
const outPath = join(process.env.TEMP || "/tmp", "omni-test.mp4");
writeFileSync(outPath, Buffer.from(videoContent.data, "base64"));
console.log("Saved to:", outPath);
