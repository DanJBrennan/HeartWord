/**
 * Corrects Jesus's lip-sync headshot's visible garment to match the
 * promoted v3 body reference (fix-jesus-round7.ts) -- built 2026-09-07
 * after Dan asked whether the headshot needed updating too: the close-up
 * crop shows a lot of collar/shoulder fabric, and it still had the old
 * embroidered collar trim and coat-lapel shape the Critic's canon garment
 * audit flagged, which would keep biasing future Nano Banana generations
 * back toward the pre-fix garment since this headshot is one of the two
 * reference images loadCharacterReferenceImages() feeds into every shot.
 *
 * Not a new pose -- keeps the EXACT same close-up framing, face, and
 * expression as the current headshot, only the visible garment near the
 * collar/shoulders is corrected to match the v3 body reference (plain
 * fabric, no embroidered trim, draped mantle instead of a coat lapel).
 *
 * Run: npx tsx scripts/character-tool/fix-jesus-headshot.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();

const CORRECTION =
  "Keep this EXACT same close-up crop, framing, face, expression, and hair as the FIRST image -- do not change " +
  "the pose, angle, or identity in any way. The only change: correct the visible garment near the collar and " +
  "shoulders to match the SECOND image's corrected design -- plain natural fabric with no embroidered trim, no " +
  "patterned collar band, no tailored coat-lapel shape. Instead show the same draped, plain-edged mantle fabric " +
  "and tunic neckline visible in the second image, in the same colors. Photorealistic, neutral grey studio " +
  "background matching the first image. No text, no labels, no logos anywhere in the image.";

async function generateImage(parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } }
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
  const currentHeadshotBuf = await readFile(
    path.join(dataDir, "assets", "characters", "jesus", "lip_sync_closeup", "close-up-neutral-v2.png")
  );
  const correctedBodyBuf = await readFile(
    path.join(dataDir, "assets", "characters", "jesus", "motion", "motion-neutral-standing-v3.png")
  );

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: "FIRST image -- current headshot (keep this exact framing, face, and pose)." },
    { inlineData: { mimeType: "image/png", data: currentHeadshotBuf.toString("base64") } },
    { text: "SECOND image -- corrected canon body reference (copy its garment/collar design only)." },
    { inlineData: { mimeType: "image/png", data: correctedBodyBuf.toString("base64") } },
    { text: CORRECTION }
  ];

  console.log("Generating corrected headshot for Jesus...");
  const imageBuffer = await generateImage(parts);
  const outPath = path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix", "jesus-headshot-fix.png");
  await writeFile(outPath, imageBuffer);
  console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
