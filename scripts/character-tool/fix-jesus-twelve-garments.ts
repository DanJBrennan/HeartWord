/**
 * One-off script: regenerate garment-corrected candidate images for Jesus
 * and the Twelve, per the Critic's canon garment audit (2026-09-07,
 * src/pipeline/qc/canon-critic.ts) -- 12 of these 13 characters rated
 * SEVERE for the same systemic historical-costume errors: no tzitzit
 * (tassels), a tailored open-front sleeved "Hollywood bathrobe" coat
 * instead of an authentic unsewn rectangular draped mantle, modern
 * buckled/caged sandals, a thin modern-style belt instead of a wide cloth
 * sash, and (for named characters) inauthentic embroidered/gold trim
 * where the archaeological record instead supports woven clavi (vertical
 * stripes) and gammadia (corner marks).
 *
 * Each character's EXISTING approved headshot + full-body reference image
 * are passed back in as identity-lock inputs with an explicit "same exact
 * person, same face/build/hair -- correct ONLY the garment construction"
 * instruction, using Nano Banana Pro (higher quality, matching this
 * codebase's existing "canon-critical" cost tier convention). Candidates
 * only -- this script does not touch the database, per canonical-
 * characters.md's non-destructive version-evolution workflow. Review
 * side by side against the current approved image before promoting any
 * of these to a real character_versions row.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-twelve-garments.ts
 * Or regenerate just one: pass its slug, e.g. `jesus` or `peter`.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

// Shared correction instructions -- one shared block since the Critic's
// audit found the SAME systemic issues on nearly every one of these
// characters, not isolated one-offs. Kept general (not per-character
// color prescriptions) so each character's own distinguishing color/
// identity marker survives the fix untouched.
const GARMENT_CORRECTION =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard, same Papuan " +
  "casting. Do not redesign the character's identity or change who they are. Correct ONLY the following real " +
  "historical costume errors, confirmed by archaeological research (Masada and Nahal Hever textile finds) and " +
  "Second Temple Jewish dress custom:\n" +
  "1. TASSELS: add visible knotted wool tassels (tzitzit) hanging from the four corners of the outer mantle, per " +
  "Numbers 15:38-39 and the Gospels' own references to people touching the fringe of a garment's hem.\n" +
  "2. GARMENT CONSTRUCTION: rebuild the outer garment as an authentic UNSEWN RECTANGULAR draped mantle (himation/" +
  "tallit) wrapped over one shoulder and around the body -- NOT a tailored open-front coat with set-in sleeves, " +
  "lapels, or a modern jacket-like cut. The inner tunic should be a simple rectangular loom-woven garment with a " +
  "plain neck opening, no modern V-neck placket, no topstitching, no set-in sleeve seams.\n" +
  "3. FOOTWEAR: replace any modern-looking buckled, caged, or contoured 'gladiator sandal' with simple flat-sole " +
  "leather sandals secured by plain thong straps.\n" +
  "4. BELT: replace any thin modern leather strap or braided cord belt with a wide woven cloth sash wrapped " +
  "around the waist.\n" +
  "5. ORNAMENTATION: if the garment currently has embroidered borders, jacquard trim, or metallic/gold trim, " +
  "replace it with a woven vertical stripe (clavus) running from the shoulder down the tunic, and/or a simple " +
  "L-shaped woven corner mark (gammadia) on the mantle, in a plausible natural dye (madder red, rust, indigo, " +
  "brown) or left undyed cream/off-white -- keep this character's own existing distinguishing color as the base " +
  "of that stripe/mark rather than inventing a new one. Avoid bright, saturated, obviously-modern dye colors.\n" +
  "Photorealistic, full body, standing, facing camera, neutral warm-beige studio background, soft even studio " +
  "lighting, no harsh shadows. No text, no labels, no logos anywhere in the image.";

interface CharacterTarget {
  slug: string;
  name: string;
}

const TARGETS: CharacterTarget[] = [
  { slug: "jesus", name: "Jesus" },
  { slug: "peter", name: "Peter" },
  { slug: "andrew", name: "Andrew" },
  { slug: "james-son-of-zebedee", name: "James son of Zebedee" },
  { slug: "john-son-of-zebedee", name: "John son of Zebedee" },
  { slug: "philip-the-apostle", name: "Philip the Apostle" },
  { slug: "bartholomew", name: "Bartholomew" },
  { slug: "thomas", name: "Thomas" },
  { slug: "matthew", name: "Matthew (Levi)" },
  { slug: "james-son-of-alphaeus", name: "James son of Alphaeus" },
  { slug: "thaddaeus-jude", name: "Thaddaeus (Jude)" },
  { slug: "simon-the-zealot", name: "Simon the Zealot" },
  { slug: "judas-iscariot", name: "Judas Iscariot" }
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
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Writing garment-fix candidates to ${OUTPUT_DIR}\n`);

  for (const target of targets) {
    console.log(`Generating: ${target.name}...`);
    try {
      const cv = db
        .prepare(
          `SELECT cv.id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
           WHERE c.name = ?`
        )
        .get(target.name) as { id: string } | undefined;
      if (!cv) throw new Error(`No approved character_version found for "${target.name}"`);

      const assets = db
        .prepare(
          `SELECT category, path FROM character_assets WHERE character_version_id = ?
           ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'body_pose' THEN 1 ELSE 2 END`
        )
        .all(cv.id) as Array<{ category: string; path: string }>;

      const headshot = assets.find((a) => a.category === "headshot");
      const bodyPose = assets.find((a) => a.path.includes("neutral-standing")) ?? assets.find((a) => a.category === "body_pose");
      const refs = [headshot, bodyPose].filter((a): a is { category: string; path: string } => !!a);
      if (refs.length === 0) throw new Error(`No reference images found for "${target.name}"`);

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `Reference image(s) below show ${target.name}'s current approved design -- this is the exact person/identity to preserve.` }
      ];
      for (const ref of refs) {
        const abs = path.join(dataDir, "assets", ref.path);
        const buf = await readFile(abs);
        parts.push({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });
      }
      parts.push({ text: GARMENT_CORRECTION });

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(OUTPUT_DIR, `${target.slug}-garment-fix.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. These are candidates only -- review side by side against each character's current approved image before promoting any to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
