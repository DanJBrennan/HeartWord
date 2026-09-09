import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const apiKey = process.env.GEMINI_API_KEY!;
const dataDir = getDataDir();
const srcImg = readFileSync(join(dataDir, "assets", "characters", "andrew", "lip_sync_closeup", "close-up-neutral-v2.png")).toString("base64");
const url = `https://generativelanguage.googleapis.com/v1/interactions?key=${apiKey}`;

async function test(label: string, body: any) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`\n=== ${label} -> ${res.status} ===`);
  console.log(text.slice(0, 500));
}

// Hypothesis: v1 wraps content in a "user_input" step type.
await test("user_input wrapper", {
  model: "gemini-3.1-flash-image",
  input: [{ type: "user_input", content: [
    { type: "image", data: srcImg, mime_type: "image/png" },
    { type: "text", text: "Only change the background to a warm sunset orange gradient. Keep the man unchanged." }
  ]}],
  response_format: { type: "image", mime_type: "image/jpeg" }
});

// Hypothesis: plain string input still works under v1 (matches migrate-to-interactions' basic example).
await test("plain string input", {
  model: "gemini-3.1-flash-image",
  input: "Say hello in one short sentence.",
});
