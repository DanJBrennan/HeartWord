/**
 * Round 5 for Scribe (younger, lean) only -- the Critic's round-4
 * re-review (2026-09-07, with the black-color producer override applied)
 * found one remaining issue: the tunic is knee-length, but Mark 12:38
 * ("Beware of the scribes, who like to walk around in long robes...")
 * explicitly documents scribes favoring ankle-length robes to signal
 * literate/scholarly status -- the opposite of the generic "working man,
 * knee-length for mobility" advice applied elsewhere in this canon.
 *
 * Refines FROM round 4 (tassels and headwear already fixed there).
 *
 * Run: npx tsx scripts/character-tool/fix-scribe-younger-round5.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

const CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same identity, same " +
  "panel layout and poses, same black garment color, same clavi stripes, same corner motifs, same tassels, same " +
  "headwear. Make ONE change: lengthen the tunic's hemline from knee-length to ankle-length, in every panel -- " +
  "scribes/scholars in first-century Judea favored long robes to signal literate, non-manual-labor status " +
  "(Mark 12:38). Do not change anything else about the design.\n" +
  "Photorealistic, same neutral studio background and lighting as the original. No text, no labels, no logos " +
  "anywhere in the image.";

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
  const round4Buf = await readFile(path.join(CANDIDATES_DIR, "scribe-younger-lean-fix-r4.png"));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "This is the current candidate design for \"Scribe (younger, lean)\" -- apply the fix instructed below." },
    { inlineData: { mimeType: "image/png", data: round4Buf.toString("base64") } },
    { text: CORRECTION }
  ];

  console.log("Generating (round 5): Scribe (younger, lean)...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "scribe-younger-lean-fix-r5.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
