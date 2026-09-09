import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");

async function test(version: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/${version}/interactions?key=${apiKey}`;
  const body = {
    model,
    input: [
      { type: "image", data: srcImg, mime_type: "image/png" },
      { type: "text", text: "Only change the background to a warm sunset orange gradient. Keep the man unchanged." }
    ],
    response_format: model.includes("image") ? { type: "image", mime_type: "image/jpeg" } : { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`${version} / ${model} -> ${res.status}`, text.slice(0, 300));
}

await test("v1", "gemini-omni-1.1-flash");
await test("v1", "gemini-3.1-flash-image");
await test("v1", "gemini-3-pro-image");
