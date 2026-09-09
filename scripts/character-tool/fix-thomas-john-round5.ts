/**
 * Round 5 for Thomas (moderate) and John son of Zebedee (severe) --
 * the last two of the original 13 Jesus/Twelve garment-fix targets still
 * not clean, per the round-4 Critic re-review (2026-09-07):
 *
 * Thomas (moderate): tassels present but styled like heavy plush
 * "drapery/curtain" tassels instead of thin knotted cords; wide flowing
 * bell sleeves instead of natural drop-shoulder short sleeves; thick
 * multi-wrapped cummerbund sash instead of a narrow belt/cord; mantle
 * reads as a tailored poncho/cape with fixed armholes instead of a
 * genuine unstitched rectangular wrap.
 *
 * John son of Zebedee (severe): tassels and gamma corner motifs were
 * mistakenly placed on the TUNIC instead of the outer MANTLE (those
 * markers belong on the mantle only); mantle is a cut-and-sewn split
 * poncho/cape with two symmetrical hanging panels instead of an
 * unstitched wrap; thick cummerbund sash instead of a narrow belt/cord;
 * gladiator-style high-ankle-wrap sandals instead of low-ankle sandals.
 * (Clean-shaven face is NOT touched -- that's this character's existing
 * identity trait, not a defect to correct.)
 *
 * Refines FROM each character's round-4 candidate.
 *
 * Run: npx tsx scripts/character-tool/fix-thomas-john-round5.ts
 * Or one character: pass its slug, e.g. `thomas` or `john-son-of-zebedee`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

interface CharacterTarget {
  slug: string;
  name: string;
  characterName: string;
  correction: string;
}

const IDENTITY_LOCK =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. Do not " +
  "redesign the character's identity.\n";

const TARGETS: CharacterTarget[] = [
  {
    slug: "thomas",
    name: "Thomas",
    characterName: "Thomas",
    correction:
      IDENTITY_LOCK +
      "Make these specific fixes:\n" +
      "1. TASSELS: replace the heavy, plush, curtain/drapery-style tassels with thin, simple knotted wool cord " +
      "fringe -- several slender threads tied in a small knot at each corner, hanging loose, not a bulky " +
      "decorative tassel head.\n" +
      "2. SLEEVES: replace the wide, flowing, wrist-length bell sleeves with simple short sleeves that fall " +
      "naturally from the tunic's own width at the shoulder, ending above or at the elbow -- not tailored, not " +
      "flared.\n" +
      "3. BELT/SASH: replace the thick, multi-wrapped cummerbund-style sash with a narrow tied cord or slender " +
      "cloth strip around the waist.\n" +
      "4. MANTLE CONSTRUCTION: rebuild the outer mantle as a genuine unstitched rectangular sheet of cloth " +
      "wrapped around the body and over one shoulder -- it currently looks like a tailored poncho/cape with " +
      "fixed armholes, which is incorrect."
  },
  {
    slug: "john-son-of-zebedee",
    name: "John son of Zebedee",
    characterName: "John son of Zebedee",
    correction:
      IDENTITY_LOCK +
      "Make these specific fixes:\n" +
      "1. MOVE TASSELS AND CORNER MOTIF TO THE MANTLE: the tassels and the L-shaped corner motif are currently on " +
      "the inner tunic's hem -- remove them from the tunic entirely. Instead, add visible knotted tassels AND a " +
      "small corner motif to the four corners of the OUTER MANTLE only. The tunic itself should be plain at the " +
      "hem, with no tassels or corner motifs.\n" +
      "2. MANTLE CONSTRUCTION: rebuild the outer mantle as a genuine unstitched rectangular sheet of cloth " +
      "wrapped around the body and over one shoulder -- it currently looks like a cut-and-sewn split poncho/cape " +
      "with two symmetrical hanging panels, which is incorrect.\n" +
      "3. BELT/SASH: replace the thick cummerbund-style sash with a narrow tied cord or slender cloth strip " +
      "around the waist.\n" +
      "4. SANDALS: replace the high, calf-wrapping laced sandals with low-ankle sandals -- flat sole, simple " +
      "strap across the foot, at most a single loop at the ankle, nothing wrapping up the shin."
  }
];

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
  const requestedSlug = process.argv[2];
  const targets = requestedSlug ? TARGETS.filter((t) => t.slug === requestedSlug) : TARGETS;

  const db = getDb();

  for (const target of targets) {
    console.log(`Generating (round 5): ${target.name}...`);
    try {
      const round4Buf = await readFile(path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r4.png`));

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
        { text: `This image shows ${target.name}'s current garment-corrected candidate design -- refine it further as instructed below.` },
        { inlineData: { mimeType: "image/png", data: round4Buf.toString("base64") } }
      ];
      if (headshotRow) {
        const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
        parts.push({ text: `Reference headshot for ${target.name} -- match this exact face.` });
        parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
      }
      parts.push({
        text:
          target.correction +
          "\nPhotorealistic, full body, standing, facing camera, neutral warm-beige studio background, soft " +
          "even studio lighting, no harsh shadows. No text, no labels, no logos anywhere in the image."
      });

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r5.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
