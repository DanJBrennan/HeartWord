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
    { type: "text", text: "Only change the background behind the man to a warm sunset orange gradient. Keep the man himself -- face, hair, garment, pose -- completely unchanged." }
  ],
  response_format: { type: "image", mime_type: "image/jpeg" }
};
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
console.log("status:", res.status);
const text = await res.text();
console.log("Raw (first 2000 chars):", text.slice(0, 2000));
