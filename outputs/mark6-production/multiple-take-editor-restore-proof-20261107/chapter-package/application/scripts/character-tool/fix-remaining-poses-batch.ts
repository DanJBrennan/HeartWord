/**
 * Generalizes fix-jesus-headshot.ts + fix-jesus-remaining-poses.ts (round
 * 2, the pose-preserving version) to the other 10 already-promoted
 * garment-fix characters: Peter, Philip, Bartholomew, Simon the Zealot,
 * James son of Alphaeus, Andrew, Matthew, James son of Zebedee, Judas
 * Iscariot, Thaddaeus (Jude). Each still has its pre-fix headshot and
 * three motion poses (walking/teaching/seated-listening) -- only their
 * motion-neutral-standing pose was corrected when promoted -- built
 * 2026-09-07 at Dan's request to finish the same cross-pose consistency
 * pass already done for Jesus.
 *
 * Same lesson learned from Jesus's round: pose preservation must be
 * stated as the single most important instruction, ahead of the garment/
 * hair corrections, or the model drifts toward a generic standing
 * composition close to the body reference image.
 *
 * KNOWN SPECIAL CASE: Peter's existing walking/teaching/seated-listening
 * poses are rendered in a different, illustrated/painted style, not the
 * photorealistic style the rest of the canon (and Peter's own headshot)
 * use. This script asks for "photorealistic" output regardless, which
 * should correct that too, but it's worth a visual double-check for
 * Peter specifically.
 *
 * Run: npx tsx scripts/character-tool/fix-remaining-poses-batch.ts
 * Or one character: npx tsx scripts/character-tool/fix-remaining-poses-batch.ts peter
 * Or one character+asset: npx tsx scripts/character-tool/fix-remaining-poses-batch.ts peter headshot
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix");

interface CharacterConfig {
  slug: string;
  name: string;
  headshotFile: string; // filename within characters/<slug>/lip_sync_closeup/
  standingFile: string; // filename within characters/<slug>/motion/ (already garment-corrected)
}

const CHARACTERS: CharacterConfig[] = [
  { slug: "peter", name: "Peter", headshotFile: "close-up-neutral-v2.png", standingFile: "motion-neutral-standing-v3.png" },
  { slug: "philip-the-apostle", name: "Philip the Apostle", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "bartholomew", name: "Bartholomew", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "simon-the-zealot", name: "Simon the Zealot", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "james-son-of-alphaeus", name: "James son of Alphaeus", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "andrew", name: "Andrew", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "matthew", name: "Matthew (Levi)", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "james-son-of-zebedee", name: "James son of Zebedee", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "judas-iscariot", name: "Judas Iscariot", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "thaddaeus-jude", name: "Thaddaeus (Jude)", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "john-son-of-zebedee", name: "John son of Zebedee", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" },
  { slug: "thomas", name: "Thomas", headshotFile: "close-up-neutral-v1.png", standingFile: "motion-neutral-standing-v2.png" }
];

const HEADSHOT_CORRECTION =
  "Keep this EXACT same close-up crop, framing, face, expression, and hair as the FIRST image -- do not change " +
  "the pose, angle, or identity in any way. The only change: correct the visible garment near the collar and " +
  "shoulders to match the SECOND image's corrected design -- plain natural fabric with no embroidered trim, no " +
  "patterned collar band, no tailored coat-lapel shape. Show the same draped, plain-edged mantle fabric and " +
  "tunic neckline visible in the second image, in the same colors, adapted naturally to this close-up framing. " +
  "Photorealistic, neutral studio background matching the first image. No text, no labels, no logos anywhere in " +
  "the image.";

interface PoseTarget {
  slug: string;
  currentFile: string;
  poseDescription: string;
}

const POSES: PoseTarget[] = [
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
      "an animated TEACHING gesture -- one or both arms raised and extended outward from the body, palm(s) open, " +
      "mid-speech expression. This must NOT look like a static standing pose with both arms down or hands " +
      "clasped in front of the body."
  },
  {
    slug: "seated-listening",
    currentFile: "motion-seated-listening-v1.png",
    poseDescription:
      "SEATED on a bench or stone seat -- the figure's weight is fully supported by the seat, knees bent at " +
      "roughly 90 degrees, torso upright. The seat must remain clearly visible under and around the figure. " +
      "This must NOT be changed to a standing pose -- the figure must stay seated."
  }
];

const POSE_CORRECTION_HEADER =
  "The single most important instruction in this whole request: PRESERVE THE POSE EXACTLY. The FIRST image shows ";

const POSE_CORRECTION_FOOTER =
  " Keep this exact pose, body position, and camera framing from the FIRST image -- changing the pose to a " +
  "generic standing position is a failure of this task, even if the garment and hair are correct. Make only " +
  "these two corrections on top of that unchanged pose:\n" +
  "1. GARMENT: correct the garment to match the SECOND image's corrected design -- the same plain natural-fiber " +
  "fabric with no embroidered trim or patterned collar band, the same draped mantle (unstitched rectangular " +
  "cloth wrapped over one shoulder, not a tailored coat) with any tassels/corner motifs it shows, the same belt " +
  "style, and the same tunic detailing. Adapt this garment naturally to the FIRST image's own pose -- do not " +
  "copy the second image's standing posture.\n" +
  "2. FACE/HAIR CONSISTENCY: match this character's hairstyle, beard, and face exactly to the THIRD reference " +
  "image (the canon headshot) -- same hair length and style as that headshot, adapted naturally to this pose's " +
  "head angle, even if the FIRST image's hair or rendering style currently differs.\n" +
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

async function fixHeadshot(char: CharacterConfig): Promise<void> {
  console.log(`  [${char.name}] headshot...`);
  const headshotBuf = await readFile(
    path.join(dataDir, "assets", "characters", char.slug, "lip_sync_closeup", char.headshotFile)
  );
  const standingBuf = await readFile(path.join(dataDir, "assets", "characters", char.slug, "motion", char.standingFile));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "FIRST image -- current headshot (keep this exact framing, face, and pose)." },
    { inlineData: { mimeType: "image/png", data: headshotBuf.toString("base64") } },
    { text: "SECOND image -- corrected canon body reference (copy its garment/collar design only)." },
    { inlineData: { mimeType: "image/png", data: standingBuf.toString("base64") } },
    { text: HEADSHOT_CORRECTION }
  ];

  const imageBuffer = await generateImage(parts);
  const outPath = path.join(OUTPUT_DIR, `${char.slug}-headshot-fix.png`);
  await writeFile(outPath, imageBuffer);
  console.log(`    -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

async function fixPose(char: CharacterConfig, pose: PoseTarget, correctedHeadshotBuf: Buffer): Promise<void> {
  console.log(`  [${char.name}] ${pose.slug}...`);
  const standingBuf = await readFile(path.join(dataDir, "assets", "characters", char.slug, "motion", char.standingFile));
  const currentPoseBuf = await readFile(path.join(dataDir, "assets", "characters", char.slug, "motion", pose.currentFile));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "FIRST image -- current pose (keep this exact pose, action, and framing)." },
    { inlineData: { mimeType: "image/png", data: currentPoseBuf.toString("base64") } },
    { text: "SECOND image -- corrected canon body reference (copy its garment design only, NOT its standing pose)." },
    { inlineData: { mimeType: "image/png", data: standingBuf.toString("base64") } },
    { text: "THIRD image -- canon headshot (copy its hairstyle/face only)." },
    { inlineData: { mimeType: "image/png", data: correctedHeadshotBuf.toString("base64") } },
    { text: POSE_CORRECTION_HEADER + pose.poseDescription + POSE_CORRECTION_FOOTER }
  ];

  const imageBuffer = await generateImage(parts);
  const outPath = path.join(OUTPUT_DIR, `${char.slug}-${pose.slug}-fix.png`);
  await writeFile(outPath, imageBuffer);
  console.log(`    -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

async function main() {
  const requestedSlug = process.argv[2];
  const requestedAsset = process.argv[3]; // "headshot" | "walking" | "teaching" | "seated-listening"
  const characters = requestedSlug ? CHARACTERS.filter((c) => c.slug === requestedSlug) : CHARACTERS;
  if (requestedSlug && characters.length === 0) {
    throw new Error(`No character with slug "${requestedSlug}". Known slugs: ${CHARACTERS.map((c) => c.slug).join(", ")}`);
  }

  for (const char of characters) {
    console.log(`\n=== ${char.name} ===`);
    try {
      if (!requestedAsset || requestedAsset === "headshot") {
        await fixHeadshot(char);
      }
      // Use the JUST-CORRECTED headshot (not the pre-fix one) as the face/hair reference for poses.
      const correctedHeadshotPath = path.join(OUTPUT_DIR, `${char.slug}-headshot-fix.png`);
      const correctedHeadshotBuf = await readFile(correctedHeadshotPath);

      const posesToRun = requestedAsset && requestedAsset !== "headshot" ? POSES.filter((p) => p.slug === requestedAsset) : POSES;
      for (const pose of posesToRun) {
        await fixPose(char, pose, correctedHeadshotBuf);
      }
    } catch (err) {
      console.error(`  FAILED for ${char.name}: ${(err as Error).message}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
