/**
 * One-off script: generate 4 candidate character-design images for the
 * "Mark Pharisees and Scribes" character_group (see
 * docs/design/canonical-characters.md's "Character Groups" section). The
 * group currently has only 1 of its required 4+ distinct member designs
 * (the Principal scribe, already canon and the group's spokesperson) --
 * this generates candidates for 4 *additional* members, bringing the group
 * to 5 total once reviewed and promoted, comfortably past the 4+ minimum.
 *
 * These are candidates, not canon: per canonical-characters.md's "Evolving
 * a Character Without Losing Continuity" workflow, a generated candidate
 * sits alongside existing canon for side-by-side review and is only
 * promoted (a character_groups member row created, a character_versions
 * row set to "approved") once Dan reviews it. This script does not touch
 * the database.
 *
 * Uses Nano Banana (Gemini's gemini-2.5-flash-image) directly via
 * generateContent -- the first real use of GEMINI_API_KEY for image
 * generation in this codebase (previously only src/server/providers/
 * gemini.ts's text/JSON planning call existed). Not yet folded into
 * src/providers/gemini/index.ts's GeminiImageProvider.generate(), which is
 * shaped around rendering a *scene shot* referencing already-canon
 * CharacterRefs (see src/providers/types.ts's ShotRequest) -- creating a
 * brand-new character's reference art is a Character Tool operation, not a
 * shot-generation one, so it doesn't fit that interface as-is.
 *
 * Run: npx tsx scripts/character-tool/generate-scribe-candidates.ts
 * Or regenerate just one (e.g. after a prompt fix): pass its slug --
 *   npx tsx scripts/character-tool/generate-scribe-candidates.ts candidate-1-younger-lean
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"; // Nano Banana (standard tier)

// `??` alone isn't enough here: .env has HEARTWORD_DATA_DIR= (present but
// empty), which is not null/undefined, so `??` doesn't fall back and this
// silently resolved to a relative "assets/..." path inside the OneDrive
// repo the first time this ran -- exactly the runtime-data-inside-the-repo
// split CLAUDE.md/ARCHITECTURE.md's "Development environment" section
// warns against. Treat empty-string the same as unset.
const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "mark-pharisees-scribes");

// Shared style anchor, matched to the existing approved Principal scribe
// turnaround sheet (characters/mark-2-principal-scribe/turnaround/
// hatam-principal-scribe-video-canon-v1.png): realistic photographic
// portrait, Hatam/Papuan (Melanesian Arfak highland) appearance, neutral
// warm-beige studio background, natural soft studio lighting, ankle-length
// robe with a separate head covering, sandals. No text/labels anywhere in
// the image (HeartWord's Scripture/Language Principles rule).
const STYLE_ANCHOR =
  "Photorealistic studio portrait, full body, standing, facing camera. " +
  "Hatam / Papuan (Melanesian Arfak highland) man, first-century Judean " +
  "religious teacher/scribe attire. Neutral warm-beige seamless studio " +
  "background, soft even studio lighting, no harsh shadows. Serious, " +
  "dignified expression. No text, no labels, no logos anywhere in the " +
  "image. GARMENT CONSTRUCTION (strict, matches every other approved " +
  "character in this canon): a tailored robe with sewn long sleeves " +
  "reaching the wrist, floor/ankle length hem, closed over both " +
  "shoulders. Do NOT render a sleeveless garment, a single-shoulder " +
  "wrap, a draped toga-style cloth, or any bare-shoulder/bare-arm " +
  "silhouette -- both arms must be fully covered to the wrist. Leather " +
  "sandals complete the outfit. HEAD COVERING CONSTRUCTION (strict, " +
  "matches the Principal scribe reference exactly -- see " +
  "characters/mark-2-principal-scribe/turnaround/ " +
  "hatam-principal-scribe-video-canon-v1.png): a first-century " +
  "Levantine/Judean mitpachat-style head covering -- a single square or " +
  "rectangular cloth laid flat over the crown of the head and draped " +
  "loosely down over the shoulders and back, framing the face, held in " +
  "place simply (a plain cord/band or just its own fall) with no wound " +
  "coils or layers on top of the head. Do NOT render a South Asian- " +
  "style wound/coiled turban (no rounded turban ball on the crown, no " +
  "spiral-wrapped fabric layers, no tucked-and-wound tail) -- that " +
  "reads as the wrong region and culture entirely for this production.";

// Four candidates, each deliberately distinct from the existing Principal
// scribe and from each other, per canonical-characters.md's Recognition
// Hierarchy -- but revised 2026-09-06 per Dan's direction: rather than
// giving each member its own robe color (this script's first draft), all
// four now share the Principal scribe's black, and rank within the group
// is signaled by *plainer construction* instead -- single-layer robes, no
// shoulder overlayer, no fringe, a plain (not striped) head covering --
// versus the Principal scribe's richer layered black robe, fringed
// overlayer, and striped grey headscarf, which stays visually senior. All
// four wear a head covering in the same wrapped style as the Principal
// scribe's (Dan's correction 2026-09-06 -- the first draft of this design
// dropped it for three of the four, which read as inconsistent within one
// group), just plain solid-color rather than striped. Distinguishing one
// member from another now leans entirely on the recognition hierarchy's
// stronger cues -- (1) face/hair/beard silhouette, (2) age/build/posture --
// plus at most one restrained accessory per member, since color no longer
// carries that job. Reusing distinct colors was also this script's own
// choice, not something canonical-characters.md requires -- a shared black
// "uniform" for an antagonist group, with one senior figure visually
// elevated above it, is the more legible read in a crowd shot.
const CANDIDATES = [
  {
    slug: "candidate-1-younger-lean",
    label: "Candidate 1 -- younger, lean build",
    description:
      STYLE_ANCHOR +
      " This man is younger (mid-30s), lean build, upright alert posture, " +
      "close-cropped black beard, short dark hair. Wearing the same plain " +
      "dark grey head covering fabric as the Principal scribe, just " +
      "without his stripe pattern. Robe is plain black, matching the " +
      "group's Principal scribe in color but visibly lower rank in " +
      "construction: a single unlayered " +
      "piece, no shoulder overlayer, no fringe or trim, coarser plainer " +
      "weave than the Principal scribe's robe, belted with a plain rope " +
      "sash -- a tailored garment, not a wrapped or draped cloth. One " +
      "restrained accessory: a wooden reed pen and small scroll case " +
      "tucked into the sash."
  },
  {
    slug: "candidate-2-older-stout",
    label: "Candidate 2 -- older, stout build",
    description:
      STYLE_ANCHOR +
      " This man is older (60s), stout heavier build, stooped posture, " +
      "long full grey-white beard, balding with grey hair at the temples. " +
      "Robe is plain black, matching the group's Principal scribe in " +
      "color but visibly lower rank in construction: a single unlayered " +
      "piece, no shoulder overlayer, no fringe or trim, coarser plainer " +
      "weave than the Principal scribe's robe. Plain unadorned dark grey " +
      "head covering (no stripe pattern, which stays reserved for the " +
      "Principal scribe). One restrained accessory: a small drawstring " +
      "pouch at the belt."
  },
  {
    slug: "candidate-3-middleaged-tablet",
    label: "Candidate 3 -- middle-aged, wax tablet",
    description:
      STYLE_ANCHOR +
      " This man is middle-aged (late 40s), medium build, confident " +
      "square-shouldered posture, short grey-flecked beard trimmed " +
      "square. Wearing the same plain dark grey head covering fabric as " +
      "the Principal scribe, just without his stripe pattern. Robe is " +
      "plain black, matching the " +
      "group's Principal scribe in color but visibly lower rank in " +
      "construction: a single unlayered piece, no shoulder overlayer, no " +
      "fringe or trim, coarser plainer weave than the Principal scribe's " +
      "robe. One restrained accessory: a small hinged wooden wax tablet " +
      "held in one hand."
  },
  {
    slug: "candidate-4-elder-tall-thin",
    label: "Candidate 4 -- elder, tall and thin",
    description:
      STYLE_ANCHOR +
      " This man is elderly (70s), tall and very thin build, slightly " +
      "hunched posture, very long thin white beard reaching the chest, " +
      "mostly bald with white hair at the sides. Wearing the same plain " +
      "dark grey head covering fabric as the Principal scribe, just " +
      "without his stripe pattern. Robe is plain black, matching the " +
      "group's Principal scribe in " +
      "color but visibly lower rank in construction: a single unlayered " +
      "piece, no shoulder overlayer, no fringe or trim, coarser plainer " +
      "weave than the Principal scribe's robe, slightly worn-looking. " +
      "IMPORTANT: this is a simple ankle-length robe, NOT a modern coat " +
      "or overcoat -- no structured lapels, no notched collar, no button " +
      "closure, no tailored shoulder seams like a Western jacket. The " +
      "head covering lies soft and flat against the head and falls in " +
      "loose folds -- it must NOT have any rigid flat top, flat brim, " +
      "stiff horizontal plane, wing shape, or peaked/mortarboard-like " +
      "silhouette; it should look exactly as soft and gravity-draped as " +
      "cloth, the same as the Principal scribe reference. One restrained " +
      "accessory: a plain wooden walking staff."
  }
];

type GeminiImagePart = { inlineData?: { mimeType: string; data: string } };
type GeminiImageResponse = {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
  promptFeedback?: { blockReason?: string };
};

async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set (see .env.example).");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] }
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

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) {
    throw new Error(`Gemini returned no image data: ${JSON.stringify(data).slice(0, 1000)}`);
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function main() {
  const requestedSlug = process.argv[2];
  const candidatesToRun = requestedSlug
    ? CANDIDATES.filter((c) => c.slug === requestedSlug)
    : CANDIDATES;
  if (requestedSlug && candidatesToRun.length === 0) {
    throw new Error(
      `No candidate with slug "${requestedSlug}". Known slugs: ${CANDIDATES.map((c) => c.slug).join(", ")}`
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Writing candidates to ${OUTPUT_DIR}\n`);

  for (const candidate of candidatesToRun) {
    console.log(`Generating: ${candidate.label}...`);
    try {
      const imageBuffer = await generateImage(candidate.description);
      const outPath = path.join(OUTPUT_DIR, `${candidate.slug}.png`);
      await writeFile(outPath, imageBuffer);
      console.log(`  -> saved ${outPath} (${imageBuffer.byteLength} bytes)`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
    }
  }

  console.log(
    "\nDone. These are candidates only -- review side by side against the " +
      "existing Principal scribe turnaround, per canonical-characters.md's " +
      "evolution workflow, before creating character/character_versions " +
      "rows for any of them."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
