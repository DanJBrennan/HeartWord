/**
 * Round 5 for Jesus only -- not a Critic-driven fix (round 4 already
 * passed clean, "SEVERITY: none"), but Dan's own art-direction judgment
 * call on top of that pass, given 2026-09-07:
 *
 * "My criticisms concern its execution more than its overall direction.
 * The matching blue bands, large neatly tied sash, and carefully
 * displayed mantle make it look freshly coordinated. I would make the
 * belt narrower, soften the uniformity of the borders, and introduce
 * natural folds and modest wear. The cloth can remain well made and
 * cared for. The small stepped corner decoration deserves a nuanced
 * judgment: angular garment marks have ancient parallels, including
 * examples from Masada. But that does not establish this particular
 * design as something Jesus wore. I would simplify it. Consider
 * borrowing the original image's muted blue for a plain rectangular
 * mantle, with restrained edging and appropriate corner tassels."
 *
 * Refines FROM the round-4 candidate (the one the Critic passed clean)
 * -- keeps the tassels and the correct unstitched-rectangle mantle
 * construction round 4 got right, changes only: belt width, border/
 * stripe uniformity, fabric naturalism, and the corner motif/mantle
 * color per Dan's specific direction above.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-round5.ts
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
  "tassels (tzitzit) at the mantle corners and the unstitched, draped rectangular mantle construction exactly as " +
  "they are. Make these specific art-direction changes:\n" +
  "1. NARROWER BELT: replace the current large, wide, neatly-tied sash with a noticeably narrower tied cord or " +
  "slender cloth strip around the waist -- understated, not a bold wide wrap.\n" +
  "2. SIMPLIFY THE MANTLE COLOR AND EDGING: change the outer mantle to a plain, muted, slightly dusty blue " +
  "(similar to a well-worn indigo-dyed wool, not a bright saturated blue), with only a thin, restrained edge " +
  "finish -- remove the bold matching blue clavi-style stripe bands entirely and remove the stepped/gamma-shaped " +
  "corner motif. The mantle should read as a simple, plain rectangular piece of dyed cloth, not a garment with " +
  "graphic trim or corner ornamentation.\n" +
  "3. SOFTEN UNIFORMITY: the current fabric and borders look too crisp, matching, and freshly coordinated like a " +
  "styled photoshoot outfit. Make the weave and dye look slightly less perfectly uniform -- subtle irregularity " +
  "in the dye tone, a hand-woven rather than machine-perfect texture.\n" +
  "4. NATURAL FOLDS AND MODEST WEAR: add natural creases and draped folds in the fabric consistent with real " +
  "cloth that has been worn and moved in, and a soft, gently worn quality to the texture -- but the garment " +
  "should still read as well-made and well cared for, not tattered, dirty, or damaged.\n" +
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

  const round4Path = path.join(CANDIDATES_DIR, "jesus-garment-fix-r4.png");
  const round4Buf = await readFile(round4Path);

  const originalPath = path.join(dataDir, "assets", "characters", "jesus", "motion", "motion-neutral-standing-v2.png");
  const originalBuf = await readFile(originalPath);

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
    { text: "This image shows Jesus's current garment-corrected candidate design -- refine it further as instructed below." },
    { inlineData: { mimeType: "image/png", data: round4Buf.toString("base64") } },
    {
      text:
        "For reference, this second image is the ORIGINAL pre-correction design -- note its muted blue mantle " +
        "color specifically (ignore its garment construction, which was already corrected)."
    },
    { inlineData: { mimeType: "image/png", data: originalBuf.toString("base64") } }
  ];
  if (headshotRow) {
    const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
    parts.push({ text: "Reference headshot for Jesus -- match this exact face." });
    parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
  }
  parts.push({ text: CORRECTION });

  console.log("Generating (round 5): Jesus...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(CANDIDATES_DIR, "jesus-garment-fix-r5.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
