/**
 * Round 2 for the 3 scribes still severe after round 1
 * (fix-remaining-canon-round1.ts): Principal scribe, Scribe (middle-
 * aged, tablet-bearer), Scribe (younger, lean). Scribe (older, stout)
 * already passed clean and is excluded.
 *
 * Round 1's full-male correction got tassels and gammadia present, but
 * the Critic's re-review (2026-09-07) found the outer garment still
 * reads as a tailored, sewn coat/cardigan rather than a genuine
 * unstitched draped mantle, the solid black/charcoal dye is historically
 * implausible (black wool dye was difficult and rare in the period --
 * this predates today's session, an existing canon color choice), and
 * tunic clavi are missing or inconsistently placed. Scribe (younger,
 * lean) also has an anachronistic Bedouin-style agal head-rope.
 *
 * Refines FROM round 1.
 *
 * Run: npx tsx scripts/character-tool/fix-scribes-round2.ts
 * Or one character: pass its slug, e.g. `principal-scribe`.
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
  extraNote?: string;
}

const TARGETS: CharacterTarget[] = [
  { slug: "principal-scribe", characterName: "Principal scribe" },
  { slug: "scribe-middleaged-tablet", characterName: "Scribe (middle-aged, tablet-bearer)" },
  {
    slug: "scribe-younger-lean",
    characterName: "Scribe (younger, lean)",
    extraNote:
      "Additionally: replace the Bedouin-style head rope (agal) holding down the headscarf -- that specific " +
      "device did not exist in first-century Judea. Instead, either go bareheaded, or wrap a simple cloth " +
      "head covering (sudra) without any rope ring."
  }
];

const CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same hairstyle, same " +
  "identity, same panel layout and poses. Make these fixes, consistently across all panels:\n" +
  "1. GARMENT CONSTRUCTION: rebuild the outer garment as a genuine unstitched rectangular sheet of cloth, " +
  "wrapped over one shoulder or around the body -- it currently reads as a tailored, sewn coat/cardigan with " +
  "set-in sleeves and side vents, which is incorrect. Keep the tassels and any corner motif at the mantle's " +
  "actual four corners.\n" +
  "2. COLOR: change the solid black/charcoal dye to a natural, undyed off-white or cream wool base -- solid " +
  "black dye was rare and difficult to produce in this period. Move this character's distinguishing color onto " +
  "the tunic's clavi stripes and/or the mantle's corner motif instead of dyeing the whole garment.\n" +
  "3. TUNIC CLAVI: give the tunic two symmetric vertical stripes, one descending from each shoulder, in a " +
  "natural dye (madder red, dark reddish-purple, or indigo).\n" +
  "4. SLEEVES: if the tunic has narrow, tailored, wrist-length fitted sleeves, change them to wide sleeves " +
  "formed naturally by the tunic's own loom width, ending above or at the elbow.\n" +
  "5. TUNIC LENGTH: if ankle-length, shorten to knee or mid-calf length.\n" +
  "6. SANDALS: flat leather soles with simple straps -- no modern buckles or thick molded soles.\n" +
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
        { text: CORRECTION + (target.extraNote ? `\n${target.extraNote}` : "") }
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
