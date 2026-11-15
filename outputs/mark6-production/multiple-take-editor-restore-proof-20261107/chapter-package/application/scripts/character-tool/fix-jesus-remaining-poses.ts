/**
 * Corrects Jesus's remaining pre-fix pose assets (walking, teaching,
 * seated-listening) to match the promoted v3 garment design
 * (fix-jesus-round7.ts), same rationale as fix-jesus-headshot.ts: these
 * are still fed to loadCharacterReferenceImages() as body_pose
 * references and still show the old embroidered-collar coat-lapel
 * garment, which would keep biasing future Nano Banana generations back
 * toward the pre-fix look. The motion-neutral-standing pose and headshot
 * are already corrected -- this finishes the remaining three.
 *
 * Keeps each pose's exact action/composition -- only the garment is
 * corrected to match the v3 reference (plain fabric, no embroidered
 * trim, draped mantle, narrower belt, worn/frayed edges, tassels).
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-remaining-poses.ts
 * Or one pose: pass its slug, e.g. `walking`.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

interface PoseTarget {
  slug: string;
  currentFile: string;
  poseDescription: string;
}

const TARGETS: PoseTarget[] = [
  {
    slug: "walking",
    currentFile: "motion-walking-v1.png",
    poseDescription:
      "a mid-stride WALKING gait -- legs apart with one foot forward and one back, weight shifted forward, " +
      "natural arm-swing counter to the legs, body leaning slightly into the stride. This must NOT look like a " +
      "static standing pose with feet together or side by side."
  },
  {
    slug: "teaching",
    currentFile: "motion-teaching-v1.png",
    poseDescription:
      "an animated TEACHING gesture -- both arms raised and extended outward from the body at roughly waist-to-" +
      "chest height, palms open, mid-speech expression. This must NOT look like a static standing pose with both " +
      "arms down or hands clasped in front of the body."
  },
  {
    slug: "seated-listening",
    currentFile: "motion-seated-listening-v1.png",
    poseDescription:
      "SEATED on the stone bench -- the figure's weight is fully supported by the bench, knees bent at roughly " +
      "90 degrees, both hands resting on the knees, torso upright. The stone bench must remain clearly visible " +
      "under and around the figure. This must NOT be changed to a standing pose -- the figure must stay seated."
  }
];

const CORRECTION_HEADER =
  "The single most important instruction in this whole request: PRESERVE THE POSE EXACTLY. The FIRST image shows ";

const CORRECTION_FOOTER =
  " Keep this exact pose, body position, and camera framing from the FIRST image -- changing the pose to a " +
  "generic standing position is a failure of this task, even if the garment and hair are correct. Make only " +
  "these two corrections on top of that unchanged pose:\n" +
  "1. GARMENT: correct the garment to match the SECOND image's corrected design -- the same plain natural-fiber " +
  "fabric with no embroidered trim or patterned collar band, the same draped mantle (unstitched rectangular " +
  "cloth wrapped over one shoulder, not a tailored coat) with visible knotted tassels at its corners and a small " +
  "corner motif, the same narrower tied belt, the same subtle worn/frayed hem edges, and the same tunic with its " +
  "two vertical stripes (clavi). Adapt this garment naturally to the FIRST image's own pose (e.g. how the mantle " +
  "falls if the arm is raised or the figure is seated) -- do not copy the second image's standing posture.\n" +
  "2. HAIR: the FIRST image's hairstyle (long, tight ringlet curls reaching the chest) does not match this " +
  "character's canon appearance. Replace it with the shorter, looser, shoulder-length wavy hairstyle shown in " +
  "the THIRD reference image (the canon headshot) -- same hair length and curl pattern as that headshot, adapted " +
  "naturally to this pose's head angle. Keep the same face, beard, and skin tone as the FIRST image.\n" +
  "Photorealistic. No text, no labels, no logos anywhere in the image.";

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

  const correctedBodyBuf = await readFile(
    path.join(dataDir, "assets", "characters", "jesus", "motion", "motion-neutral-standing-v3.png")
  );
  const headshotBuf = await readFile(
    path.join(dataDir, "assets", "characters", "jesus", "lip_sync_closeup", "close-up-neutral-v3.png")
  );

  for (const target of targets) {
    console.log(`Generating corrected pose: ${target.slug}...`);
    try {
      const currentPoseBuf = await readFile(path.join(dataDir, "assets", "characters", "jesus", "motion", target.currentFile));

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: "FIRST image -- current pose (keep this exact pose, action, and framing)." },
        { inlineData: { mimeType: "image/png", data: currentPoseBuf.toString("base64") } },
        { text: "SECOND image -- corrected canon body reference (copy its garment design only, NOT its standing pose)." },
        { inlineData: { mimeType: "image/png", data: correctedBodyBuf.toString("base64") } },
        { text: "THIRD image -- canon headshot (copy its hairstyle only -- shorter, looser waves)." },
        { inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } },
        { text: CORRECTION_HEADER + target.poseDescription + CORRECTION_FOOTER }
      ];

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(OUTPUT_DIR, `jesus-${target.slug}-fix.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
