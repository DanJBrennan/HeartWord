/**
 * Targeted follow-up to fix-jesus-twelve-garments.ts's round-1 candidates
 * for Peter and Philip the Apostle -- both came back rated "minor" from
 * the Critic's re-review (2026-09-07), each for exactly one narrow,
 * named issue rather than the broader set round 2 addressed for the
 * still-severe/moderate characters:
 *
 * - Peter: tassels are present and correctly placed at the mantle
 *   corners, but styled like "heavy modern decorative curtain tassels"
 *   rather than simple twisted/knotted wool cords.
 * - Philip: everything else passed; the inner tunic runs full ankle
 *   length, which the Critic notes is associated with elite/leisure dress
 *   rather than a traveling apostle's working attire (knee/mid-calf).
 *
 * Refines FROM each character's round-1 candidate (not the original v1
 * image), same as round 2, to preserve everything already correct and
 * touch only the one named issue per character.
 *
 * Run: npx tsx scripts/character-tool/fix-peter-philip-minor.ts
 * Or one character: pass its slug, e.g. `peter`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const IDENTITY_LOCK =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. Do not " +
  "redesign the character's identity or anything else about the garment. Only make the single change below.\n";

interface CharacterTarget {
  slug: string;
  name: string;
  characterName: string;
  correction: string;
}

const TARGETS: CharacterTarget[] = [
  {
    slug: "peter",
    name: "Peter",
    characterName: "Peter",
    correction:
      "The tassels (tzitzit) hanging from the outer mantle's corners are currently styled like heavy, thick, " +
      "decorative curtain/upholstery tassels. Replace them with thin, simple twisted and knotted wool cord " +
      "fringe -- several slender threads tied in a small knot near the corner, hanging loose -- not a bulky " +
      "decorative tassel head. Keep the same corner placement and the blue (tekhelet) thread accent."
  },
  {
    slug: "philip-the-apostle",
    name: "Philip the Apostle",
    characterName: "Philip the Apostle",
    correction:
      "The inner tunic currently falls all the way to the ankles, which reads as elite/leisure dress rather than " +
      "a traveling apostle's working attire. Shorten the tunic hemline to knee or upper-calf length, appropriate " +
      "for walking and manual work."
  }
];

type GeminiImagePart = { inlineData?: { mimeType: string; data: string } };
type GeminiImageResponse = {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
  promptFeedback?: { blockReason?: string };
};

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

  const data = (await res.json()) as GeminiImageResponse;
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
  const requestedSlug = process.argv[2];
  const targets = requestedSlug ? TARGETS.filter((t) => t.slug === requestedSlug) : TARGETS;
  if (requestedSlug && targets.length === 0) {
    throw new Error(`No target with slug "${requestedSlug}". Known slugs: ${TARGETS.map((t) => t.slug).join(", ")}`);
  }

  const db = getDb();
  console.log(`Writing candidates to ${CANDIDATES_DIR}\n`);

  for (const target of targets) {
    console.log(`Generating: ${target.name}...`);
    try {
      const round1Path = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix.png`);
      const round1Buf = await readFile(round1Path);

      const cv = db
        .prepare(
          `SELECT cv.id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
           WHERE c.name = ?`
        )
        .get(target.characterName) as { id: string } | undefined;
      const headshotRow = cv
        ? (db
            .prepare(`SELECT path FROM character_assets WHERE character_version_id = ? AND category = 'headshot' LIMIT 1`)
            .get(cv.id) as { path: string } | undefined)
        : undefined;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `This image shows ${target.name}'s current garment candidate design -- make one small refinement to it.` },
        { inlineData: { mimeType: "image/png", data: round1Buf.toString("base64") } }
      ];
      if (headshotRow) {
        const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
        parts.push({ text: `Reference headshot for ${target.name} -- match this exact face.` });
        parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
      }
      parts.push({ text: IDENTITY_LOCK + target.correction });

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r2.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. Review against the round-1 candidate before promoting to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
