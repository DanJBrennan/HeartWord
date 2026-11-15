/**
 * Round 2: refines the round-1 garment-fix candidates
 * (fix-jesus-twelve-garments.ts) for the 9 characters that came back
 * moderate/severe from the Critic's re-review (2026-09-07,
 * src/pipeline/qc/canon-critic.ts) -- round 1 fixed the big structural
 * errors (tailored coat -> draped mantle, gladiator sandals, embroidery)
 * but introduced or left four specific, narrower problems the Critic
 * named consistently across almost every re-review:
 *
 * 1. Tassels were present but wrong in STYLE -- thick decorative
 *    pom-pom/curtain-tie fringe strung along the whole hem, not thin
 *    knotted wool cords tied at exactly the four corners.
 * 2. Clavi (tunic stripes) came out as a single off-center stripe instead
 *    of two symmetric stripes, one from each shoulder.
 * 3. The sash instruction from round 1 ("wide woven cloth sash") was
 *    itself wrong -- the Critic says the authentic item is a NARROW
 *    leather belt or cord girdle (ezor), not a wide wrapped sash, which
 *    reads as a modern cummerbund.
 * 4. Several garments are fully saturated in one bright dye (solid blue,
 *    teal, indigo) -- the record supports an undyed/cream base with color
 *    reserved for the clavi stripes and tassel accents only.
 *
 * Two character-specific notes also applied, since the Critic named them
 * directly: James son of Zebedee's mantle has an L-shaped gamma corner
 * motif the Critic says is the documented WOMEN's pattern (men's is a
 * straight notched bar); Judas's tunic is ankle-length with wrist-length
 * sleeves, reading as too formal for a working man (knee/upper-calf and
 * elbow-length is correct).
 *
 * Deliberately NOT touched: hairstyle. Both John and Thomas were flagged
 * again for hair, but that's an intentional identity-preservation choice
 * carried over from round 1, not a defect -- changing it would drift the
 * character's established likeness.
 *
 * Refines FROM the round-1 candidate (not the original v1 image) so the
 * already-fixed macro structure (mantle construction, general silhouette)
 * is preserved -- this pass only tightens the four issues above. The
 * original headshot is included as a second reference purely to reinforce
 * face-lock.
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-twelve-garments-round2.ts
 * Or one character: pass its slug, e.g. `jesus`.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

const SHARED_CORRECTION =
  "Keep this EXACT same person -- same face, same skin tone, same build, same hairstyle and beard. Do not " +
  "redesign the character's identity. This garment was already corrected once (tailored coat replaced with a " +
  "draped mantle, tassels added, gold trim removed) -- refine ONLY these four remaining, more specific issues:\n" +
  "1. TASSEL STYLE: the current tassels are too thick and decorative (like curtain tie-backs or pom-poms) and/or " +
  "strung along the whole hem. Replace them with THIN, simple knotted wool cords/threads, tied at EXACTLY the " +
  "four corners of the outer mantle only -- nowhere else. The tassel thread color should be undyed white/cream " +
  "wool (optionally with one thin blue/indigo thread among them), NOT dyed to match the garment's color.\n" +
  "2. CLAVI SYMMETRY: if the tunic has a vertical stripe, it must be TWO symmetric stripes, one descending " +
  "straight down from EACH shoulder (front and back), never a single off-center stripe.\n" +
  "3. BELT/SASH: replace any wide, thick, multi-wrapped cloth sash or cummerbund-style wrap with a NARROW leather " +
  "belt or a simple thin woven cord tied once around the waist.\n" +
  "4. FABRIC SATURATION: if the garment is fully dyed in one bright, saturated, uniform color, change the base " +
  "tunic and mantle fabric to an undyed or lightly-dyed cream/off-white/natural wool tone, and move that " +
  "character's own distinguishing color onto the clavi stripes and/or a narrow mantle border instead of the " +
  "whole garment.\n" +
  "Photorealistic, full body, standing, facing camera, neutral warm-beige studio background, soft even studio " +
  "lighting, no harsh shadows. No text, no labels, no logos anywhere in the image.";

interface CharacterTarget {
  slug: string;
  name: string;
  characterName: string; // for headshot lookup
  extraNote?: string;
}

const TARGETS: CharacterTarget[] = [
  {
    slug: "jesus",
    name: "Jesus",
    characterName: "Jesus"
  },
  { slug: "andrew", name: "Andrew", characterName: "Andrew" },
  {
    slug: "james-son-of-zebedee",
    name: "James son of Zebedee",
    characterName: "James son of Zebedee",
    extraNote:
      "Additionally: if the outer mantle has an L-shaped (gamma/Γ) corner motif, replace it with a straight " +
      "notched-bar corner motif instead -- archaeological record documents the L-shaped gamma pattern on women's " +
      "mantles specifically, and a straight notched bar on men's."
  },
  { slug: "john-son-of-zebedee", name: "John son of Zebedee", characterName: "John son of Zebedee" },
  { slug: "thomas", name: "Thomas", characterName: "Thomas" },
  { slug: "matthew", name: "Matthew (Levi)", characterName: "Matthew (Levi)" },
  {
    slug: "thaddaeus-jude",
    name: "Thaddaeus (Jude)",
    characterName: "Thaddaeus (Jude)"
  },
  { slug: "simon-the-zealot", name: "Simon the Zealot", characterName: "Simon the Zealot" },
  {
    slug: "judas-iscariot",
    name: "Judas Iscariot",
    characterName: "Judas Iscariot",
    extraNote:
      "Additionally: shorten the tunic hemline from ankle-length to knee/upper-calf length, and shorten the " +
      "sleeves from wrist-length to short/elbow-length -- the current cut reads as too formal for a working man " +
      "in this period."
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
  console.log(`Writing round-2 garment-fix candidates to ${CANDIDATES_DIR}\n`);

  for (const target of targets) {
    console.log(`Generating (round 2): ${target.name}...`);
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
        { text: `This image shows ${target.name}'s current garment-corrected candidate design -- refine it further as instructed below.` },
        { inlineData: { mimeType: "image/png", data: round1Buf.toString("base64") } }
      ];
      if (headshotRow) {
        const headshotBuf = await readFile(path.join(dataDir, "assets", headshotRow.path));
        parts.push({ text: `Reference headshot for ${target.name} -- match this exact face.` });
        parts.push({ inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } });
      }
      parts.push({ text: SHARED_CORRECTION + (target.extraNote ? `\n${target.extraNote}` : "") });

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-garment-fix-r2.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. These are round-2 candidates -- review against round 1 and the original before promoting any to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
