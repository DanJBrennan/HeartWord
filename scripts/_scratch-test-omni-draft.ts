import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

// Reuse an already-generated, small headshot as the reference image -- cheapest
// possible real input for a one-shot confirmation call.
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

console.log("Calling interactions.create...");
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
console.log("status:", res.status);
const text = await res.text();
// Don't dump full base64 video data to the terminal -- print structure only.
try {
  const data = JSON.parse(text);
  if (data.steps) {
    for (const step of data.steps) {
      console.log(`step type=${step.type}`);
      if (step.content) {
        for (const c of step.content) {
          const preview = { ...c };
          if (preview.data) preview.data = `<${preview.data.length} base64 chars>`;
          console.log("  content:", JSON.stringify(preview));
        }
      }
    }
  }
  console.log("id:", data.id, "status:", data.status, "model:", data.model, "object:", data.object);
  if (data.usage) console.log("usage:", JSON.stringify(data.usage));
  if (data.error) console.log("ERROR:", JSON.stringify(data.error));
} catch {
  console.log("Raw (first 2000 chars):", text.slice(0, 2000));
}
