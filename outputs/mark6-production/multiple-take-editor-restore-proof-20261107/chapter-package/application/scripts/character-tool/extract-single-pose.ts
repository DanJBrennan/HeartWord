/**
 * Extracts a single clean full-body standing pose from each crowd
 * witness's and scribe's multi-panel "turnaround" reference sheet --
 * built 2026-09-08 after attaching several busy 6-panel turnaround
 * sheets as shot references produced collage-fragment artifacts in
 * generated shots (a piece of the sheet's own panel layout bleeding into
 * the output) and appeared to distract the model's attention from the
 * rest of the shot prompt (architecture kept drifting even when
 * explicitly, repeatedly specified).
 *
 * This does NOT change any character's design -- it's a crop/clean-up of
 * the existing front-view panel into its own single-subject image on a
 * plain studio background, saved as a new 'body_pose' asset alongside
 * the existing 'turnaround' asset (which stays, for human reference).
 * loadCharacterReferenceImages() (src/providers/gemini/index.ts) now
 * prefers 'body_pose' over 'turnaround' whenever both exist for a
 * character, so this alone should stop turnaround sheets from being used
 * as shot-generation reference images going forward.
 *
 * Added directly to each character's CURRENT approved character_version
 * (no new version/promotion) since this doesn't alter the character's
 * approved design, only supplies a cleaner reference asset for the same
 * design.
 *
 * Run: npx tsx scripts/character-tool/extract-single-pose.ts
 * Or one character: pass its slug, e.g. `crowd-elder-grey-beard`.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();

interface CharacterTarget {
  slug: string;
  characterName: string;
}

const TARGETS: CharacterTarget[] = [
  { slug: "crowd-elder-grey-beard", characterName: "Crowd witness (elder, grey beard)" },
  { slug: "crowd-man-headwrap", characterName: "Crowd witness (man, headwrap)" },
  { slug: "crowd-older-woman-cream", characterName: "Crowd witness (older woman, cream headscarf)" },
  { slug: "crowd-older-woman-rust", characterName: "Crowd witness (older woman, rust headscarf)" },
  { slug: "crowd-stern-man", characterName: "Crowd witness (stern man, spokesperson)" },
  { slug: "crowd-woman-with-child", characterName: "Crowd witness (woman with child)" },
  { slug: "crowd-young-man", characterName: "Crowd witness (young man)" },
  { slug: "crowd-young-woman", characterName: "Crowd witness (young woman)" },
  { slug: "principal-scribe", characterName: "Principal scribe" },
  { slug: "scribe-middleaged-tablet", characterName: "Scribe (middle-aged, tablet-bearer)" },
  { slug: "scribe-older-stout", characterName: "Scribe (older, stout)" },
  { slug: "scribe-younger-lean", characterName: "Scribe (younger, lean)" }
];

const CORRECTION =
  "This image is a multi-panel character reference SHEET (several views/poses of the same person composited " +
  "together). Extract and recreate ONLY the single front-facing, full-body standing pose (top-left panel, or the " +
  "clearest full-body front view) as ONE clean standalone image -- same exact person, same exact face, garment, " +
  "colors, and details as that panel. Remove all other panels entirely. Output a single photorealistic full-body " +
  "portrait on a plain neutral studio background, standing, facing camera, soft even studio lighting -- not a " +
  "grid, not a collage, not multiple views. No text, no labels, no logos anywhere in the image.";

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
  const requestedSlug = process.argv[2];
  const targets = requestedSlug ? TARGETS.filter((t) => t.slug === requestedSlug) : TARGETS;
  if (requestedSlug && targets.length === 0) {
    throw new Error(`No target with slug "${requestedSlug}". Known slugs: ${TARGETS.map((t) => t.slug).join(", ")}`);
  }

  const db = getDb();

  for (const target of targets) {
    console.log(`Extracting single pose: ${target.characterName}...`);
    try {
      const cv = db
        .prepare(
          `SELECT cv.id, cv.character_id FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
           WHERE c.name = ?`
        )
        .get(target.characterName) as { id: string; character_id: string } | undefined;
      if (!cv) throw new Error(`No approved character_version found for "${target.characterName}"`);

      const turnaroundAsset = db
        .prepare(`SELECT path FROM character_assets WHERE character_version_id = ? AND category = 'turnaround' LIMIT 1`)
        .get(cv.id) as { path: string } | undefined;
      if (!turnaroundAsset) throw new Error(`No turnaround asset found for "${target.characterName}"`);

      const turnaroundBuf = await readFile(path.join(dataDir, "assets", turnaroundAsset.path));

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `This is the current canon turnaround sheet for "${target.characterName}".` },
        { inlineData: { mimeType: "image/png", data: turnaroundBuf.toString("base64") } },
        { text: CORRECTION }
      ];

      const imageBuffer = await generateImage(parts);

      const relPath = path.join("characters", target.slug, "body_pose", "motion-neutral-standing-v1.png");
      const absPath = path.join(dataDir, "assets", relPath);
      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, imageBuffer);

      db.prepare(
        `INSERT INTO character_assets (id, character_version_id, category, path, content_hash, imported_from, created_at)
         VALUES (?, ?, 'body_pose', ?, NULL, NULL, ?)`
      ).run(randomUUID(), cv.id, relPath.replace(/\\/g, "/"), Date.now());

      console.log(`  -> saved and registered ${relPath} (${imageBuffer.byteLength} bytes)`);
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
