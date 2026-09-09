import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");
const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemini-omni-1.1-flash",
    input: [{ type: "user_input", content: [
      { type: "image", data: srcImg, mime_type: "image/png" },
      { type: "text", text: "The man in this photo slowly nods once, calmly." }
    ]}],
    response_format: { type: "video", resolution: "360p", aspect_ratio: "16:9", delivery: "inline" }
  })
});
console.log("status:", res.status);
const data = await res.json() as any;
if (data.error) { console.log("ERROR:", JSON.stringify(data.error)); } else {
  const outStep = data.steps?.find((s: any) => s.type === "model_output");
  console.log("content type:", outStep?.content?.[0]?.type, "mime:", outStep?.content?.[0]?.mime_type);
}
