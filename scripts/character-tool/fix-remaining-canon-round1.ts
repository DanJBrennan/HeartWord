/**
 * Round 1 garment-fix for the remaining approved canon characters not
 * yet touched by the Critic garment audit's correction pass (2026-09-07):
 * the 8 Mark 2 crowd witnesses and the healed paralytic (light-touch
 * correction) plus the 4 scribes (fuller correction). All 30 approved
 * canon characters were originally audited the same day; Jesus and the
 * Twelve have already been corrected and promoted (see fix-jesus-twelve-
 * garments*.ts and its many rounds).
 *
 * Friend 1-4 (the men who carry the paralytic) are DELIBERATELY EXCLUDED
 * per Dan's explicit call, 2026-09-07: a first attempt at "correcting"
 * Friend 1 added a clavus stripe to his tunic, which actually moved him
 * AWAY from historical accuracy -- a poor Galilean day-laborer most
 * plausibly wore plain, unadorned wool with no decorative stripes at
 * all, since clavi generally signaled at least modest means. His plain
 * short tunic, bare outer garment, and simple rope belt were already
 * appropriate to an actively-working poor man; "upgrading" his dress to
 * match Jesus/the Twelve's standard was the wrong instinct. Leave the
 * Friends as they are.
 *
 * This script now applies TWO different correction levels depending on
 * social station, per that same lesson:
 * - FULL correction (scribes): tassels are actually MORE mandated for
 *   them specifically -- Matthew 23:5 singles out scribes/Pharisees for
 *   wearing conspicuously long tassels -- plus ornamentation (clavi,
 *   corner motifs) appropriate to a literate, socially established role.
 * - LIGHT-TOUCH correction (crowd witnesses, the paralytic): fix ONLY
 *   clear, unambiguous anachronisms -- modern-looking pinked/scalloped
 *   machine-finished trim, obvious modern belt hardware, and modern
 *   sandal construction (flip-flops, gladiator lacing, contoured comfort
 *   footbeds). Do NOT add tassels, clavi, or an outer mantle where none
 *   exists -- plainness is the historically correct look for people of
 *   modest or poor means, and forcing decoration onto them is itself a
 *   historical error, not a fix.
 *
 * These characters use a different asset shape than the Twelve: a single
 * six-panel "turnaround" sheet (front/side/back/headshot/two action
 * poses) instead of separate headshot + motion-pose files. This script
 * regenerates that whole sheet in one call per character, since Nano
 * Banana Pro produced the original sheets the same way and should be
 * able to keep the six panels internally consistent.
 *
 * Run: npx tsx scripts/character-tool/fix-remaining-canon-round1.ts
 * Or one character: pass its slug, e.g. `principal-scribe`.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../../src/db/client.js";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image"; // Nano Banana Pro

const dataDir = getDataDir();
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

type CorrectionLevel = "full-male" | "full-female" | "light-touch";

interface CharacterTarget {
  slug: string;
  characterName: string;
  turnaroundPath: string;
  level: CorrectionLevel;
}

const TARGETS: CharacterTarget[] = [
  { slug: "crowd-elder-grey-beard", characterName: "Crowd witness (elder, grey beard)", turnaroundPath: "characters/mark-crowd-elder-grey-beard/turnaround/hatam-crowd-elder-grey-beard-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-man-headwrap", characterName: "Crowd witness (man, headwrap)", turnaroundPath: "characters/mark-crowd-man-headwrap/turnaround/hatam-crowd-man-headwrap-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-older-woman-cream", characterName: "Crowd witness (older woman, cream headscarf)", turnaroundPath: "characters/mark-crowd-older-woman-cream/turnaround/hatam-crowd-older-woman-cream-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-older-woman-rust", characterName: "Crowd witness (older woman, rust headscarf)", turnaroundPath: "characters/mark-crowd-older-woman-rust/turnaround/hatam-crowd-older-woman-rust-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-stern-man", characterName: "Crowd witness (stern man, spokesperson)", turnaroundPath: "characters/mark-crowd-stern-man/turnaround/hatam-crowd-stern-man-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-woman-with-child", characterName: "Crowd witness (woman with child)", turnaroundPath: "characters/mark-crowd-woman-with-child/turnaround/hatam-crowd-woman-with-child-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-young-man", characterName: "Crowd witness (young man)", turnaroundPath: "characters/mark-crowd-young-man/turnaround/hatam-crowd-young-man-video-canon-v1.png", level: "light-touch" },
  { slug: "crowd-young-woman", characterName: "Crowd witness (young woman)", turnaroundPath: "characters/mark-crowd-young-woman/turnaround/hatam-crowd-young-woman-video-canon-v1.png", level: "light-touch" },
  { slug: "paralytic", characterName: "Healed paralytic", turnaroundPath: "characters/mark-2-paralytic/turnaround/hatam-paralytic-video-canon-v1.png", level: "light-touch" },
  { slug: "principal-scribe", characterName: "Principal scribe", turnaroundPath: "characters/mark-2-principal-scribe/turnaround/hatam-principal-scribe-video-canon-v1.png", level: "full-male" },
  { slug: "scribe-middleaged-tablet", characterName: "Scribe (middle-aged, tablet-bearer)", turnaroundPath: "characters/mark-scribe-middleaged-tablet/turnaround/hatam-scribe-middleaged-tablet-video-canon-v1.png", level: "full-male" },
  { slug: "scribe-older-stout", characterName: "Scribe (older, stout)", turnaroundPath: "characters/mark-scribe-older-stout/turnaround/hatam-scribe-older-stout-video-canon-v1.png", level: "full-male" },
  { slug: "scribe-younger-lean", characterName: "Scribe (younger, lean)", turnaroundPath: "characters/mark-scribe-younger-lean/turnaround/hatam-scribe-younger-lean-video-canon-v1.png", level: "full-male" }
];

const FULL_MALE_CORRECTION =
  "This is an adult man in an established social role (a scribe/religious scholar). If he wears an outer " +
  "mantle/cloak, add visible knotted wool tassels (tzitzit) at its four corners -- thin cords tied in a small " +
  "knot, not decorative pom-poms; per Matthew 23:5, scribes specifically wore conspicuously long tassels, so " +
  "these may be a bit longer than an ordinary man's. If a corner motif is present, keep it small and corner-" +
  "only (a small L-shaped or notched-bar mark), never a continuous border running the whole edge. It is " +
  "appropriate for this character to have modest ornamentation (e.g. two symmetric woven clavi stripes on the " +
  "tunic) reflecting his literate, socially established station. ";

const LIGHT_TOUCH_CORRECTION =
  "This character is of modest or poor means (an ordinary crowd member, or a sick man carried on a mat). Do NOT " +
  "add tassels, clavi stripes, or an outer mantle where none currently exists -- plain, unadorned, undyed or " +
  "simply-dyed wool is the historically correct look for someone of this station, and adding decoration would " +
  "be a step AWAY from accuracy, not toward it. Fix ONLY clear, unambiguous modern anachronisms: ";

const SHARED_CORRECTION =
  "Keep this EXACT same person in every panel -- same face, same skin tone, same build, same hairstyle, same " +
  "identity, same six-panel layout and poses. Correct these historical costume issues, consistently across all " +
  "panels, wherever they actually appear on this character:\n" +
  "1. TRIM: replace any modern-looking pinked/scalloped/machine-finished decorative edging with a plain hem.\n" +
  "2. GARMENT CONSTRUCTION: if there IS an outer mantle/cloak, it should be a genuine unstitched rectangular " +
  "sheet of cloth wrapped over one shoulder or around the body -- not a tailored coat, cape, or vest with sewn " +
  "armholes.\n" +
  "3. BELT: replace any belt with visible modern metal buckle/hardware with a narrow tied cord, thin leather " +
  "strap, or simple rope -- appropriate to this person's station.\n" +
  "4. NECKLINE: the tunic's neck opening should be a plain straight or slightly curved slit, not a tailored " +
  "keyhole, V-notch, or ribbed crew-neck collar.\n" +
  "5. SANDALS/FOOTWEAR: flat leather soles with simple straps across the foot and at most one loop at the ankle " +
  "-- no modern flip-flop toe-post as the only strap, no high leg-wrapping laces, no contoured comfort-sandal " +
  "footbeds.\n" +
  "6. FABRIC: prefer natural, slightly irregular dye tones over bright, uniform, saturated modern-looking " +
  "colors.\n" +
  "Photorealistic, same neutral studio background and lighting as the original. No text, no labels, no logos " +
  "anywhere in the image.";

function correctionFor(level: CorrectionLevel): string {
  if (level === "full-male") return FULL_MALE_CORRECTION + SHARED_CORRECTION;
  if (level === "full-female") return SHARED_CORRECTION; // reserved, unused currently
  return LIGHT_TOUCH_CORRECTION + SHARED_CORRECTION;
}

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

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const target of targets) {
    console.log(`Generating: ${target.characterName} (${target.level})...`);
    try {
      const turnaroundBuf = await readFile(path.join(dataDir, "assets", target.turnaroundPath));

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `This is the current canon turnaround sheet for "${target.characterName}" -- correct it as instructed below.` },
        { inlineData: { mimeType: "image/png", data: turnaroundBuf.toString("base64") } },
        { text: correctionFor(target.level) }
      ];

      const imageBuffer = await generateImage(parts);
      const outPath = path.join(OUTPUT_DIR, `${target.slug}-fix.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. These are candidates only -- review before promoting any to canon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
