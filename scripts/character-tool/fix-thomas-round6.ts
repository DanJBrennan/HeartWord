/**
 * Round 6 for Thomas only. Round 5 fixed the sleeves/belt/mantle
 * construction, but the Critic's re-review (2026-09-07) found new issues:
 * the corner tassels disappeared entirely (only generic frayed warp edge
 * remains), the mantle's continuous parallel blue stripes read as a
 * modern synagogue tallit rather than period dress, the tunic has no
 * clavi at all, the neckline has modern zig-zag machine stitching, the
 * belt is a modern twisted rope, and the sandals look like modern
 * contoured comfort sandals.
 *
 * Refines FROM round 5.
 *
 * Run: npx tsx scripts/character-tool/fix-thomas-round6.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const CORRECTION =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. Keep the " +
  "short sleeves, narrow cord belt style, and the unstitched draped mantle construction. Make these specific " +
  "fixes:\n" +
  "1. ADD DISTINCT CORNER TASSELS: at each of the four corners of the outer mantle, add a clearly tied, knotted " +
  "tassel -- several distinct wool cords gathered and tied in a knot, hanging separately from the plain frayed " +
  "edge elsewhere on the fabric. The tassel must be visually distinct from generic loom-fringe.\n" +
  "2. REMOVE THE CONTINUOUS MANTLE STRIPES: the mantle currently has long parallel blue stripes running its full " +
  "length like a modern prayer shawl -- remove these entirely. The mantle should be plain fabric with only a " +
  "small corner motif (a small L-shaped or notched-bar mark) near each corner, next to the tassels.\n" +
  "3. ADD CLAVI TO THE TUNIC: give the tunic (not the mantle) two vertical stripes, one descending from the left " +
  "shoulder and one from the right shoulder, in a natural dye color (madder red, indigo, or brown).\n" +
  "4. PLAIN NECKLINE: change the tunic's neck opening to a plain straight slit with no visible machine stitching " +
  "or zig-zag decorative edging.\n" +
  "5. BELT: replace the twisted rope cord with a plain woven cloth strip or simple leather cord.\n" +
  "6. SANDALS: replace the modern contoured comfort-sandal look with flat, thin leather soles and simple leather " +
  "thong straps, no thick rubber-like footbed.\n" +
  "Photorealistic, full body, standing, facing camera, neutral warm-beige studio background, soft even studio " +
  "lighting, no harsh shadows. No text, no labels, no logos anywhere in the image.";

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
  const db = getDb();

  const round5Buf = await readFile(path.join(CANDIDATES_DIR, "thomas-garment-fix-r5.png"));

  const cv = db
    .prepare(
      `SELECT cv.id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.name = 'Thomas'`
    )
    .get() as { id: string } | undefined;
  const headshotRow = cv
    ? (db
        .prepare(`SELECT path FROM character_assets WHERE character_version_id = ? AND category = 'headshot' LIMIT 1`)
        .get(cv.id) as { path: string } | undefined)
    : undefined;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "This image shows Thomas's current garment-corrected candidate design -- refine it further as instructed below." },
    { inlineData: { mimeType: "image/png", data: round5Buf.toString("base64") } }
  ];
  if (headshotRow) {
    const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
    parts.push({ text: "Reference headshot for Thomas -- match this exact face." });
    parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
  }
  parts.push({ text: CORRECTION });

  console.log("Generating (round 6): Thomas...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "thomas-garment-fix-r6.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
