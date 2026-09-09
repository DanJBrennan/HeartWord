/**
 * Round 3 for the 3 scribes whose round-2 fix (fix-scribes-round2.ts)
 * corrected color to off-white per the Critic's historical-accuracy
 * finding (solid black dye was rare/costly in the period). Per Dan's
 * explicit call 2026-09-07, that's overridden here: black stays as a
 * deliberate STORYTELLING/visual-identity choice for this canon, not a
 * historical claim -- keep everything else round 2 fixed (unstitched
 * draped mantle, tassels, clavi placement, symmetric stripes, sandals,
 * neckline, sleeves), just revert the base fabric color to black/
 * charcoal, with tassels and any clavi/corner motifs kept in a visibly
 * contrasting tone so the construction details Dan cares about stay
 * legible against the dark fabric.
 *
 * Scribe (older, stout) already used a muted charcoal-grey and passed
 * the Critic clean without any color change -- excluded here, no
 * action needed.
 *
 * Run: npx tsx scripts/character-tool/fix-scribes-round3-black.ts
 * Or one character: pass its slug, e.g. `principal-scribe`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

const TARGETS = [
  { slug: "principal-scribe", characterName: "Principal scribe" },
  { slug: "scribe-middleaged-tablet", characterName: "Scribe (middle-aged, tablet-bearer)" },
  { slug: "scribe-younger-lean", characterName: "Scribe (younger, lean)" }
];

const CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same hairstyle, same " +
  "identity, same panel layout and poses. Keep the exact same garment CONSTRUCTION as this image: the unstitched " +
  "draped mantle, the tassels at its corners, any corner motif, the tunic's clavi stripes, the sleeves, " +
  "neckline, and sandals -- change ONLY the color: dye the tunic and mantle a deep black/charcoal black, as a " +
  "deliberate visual design choice for this character (not a historical claim). Keep the tassels in an off-" +
  "white/undyed grey wool so they stay visible against the black fabric, and keep any clavi stripes or corner " +
  "motifs in a slightly different dark tone (deep grey, dark red, or dark purple) so their shape still reads " +
  "against the black base -- do not make the whole garment a single flat undifferentiated black with no visible " +
  "detail. Photorealistic, same neutral studio background and lighting as the original. No text, no labels, no " +
  "logos anywhere in the image.";

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
    console.log(`Generating (round 3, black): ${target.characterName}...`);
    try {
      const round2Buf = await readFile(path.join(CANDIDATES_DIR, `${target.slug}-fix-r2.png`));

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `This is the current candidate design for "${target.characterName}" -- apply the color change instructed below.` },
        { inlineData: { mimeType: "image/png", data: round2Buf.toString("base64") } },
        { text: CORRECTION }
      ];

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(CANDIDATES_DIR, `${target.slug}-fix-r3-black.png`);
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
