/**
 * Round 7 for Thomas only. Round 6 got the mantle/gamma motifs/tassel
 * presence right (moderate), but the Critic's re-review (2026-09-07)
 * still flagged four specific issues: tassels are styled as drapery
 * rather than four distinct hand-tied corner cords with a blue
 * (tekhelet) thread; the tunic has only one clavus stripe instead of two
 * symmetric ones; the neckline is a tailored keyhole cut instead of a
 * plain horizontal slit; the sandals are modern flip-flop-style instead
 * of multi-strap Judean sandals.
 *
 * Refines FROM round 6.
 *
 * Run: npx tsx scripts/character-tool/fix-thomas-round7.ts
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
  "plain mantle with its small corner gamma motifs, the short sleeves, and the narrow cord belt exactly as they " +
  "are. Make these specific fixes:\n" +
  "1. TASSEL CONSTRUCTION: replace the current tassels with four distinct hand-tied tassels, one at each corner " +
  "of the mantle -- several thin wool cords gathered and knotted, with one thin blue thread woven in among the " +
  "white/cream threads (representing tekhelet dye). They should look like tied thread bundles, not decorative " +
  "drapery tassels.\n" +
  "2. SYMMETRIC CLAVI: the tunic currently has only one vertical stripe -- add a second, matching vertical " +
  "stripe on the opposite side, so there is one stripe descending from the left shoulder and one from the right " +
  "shoulder, symmetric on either side of the neck opening.\n" +
  "3. PLAIN NECKLINE: change the tunic's neck opening from a tailored keyhole/V-notch cut to a plain straight " +
  "horizontal slit, like a simple woven opening with no shaped notch.\n" +
  "4. SANDALS: replace the flip-flop-style sandals (single strap between the toes) with sandals that have " +
  "multiple leather straps crossing the top of the foot and wrapping once around the ankle, on a flat leather " +
  "sole -- no modern flip-flop toe-post as the only strap.\n" +
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

  const round6Buf = await readFile(path.join(CANDIDATES_DIR, "thomas-garment-fix-r6.png"));

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
    { inlineData: { mimeType: "image/png", data: round6Buf.toString("base64") } }
  ];
  if (headshotRow) {
    const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
    parts.push({ text: "Reference headshot for Thomas -- match this exact face." });
    parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
  }
  parts.push({ text: CORRECTION });

  console.log("Generating (round 7): Thomas...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "thomas-garment-fix-r7.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
