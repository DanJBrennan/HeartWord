/**
 * One-off script: split the "Mark Crowd Witnesses" character_group's single
 * flattened reference sheet (characters/mark-2-crowd-witnesses/turnaround/
 * hatam-crowd-anchors-video-canon-v1.png -- 8 headshots + 2 group
 * compositions, all in one image, modeled today as ONE character row
 * "Eight recurring witnesses + adolescent, Mark 2 (crowd)") into individual
 * canon characters, one at a time, per Dan's direction 2026-09-06. That
 * sheet reads as stylized/comic-leaning (flatter lighting, illustrative
 * skin rendering) rather than matching the photorealistic style every other
 * approved character in this canon uses -- this regenerates each
 * individual as a realistic photographic portrait, keeping the same
 * identity cues (headscarf color, rough age, build) the original sheet
 * established, rather than inventing new people.
 *
 * Candidates below are numbered left-to-right matching the sheet's top row
 * of 8 headshots (the adolescent shares the 8th woman's panel and isn't
 * split out separately here -- a call for later once the adults are done).
 * Only one candidate generates by default per Dan's "one at a time" --
 * pass a slug to pick a specific one once more are added here.
 *
 * These are candidates, not canon -- see generate-scribe-candidates.ts's
 * header for the same review-before-promotion workflow, unchanged here.
 *
 * Run: npx tsx scripts/character-tool/generate-crowd-candidates.ts
 * Or a specific one: npx tsx scripts/character-tool/generate-crowd-candidates.ts candidate-2-older-man-headwrap
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"; // Nano Banana (standard tier)

const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const OUTPUT_DIR = path.join(dataDir, "assets", "characters", "candidates", "mark-crowd-witnesses");

// Ordinary first-century Galilean villagers, NOT the scribes' formal black
// -- earthy village-common palette, matching the color language the
// original sheet and the already-canon "Mark 2 Friends of the Paralytic"
// group both use (rust, olive, tan, slate, brown). Photorealistic, not the
// flatter/illustrative rendering of the original sheet.
const STYLE_ANCHOR =
  "Photorealistic studio portrait, full body, standing, facing camera. " +
  "Hatam / Papuan (Melanesian Arfak highland) person, first-century " +
  "Galilean village commoner, NOT formal religious/scribal attire -- " +
  "simple everyday work clothing. Neutral warm-beige seamless studio " +
  "background, soft even studio lighting, no harsh shadows, realistic " +
  "photographic skin texture and lighting (this must NOT look flat, " +
  "illustrative, comic-book styled, or airbrushed -- true photographic " +
  "realism, matching a real photo shoot). Natural, watchful, unposed " +
  "expression. No text, no labels, no logos anywhere in the image. " +
  "GARMENT CONSTRUCTION: a simple tailored tunic/robe with long sleeves " +
  "to the wrist, mid-calf to ankle length, a rougher plainer village-wear " +
  "weave (not fine formal fabric). Leather sandals. If a head covering is " +
  "specified below, it is a first-century Levantine village-style cloth " +
  "draped loosely over the head and shoulders (the same construction as " +
  "the Principal scribe reference), NOT a South Asian-style wound turban " +
  "and NOT a rigid/stiff shape -- soft, gravity-draped cloth only.";

const CANDIDATES = [
  {
    slug: "candidate-1-older-woman-rust-headscarf",
    label: "Candidate 1 -- older woman, rust/burnt-orange headscarf",
    description:
      STYLE_ANCHOR +
      " This is a woman, middle-aged to older (50s-60s), weathered face, " +
      "direct serious watchful expression, matching the first (leftmost) " +
      "headshot on the original reference sheet. Wearing a rust/burnt- " +
      "orange colored headscarf, draped loosely over her head and " +
      "shoulders. Robe/dress is a plain earthy brown, simple village-wear " +
      "cut, no ornamentation. No accessory."
  },
  {
    slug: "candidate-2-man-headwrap",
    label: "Candidate 2 -- man, dark beard, wrapped headband",
    description:
      STYLE_ANCHOR +
      " This is a man, middle-aged (40s), weathered face, dark full beard, " +
      "serious watchful expression, matching the second headshot on the " +
      "original reference sheet. Wearing a plain tan/beige cloth wrapped " +
      "as a simple headband around his head (not a full draped headscarf " +
      "-- a narrower band tied around the brow, hair visible above it). " +
      "Robe is a plain earthy tan/brown, simple village-wear cut, no " +
      "ornamentation. No accessory."
  },
  {
    slug: "candidate-3-young-man-no-covering",
    label: "Candidate 3 -- young man, no head covering",
    description:
      STYLE_ANCHOR +
      " This is a man, young (early-to-mid 20s), short dark curly hair, " +
      "no head covering, clean-shaven or very light stubble, open " +
      "watchful expression, matching the third headshot on the original " +
      "reference sheet. Robe is a plain slate grey-blue, simple village- " +
      "wear cut, no ornamentation. No accessory."
  },
  {
    slug: "candidate-4-older-woman-cream-headscarf",
    label: "Candidate 4 -- older woman, cream/white headscarf",
    description:
      STYLE_ANCHOR +
      " This is a woman, elderly (70s), deeply wrinkled face, frail but " +
      "dignified bearing, matching the fourth headshot on the original " +
      "reference sheet. Wearing a cream/off-white colored headscarf, " +
      "draped loosely over her head and shoulders. Robe/dress is a plain " +
      "muted tan, simple village-wear cut, no ornamentation. No accessory."
  },
  {
    slug: "candidate-5-stern-man-no-covering",
    label: "Candidate 5 -- heavier-set man, stern expression, no covering",
    description:
      STYLE_ANCHOR +
      " This is a man, middle-aged (40s), heavier/stockier build, short " +
      "dark curly hair, no head covering, intense stern expression, " +
      "matching the fifth headshot on the original reference sheet. Robe " +
      "is a plain earthy tan/brown, simple village-wear cut, no " +
      "ornamentation. A simple plain cord visible at the neckline. No " +
      "other accessory."
  },
  {
    slug: "candidate-6-young-woman-no-covering",
    label: "Candidate 6 -- young woman, no head covering",
    description:
      STYLE_ANCHOR +
      " This is a woman, young (late teens to early 20s), dark hair worn " +
      "loose and uncovered, calm neutral watchful expression, matching " +
      "the sixth headshot on the original reference sheet. Robe/dress is " +
      "a plain olive/tan color, simple village-wear cut, no " +
      "ornamentation. No accessory."
  },
  {
    slug: "candidate-7-elder-grey-beard",
    label: "Candidate 7 -- older man, full grey/white beard",
    description:
      STYLE_ANCHOR +
      " This is a man, elderly (70s), full grey-white beard and hair, " +
      "gentle wise expression, matching the seventh headshot on the " +
      "original reference sheet. No head covering. Robe is a plain " +
      "muted reddish-brown, simple village-wear cut, no ornamentation. " +
      "No accessory."
  },
  {
    slug: "candidate-8-woman-with-child",
    label: "Candidate 8 -- woman in dark headscarf, with a child beside her",
    description:
      STYLE_ANCHOR +
      " This is a woman, middle-aged (40s-50s), wearing a dark charcoal/ " +
      "near-black headscarf draped loosely over her head and shoulders, " +
      "calm protective expression, matching the eighth (rightmost) " +
      "headshot on the original reference sheet, together with a young " +
      "boy (around 10-12 years old, an adolescent) standing right beside " +
      "her, her hand resting on his shoulder -- both figures fully framed " +
      "and visible, full body, standing side by side. The boy has short " +
      "dark curly hair, no head covering, wearing a plain simple tan " +
      "tunic. The woman's robe/dress is a plain earthy tan/brown, simple " +
      "village-wear cut. No other accessory."
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
    : [CANDIDATES[0]]; // "one at a time" default -- just the first
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
    "\nDone. This is a candidate only -- review against the original " +
      "reference sheet's matching headshot before creating a character row " +
      "for it."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
