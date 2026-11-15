/**
 * Round 7 for Jesus only, per Dan's direction 2026-09-07: round 6 got
 * the narrower belt and worn/frayed fabric right, but the Critic caught
 * a side effect -- fraying the hems caused the tied tassels (tzitzit) at
 * the mantle corners to blend into generic frayed loom-thread fringe
 * ("frayed cloth ends are not tzitzit"), and the sandals/tunic neckline
 * drifted back to round 4/5's earlier problems (high-laced "gladiator"
 * sandals, keyhole neckline) since they weren't explicitly re-locked
 * this round.
 *
 * Refines FROM round 6 (keeps the belt and worn texture), with round 4
 * attached as an explicit reference for the three things to restore
 * exactly: distinct tied tassels separate from the fraying, the
 * low-ankle sandals, and the plain neck slit.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-round7.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const CORRECTION =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. This is the " +
  "FIRST image (round 6) -- keep EVERYTHING about it exactly as it is: the narrower tied belt, the worn/frayed " +
  "fabric texture on the plain edges of the tunic and mantle, the mantle color, clavi, and gamma corner motif -- " +
  "except for these three specific fixes, using the SECOND image (round 4) as the exact reference for each:\n" +
  "1. TASSELS MUST STAY DISTINCT FROM THE FRAYING: at each of the four corners of the outer mantle, there must " +
  "be a clearly tied, knotted tassel (tzitzit) -- several distinct wool cords gathered and tied in a knot near " +
  "the corner, hanging separately -- exactly like the tassels in the second reference image. This tassel must " +
  "be visually distinct from the frayed/worn fabric edges elsewhere on the garment -- fraying applies only to " +
  "the plain hem and edge fabric, never to the corners where the tied tassels hang.\n" +
  "2. SANDALS: replace the current high, calf-wrapping laced sandals with the low-ankle sandal style shown in " +
  "the second reference image -- flat sole, simple strap across the foot, at most a single loop at the ankle, " +
  "nothing wrapping up the shin.\n" +
  "3. NECKLINE: change the tunic's neck opening to a plain straight slit like the second reference image, not a " +
  "tailored keyhole/V-notch cut.\n" +
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

  const round6Buf = await readFile(path.join(CANDIDATES_DIR, "jesus-garment-fix-r6.png"));
  const round4Buf = await readFile(path.join(CANDIDATES_DIR, "jesus-garment-fix-r4.png"));

  const cv = db
    .prepare(
      `SELECT cv.id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.name = 'Jesus'`
    )
    .get() as { id: string } | undefined;
  const headshotRow = cv
    ? (db
        .prepare(`SELECT path FROM character_assets WHERE character_version_id = ? AND category = 'headshot' LIMIT 1`)
        .get(cv.id) as { path: string } | undefined)
    : undefined;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "FIRST image (round 6) -- this is the base design to keep, with three small fixes described below." },
    { inlineData: { mimeType: "image/png", data: round6Buf.toString("base64") } },
    { text: "SECOND image (round 4) -- exact reference for tassel construction, sandals, and neckline." },
    { inlineData: { mimeType: "image/png", data: round4Buf.toString("base64") } }
  ];
  if (headshotRow) {
    const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
    parts.push({ text: "Reference headshot for Jesus -- match this exact face." });
    parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
  }
  parts.push({ text: CORRECTION });

  console.log("Generating (round 7): Jesus...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "jesus-garment-fix-r7.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
