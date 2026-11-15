/**
 * Round 4 for Scribe (younger, lean) only -- the Critic's re-review of
 * round 3 (2026-09-07, WITH the black-color producer override applied)
 * found two remaining issues unrelated to color:
 * 1. Tassels are a continuous fringe row along the whole bottom hem,
 *    not four distinct corner-tied tassels as Numbers 15:38-39 and
 *    actual Judean Desert textile finds specify.
 * 2. A real reference-sheet consistency bug: the bottom-middle panel
 *    shows a solid black headwrap while every other panel shows an
 *    off-white turban -- a locked reference sheet must be internally
 *    consistent.
 *
 * Refines FROM round 3 (black).
 *
 * Run: npx tsx scripts/character-tool/fix-scribe-younger-round4.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

const CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same identity, same " +
  "panel layout and poses, same black garment color, same clavi stripes and corner motifs. Make two fixes:\n" +
  "1. TASSELS: replace the continuous fringe row along the bottom hem with four distinct, separately tied " +
  "tassels -- one at each actual corner of the outer mantle only, each a small knotted bundle of cords, not a " +
  "fringe running along the whole edge.\n" +
  "2. HEADWEAR CONSISTENCY: make the headwear identical and consistent in EVERY panel -- use the off-white " +
  "wrapped turban/headscarf shown in the front, side, and back full-body views and the close-up, in all panels " +
  "including the one currently showing a black headwrap. Do not vary the headwear color or style between panels.\n" +
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
  const round3Buf = await readFile(path.join(CANDIDATES_DIR, "scribe-younger-lean-fix-r3-black.png"));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "This is the current candidate design for \"Scribe (younger, lean)\" -- apply the fixes instructed below." },
    { inlineData: { mimeType: "image/png", data: round3Buf.toString("base64") } },
    { text: CORRECTION }
  ];

  console.log("Generating (round 4): Scribe (younger, lean)...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "scribe-younger-lean-fix-r4.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
