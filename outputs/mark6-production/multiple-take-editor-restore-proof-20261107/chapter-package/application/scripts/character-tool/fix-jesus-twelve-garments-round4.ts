/**
 * Round 4: fixes a specific regression round 3
 * (fix-jesus-twelve-garments-round3.ts) introduced for 6 of its 8
 * targets. Round 3 told the generator to replace the mantle's continuous
 * border trim with corner-only gamma/notched motifs -- for Andrew and
 * Matthew that landed correctly (motif added, tassels kept), but for
 * Jesus, James son of Zebedee, John son of Zebedee, Thomas, Thaddaeus,
 * and Judas the model read "replace the border" as license to also
 * remove the tassels that round 2 had already gotten right, dropping all
 * six back to severe (2026-09-07 Critic re-review).
 *
 * This round regenerates FROM EACH CHARACTER'S ROUND-2 IMAGE (not round
 * 3) -- round 2 still had the tassels correctly present, just with the
 * continuous-border problem round 3 was trying to fix -- with an
 * explicit instruction to keep the existing tassels untouched and add
 * the corner motif alongside them, plus the other issues round 3's
 * critic pass surfaced for each character (symmetric clavi, belt
 * hardware, neckline, sandals).
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-twelve-garments-round4.ts
 * Or one character: pass its slug, e.g. `jesus`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const SHARED_CORRECTION =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. Do not " +
  "redesign the character's identity. This image already has visible tassels (tzitzit) correctly tied at the " +
  "four corners of the outer mantle -- DO NOT remove, shrink, or simplify them. Keep them exactly as they " +
  "currently appear. Make ONLY these additions/refinements:\n" +
  "1. ADD CORNER MOTIFS ALONGSIDE THE EXISTING TASSELS: at each corner of the mantle, right next to the existing " +
  "tassel, add a small woven motif -- either a small L-shaped (gamma) mark or a short straight notched bar -- " +
  "without removing or altering the tassel itself. Do not add any continuous border or trim running along the " +
  "mantle's edge -- the motif is small and appears only at the corners, next to the tassels.\n" +
  "2. CLAVI ON THE TUNIC ONLY, SYMMETRIC: the tunic should have exactly TWO vertical stripes (clavi), one " +
  "descending from the LEFT shoulder and one from the RIGHT shoulder, evenly spaced on either side of the neck " +
  "opening -- never a single stripe or both stripes clustered on one side, and never any stripe on the mantle.\n" +
  "3. NO BELT HARDWARE: the waist belt/sash must have no visible metal buckle, frame, or clasp -- a simple wide " +
  "woven cloth sash tied in a knot, or a plain tied cord/strap with no hardware.\n" +
  "4. PLAIN NECK SLIT: the tunic's neck opening should be a plain straight horizontal or slightly curved slit, " +
  "no tailored keyhole notch, no ribbed crew-neck collar, no finished/bound edge.\n" +
  "5. AUTHENTIC SANDALS: a flat, multi-layered leather sole secured by simple straps across the top of the foot " +
  "and one loop around the ankle or heel -- no high leg-wrapping laces climbing the calf, no single toe-post " +
  "flip-flop as the only strap.\n" +
  "Photorealistic, full body, standing, facing camera, neutral warm-beige studio background, soft even studio " +
  "lighting, no harsh shadows. No text, no labels, no logos anywhere in the image.";

interface CharacterTarget {
  slug: string;
  name: string;
  characterName: string;
  extraNote?: string;
}

const TARGETS: CharacterTarget[] = [
  {
    slug: "jesus",
    name: "Jesus",
    characterName: "Jesus",
    extraNote:
      "Additionally: shorten the tunic hemline from ankle-length to knee or upper-calf length, and widen/shorten " +
      "the sleeves to elbow-length -- ankle-length with narrow fitted sleeves reads as elite/leisure dress, not a " +
      "working man's."
  },
  {
    slug: "james-son-of-zebedee",
    name: "James son of Zebedee",
    characterName: "James son of Zebedee"
  },
  {
    slug: "john-son-of-zebedee",
    name: "John son of Zebedee",
    characterName: "John son of Zebedee"
  },
  {
    slug: "thomas",
    name: "Thomas",
    characterName: "Thomas",
    extraNote: "Additionally: shorten the tailored set-in sleeves to simple short sleeves formed by the tunic's own width, not fitted armhole seams."
  },
  {
    slug: "thaddaeus-jude",
    name: "Thaddaeus (Jude)",
    characterName: "Thaddaeus (Jude)",
    extraNote: "Additionally: shorten the tailored set-in sleeves to simple short sleeves formed by the tunic's own width, not fitted armhole seams."
  },
  {
    slug: "judas-iscariot",
    name: "Judas Iscariot",
    characterName: "Judas Iscariot"
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
  console.log(`Writing round-4 garment-fix candidates to ${CANDIDATES_DIR}\n`);

  for (const target of targets) {
    console.log(`Generating (round 4): ${target.name}...`);
    try {
      // Refine FROM ROUND 2, not round 3 -- round 2 still had tassels correct.
      const round2Path = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r2.png`);
      const round2Buf = await readFile(round2Path);

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
        { inlineData: { mimeType: "image/png", data: round2Buf.toString("base64") } }
      ];
      if (headshotRow) {
        const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
        parts.push({ text: `Reference headshot for ${target.name} -- match this exact face.` });
        parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
      }
      parts.push({ text: SHARED_CORRECTION + (target.extraNote ? `\n${target.extraNote}` : "") });

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r4.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. These are round-4 candidates -- review against round 2 and round 3 before promoting any to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
