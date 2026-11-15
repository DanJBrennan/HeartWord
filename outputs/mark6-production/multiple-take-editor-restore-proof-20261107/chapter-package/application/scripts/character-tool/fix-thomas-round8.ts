/**
 * Round 8 for Thomas only -- a narrow, single-issue pass from round 6
 * (the best result so far, "moderate"), isolating ONLY the clavi
 * symmetry fix that two earlier broader attempts (round 7 included)
 * failed to land, likely because bundling it with other changes (belt,
 * sandals, neckline) gave the model too much to alter at once and it
 * kept drifting on unrelated details instead. This round changes nothing
 * else.
 *
 * Run: npx tsx scripts/character-tool/fix-thomas-round8.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const CORRECTION =
  "Keep this EXACT same person and EXACT same everything about this image -- same face, same skin tone, same " +
  "build, same hairstyle and beard, same mantle, same tassels, same corner motifs, same belt, same sleeves, same " +
  "neckline, same sandals, same pose, same background. Make ONE single change: the tunic currently has a single " +
  "vertical red stripe (clavus) on the wearer's right side only. Add a second, matching vertical red stripe of " +
  "the same width and color on the wearer's LEFT side, positioned symmetrically -- so there is one stripe " +
  "descending from each shoulder, evenly spaced on either side of the neck opening. Do not change anything else " +
  "in the image.";

async function generateImage(parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini image generateContent failed: ${res.status} ${res.statusText} -- ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this prompt: ${data.promptFeedback.blockReason}`);
  }
  const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) {
    throw new Error(`Gemini returned no image data: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function main() {
  const round6Buf = await readFile(path.join(CANDIDATES_DIR, "thomas-garment-fix-r6.png"));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "Current image of Thomas -- make one small change described below." },
    { inlineData: { mimeType: "image/png", data: round6Buf.toString("base64") } },
    { text: CORRECTION }
  ];

  console.log("Generating (round 8): Thomas...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "thomas-garment-fix-r8.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
