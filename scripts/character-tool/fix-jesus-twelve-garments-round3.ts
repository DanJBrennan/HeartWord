/**
 * Round 3: refines the round-2 garment-fix candidates
 * (fix-jesus-twelve-garments-round2.ts) for the 8 characters still
 * moderate/severe after round 2's Critic re-review (2026-09-07,
 * src/pipeline/qc/canon-garment-critic.ts) -- round 2 fixed tassel
 * material and belt width for most, but introduced or left five new,
 * more specific problems the Critic named repeatedly:
 *
 * 1. CONTINUOUS BORDER TRIM: round 2's "move color to a mantle border"
 *    instruction was misread as a continuous piped/embroidered strip
 *    running the ENTIRE outer edge of the mantle. The Critic consistently
 *    says the authentic 1st-century feature is a small motif woven ONLY
 *    at the corners -- a gamma/L-shaped mark (gammadia) or a straight
 *    notched bar -- never a continuous border.
 * 2. CLAVI PLACEMENT/SYMMETRY: tunic stripes (clavi) still come out as a
 *    single off-center stripe, or clustered together on one side, or
 *    (John) mistakenly duplicated onto the OUTER MANTLE -- clavi belong
 *    on the tunic only, exactly one from each shoulder.
 * 3. BELT HARDWARE: James son of Zebedee's round-2 belt introduced a
 *    modern metal frame buckle -- a real regression the Critic flagged as
 *    worse than the original problem.
 * 4. NECKLINE: several still have a tailored keyhole or ribbed crew-neck
 *    collar; the record supports a plain straight slit only.
 * 5. FOOTWEAR: modern toe-post flip-flops or gladiator-style caging
 *    persist on several -- the record supports a flat multi-layer sole
 *    with side-laced ankle straps.
 *
 * Character-specific notes: Jesus's tunic is ankle-length (reads as
 * elite/leisure dress, not a working man's) and his/Matthew's outer
 * mantle is still a cut-and-sewn coat/cape with defined armholes rather
 * than a genuine unstitched rectangular wrap; John's mantle is cut like a
 * split poncho for the same reason. Andrew and Thomas and Thaddaeus still
 * have decorative/clustered tassels the round-2 fix didn't fully correct.
 *
 * Deliberately NOT touched: hairstyle (John, Thomas) -- an intentional
 * identity-preservation choice, not a defect.
 *
 * Refines FROM the round-2 candidate (not round 1 or the original) so
 * everything round 2 already fixed (tassel material, belt width for most,
 * natural dye) is preserved.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-twelve-garments-round3.ts
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
  "redesign the character's identity. This garment has already been corrected twice (mantle construction, " +
  "tassels, belt width) -- refine ONLY these five remaining, specific issues:\n" +
  "1. NO CONTINUOUS BORDER: if the outer mantle has a continuous colored border, piping, or embroidered trim " +
  "running along its entire edge, remove it. Replace it with a single small woven motif at just the corners of " +
  "the mantle -- either a small L-shaped (gamma) mark or a short straight notched bar -- never a continuous " +
  "strip around the whole perimeter.\n" +
  "2. CLAVI ON THE TUNIC ONLY, SYMMETRIC: the tunic (never the outer mantle) should have exactly TWO vertical " +
  "stripes (clavi), one descending straight down from the LEFT shoulder and one from the RIGHT shoulder, evenly " +
  "spaced on either side of the neck opening -- never a single stripe, never both stripes clustered on one side, " +
  "and never any stripe on the outer mantle itself.\n" +
  "3. NO BELT HARDWARE: the waist belt/sash must have NO visible metal buckle, frame, or clasp of any kind -- " +
  "either a simple wide woven cloth sash tied in a knot, or a plain tied leather cord/strap with no hardware.\n" +
  "4. PLAIN NECK SLIT: the tunic's neck opening should be a plain straight horizontal or slightly curved slit " +
  "with no tailored keyhole notch, no ribbed crew-neck collar band, and no finished/bound edge -- it should look " +
  "like a simple woven opening, not a modern garment collar.\n" +
  "5. AUTHENTIC SANDALS: replace any modern toe-post flip-flop or gladiator-style caged sandal with a flat, " +
  "multi-layered leather sole secured by simple leather straps laced across the top of the foot and around the " +
  "ankle -- no single thong between the toes as the only strap, no modern buckles.\n" +
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
      "Additionally: shorten the tunic hemline from ankle-length to knee or upper-calf length -- ankle-length " +
      "reads as elite/leisure dress, not a working man's. Also rebuild the outer mantle as a genuine unstitched " +
      "rectangular sheet of cloth wrapped around the body and over one shoulder -- it should have no sewn seams, " +
      "no defined armholes, and no symmetrical hanging front panels like a cut coat or cape."
  },
  {
    slug: "andrew",
    name: "Andrew",
    characterName: "Andrew",
    extraNote:
      "Additionally: the tassels are still too decorative -- replace them with just a few thin, sparse, loosely " +
      "hanging knotted wool threads at each corner, not a dense fringe cluster."
  },
  {
    slug: "james-son-of-zebedee",
    name: "James son of Zebedee",
    characterName: "James son of Zebedee",
    extraNote: "The belt hardware fix above is the primary issue for this character -- make sure no metal buckle or frame remains."
  },
  {
    slug: "john-son-of-zebedee",
    name: "John son of Zebedee",
    characterName: "John son of Zebedee",
    extraNote:
      "Additionally: rebuild the outer mantle as a genuine unstitched rectangular sheet of cloth wrapped around " +
      "the body and over one shoulder -- it currently looks like a cut-and-sewn split poncho/cape with two " +
      "symmetrical hanging panels, which is incorrect."
  },
  {
    slug: "thomas",
    name: "Thomas",
    characterName: "Thomas",
    extraNote:
      "Additionally: the two tunic stripes are currently clustered together on one side -- separate them so one " +
      "descends from the left shoulder and one from the right shoulder."
  },
  {
    slug: "matthew",
    name: "Matthew (Levi)",
    characterName: "Matthew (Levi)",
    extraNote:
      "Additionally: rebuild the outer mantle as a genuine unstitched rectangular sheet of cloth wrapped around " +
      "the body and over one shoulder -- it currently looks like a cut-and-sewn open-front cape/cardigan with " +
      "defined arm openings, which is incorrect."
  },
  {
    slug: "thaddaeus-jude",
    name: "Thaddaeus (Jude)",
    characterName: "Thaddaeus (Jude)",
    extraNote:
      "Additionally: the tassels are still too heavy and bundled, like decorative drapery tassels -- replace them " +
      "with just a few thin, sparse, loosely hanging knotted wool threads at each corner."
  },
  {
    slug: "simon-the-zealot",
    name: "Simon the Zealot",
    characterName: "Simon the Zealot"
    // Simon passed clean in round 2 -- included only if Dan re-requests; left out of TARGETS below.
  },
  {
    slug: "judas-iscariot",
    name: "Judas Iscariot",
    characterName: "Judas Iscariot"
  }
];

// Simon the Zealot already passed clean in round 2 -- excluded from this round's actual run.
const ROUND3_SLUGS = [
  "jesus",
  "andrew",
  "james-son-of-zebedee",
  "john-son-of-zebedee",
  "thomas",
  "matthew",
  "thaddaeus-jude",
  "judas-iscariot"
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
  const slugs = requestedSlug ? [requestedSlug] : ROUND3_SLUGS;
  const targets = TARGETS.filter((t) => slugs.includes(t.slug));
  if (targets.length === 0) {
    throw new Error(`No matching targets for slug(s): ${slugs.join(", ")}`);
  }

  const db = getDb();
  console.log(`Writing round-3 garment-fix candidates to ${CANDIDATES_DIR}\n`);

  for (const target of targets) {
    console.log(`Generating (round 3): ${target.name}...`);
    try {
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
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r3.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. These are round-3 candidates -- review against round 2 and round 1 before promoting any to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
