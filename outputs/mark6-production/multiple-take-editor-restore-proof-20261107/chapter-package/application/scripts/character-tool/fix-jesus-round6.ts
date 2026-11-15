/**
 * Round 6 for Jesus only, per Dan's direction 2026-09-07: keep round 4
 * (the Critic-clean, structurally correct candidate -- unstitched draped
 * mantle, tassels at the mantle corners, clavi, authentic sandals) as
 * the base, but swap in round 5's narrower belt (the one specific detail
 * from round 5 Dan wanted to keep despite round 5's broader structural
 * regression), and add visibly worn, frayed hems/edges to the garments.
 *
 * Refines FROM round 4, with round 5 attached only as a reference for
 * the belt style -- explicitly do not carry over round 5's coat
 * construction, misplaced tassels, or missing clavi.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-round6.ts
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
  "FIRST image (round 4) -- keep EVERYTHING about it exactly as it is: the unstitched draped rectangular mantle, " +
  "its color and corner gamma motifs and tassels, the tunic and its clavi stripes, the sandals -- except for " +
  "these two specific changes:\n" +
  "1. BELT: replace the current wide sash/belt with a narrower tied cord or slender cloth strip around the " +
  "waist, similar in width and style to the belt shown in the SECOND reference image (round 5) -- ignore " +
  "everything else about that second image, it is a reference for belt width/style only.\n" +
  "2. WORN, FRAYED TEXTURE: make the garments look visibly worn -- add natural creases and soft, gently-used " +
  "fabric texture, and fray the hems and edges of both the tunic and the mantle (loose threads, slightly " +
  "unraveled edges) so the cloth reads as well-used clothing, not fresh off the loom. The garment should still " +
  "look well-made and cared for overall, just worn with use.\n" +
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

  const round4Buf = await readFile(path.join(CANDIDATES_DIR, "jesus-garment-fix-r4.png"));
  const round5Buf = await readFile(path.join(CANDIDATES_DIR, "jesus-garment-fix-r5.png"));

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
    { text: "FIRST image (round 4) -- this is the base design to keep, with two small changes described below." },
    { inlineData: { mimeType: "image/png", data: round4Buf.toString("base64") } },
    { text: "SECOND image (round 5) -- reference for belt width/style ONLY, ignore everything else about it." },
    { inlineData: { mimeType: "image/png", data: round5Buf.toString("base64") } }
  ];
  if (headshotRow) {
    const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
    parts.push({ text: "Reference headshot for Jesus -- match this exact face." });
    parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
  }
  parts.push({ text: CORRECTION });

  console.log("Generating (round 6): Jesus...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "jesus-garment-fix-r6.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
