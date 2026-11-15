/**
 * Round 2 for the 7 crowd witnesses still severe after round 1
 * (fix-remaining-canon-round1.ts) -- Crowd witness (woman with child)
 * already passed clean and is excluded. Round 1's "light-touch, no
 * mantle" instruction turned out to be miscalibrated for these
 * characters specifically: the Critic's re-review (2026-09-07) didn't
 * ask for decoration, it flagged that appearing in PUBLIC with no outer
 * garment at all read as "underdressed" in Second Temple Judean culture
 * (citing John 21:7 -- Peter wrapping his cloak around himself
 * specifically because he was down to his tunic). That's a different
 * claim than richness of ornament.
 *
 * Dan's distinction, 2026-09-07: this applies to ordinary crowd members
 * standing/watching in public, but NOT to the four Friends or the healed
 * paralytic -- they're in a narrative rush (breaking through a roof,
 * then hurrying the healed man home), so appearing without an outer
 * garment is a deliberate, defensible narrative choice for them, not an
 * error. Those five are explicitly left untouched.
 *
 * This round's correction: add a PLAIN, undyed outer garment (a mantle
 * for men, a wrap/veil for women) -- and for men, the plain, minimal
 * tassels Torah law requires on ANY four-cornered outer garment
 * regardless of its value -- but explicitly NO decoration (no clavi, no
 * gammadia, no dye, no trim). This is a distinct middle tier from both
 * round 1 (fix-remaining-canon-round1.ts's LIGHT_TOUCH_CORRECTION, no
 * outer garment) and the Twelve's FULL correction (which adds
 * ornamentation appropriate to a named, established role).
 *
 * Refines FROM round 1, which already fixed some issues (footwear
 * mostly) -- also re-states the neckline/belt/side-slit corrections since
 * the Critic's round-1 review found several of those persisted.
 *
 * Run: npx tsx scripts/character-tool/fix-crowd-round2.ts
 * Or one character: pass its slug, e.g. `crowd-elder-grey-beard`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

interface CharacterTarget {
  slug: string;
  characterName: string;
  isMale: boolean;
}

const TARGETS: CharacterTarget[] = [
  { slug: "crowd-elder-grey-beard", characterName: "Crowd witness (elder, grey beard)", isMale: true },
  { slug: "crowd-man-headwrap", characterName: "Crowd witness (man, headwrap)", isMale: true },
  { slug: "crowd-older-woman-cream", characterName: "Crowd witness (older woman, cream headscarf)", isMale: false },
  { slug: "crowd-older-woman-rust", characterName: "Crowd witness (older woman, rust headscarf)", isMale: false },
  { slug: "crowd-stern-man", characterName: "Crowd witness (stern man, spokesperson)", isMale: true },
  { slug: "crowd-young-man", characterName: "Crowd witness (young man)", isMale: true },
  { slug: "crowd-young-woman", characterName: "Crowd witness (young woman)", isMale: false }
];

const MALE_CORRECTION =
  "Add a PLAIN outer mantle/cloak -- an unstitched rectangular sheet of undyed or naturally-toned wool, wrapped " +
  "over one shoulder or around the body, with NO decoration, NO dye pattern, NO clavi, NO corner motif. Add " +
  "simple, minimal, undyed wool tassels (tzitzit) tied at each of its four corners -- thin plain cords, not " +
  "decorative tassels. Belt the tunic with a plain cord or narrow strap.";

const FEMALE_CORRECTION =
  "Add a PLAIN outer wrap or veil -- an unstitched rectangular sheet of undyed or naturally-toned wool or linen, " +
  "draped over the head and shoulders for public modesty, with NO decoration, NO dye pattern, NO trim. Do NOT " +
  "add tassels -- those were a male-only garment requirement. Belt the tunic with a plain cord or narrow strap " +
  "if not already belted.";

const SHARED_CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same hairstyle, same " +
  "identity, same six-panel layout and poses. Additionally, make sure across all panels:\n" +
  "1. The tunic's neck opening is a plain straight or slightly curved slit -- no tailored keyhole, V-notch, or " +
  "modern placket.\n" +
  "2. There are no modern vertical side-slits in the tunic hem -- the tunic is a simple closed rectangular " +
  "garment, sewn or woven straight down the sides.\n" +
  "3. Sleeves are simple and wide, formed by the tunic's own loom width -- not tailored set-in sleeves with " +
  "curved armhole seams.\n" +
  "4. Sandals are flat leather soles with simple straps -- no modern buckles or hardware.\n" +
  "Photorealistic, same neutral studio background and lighting as the original. No text, no labels, no logos " +
  "anywhere in the image.";

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
  if (requestedSlug && targets.length === 0) {
    throw new Error(`No target with slug "${requestedSlug}". Known slugs: ${TARGETS.map((t) => t.slug).join(", ")}`);
  }

  for (const target of targets) {
    console.log(`Generating (round 2): ${target.characterName}...`);
    try {
      const round1Buf = await readFile(path.join(CANDIDATES_DIR, `${target.slug}-fix.png`));

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `This is the current candidate design for "${target.characterName}" -- refine it further as instructed below.` },
        { inlineData: { mimeType: "image/png", data: round1Buf.toString("base64") } },
        { text: (target.isMale ? MALE_CORRECTION : FEMALE_CORRECTION) + "\n" + SHARED_CORRECTION }
      ];

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-fix-r2.png`);
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
