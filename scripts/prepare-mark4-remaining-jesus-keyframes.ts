/**
 * Prepares immutable, review-only briefs for Dan's approved Mark 4 Jesus
 * coverage. It does not call an image/video provider or change any review
 * status; importing each generated still remains a separate guarded step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { prepareKeyframe } from "../src/pipeline/media-generation/external-keyframes.js";
import { prepareCoverageBeatBrief } from "../src/pipeline/media-generation/external-coverage-keyframes.js";

const db = getDb();
const dataDir = getDataDir();
const output = join(dataDir, "assets", "generated", "keyframe-briefs", "mark4-jesus-coverage");
mkdirSync(output, { recursive: true });

const canon = `Jesus is the approved Papuan/Hatam canon: a mature Papuan/Melanesian man with a stable warm-brown face, long dark wavy hair, full dark beard, and the established cream woven tunic under a cream mantle with restrained indigo-blue bands and visible short knotted corner tassels. No halo, text, watermark, modern objects, or generic European likeness. First-century Galilee only. Clearly readable natural daylight, realistic cinematic film still, 16:9 landscape. The moment is already underway: do not invent arrivals, departures, doorways, confrontation, or new actions. Avoid posed portraits; use story-motivated eyelines and natural asymmetry. `;

const items = [
  {
    key: "v09-speaking",
    kind: "shot" as const,
    id: "67a2d802-6a79-4461-bd99-aca44b3b7622",
    prompt: `${canon} Mark 4:9, boat teaching scene. Medium-close lip-sync performance of Jesus seated or balanced in the fishing boat, turned toward the shoreline crowd as he delivers the final call. His face and mouth are fully readable, an attentive shore audience is softly visible behind him, and the boat geometry continues naturally.`,
    rationale: "A clear mouth-readable performance covers the short attributed closing call without reusing legacy media."
  },
  {
    key: "v11-beat1-master",
    kind: "beat" as const,
    id: "e3ab722f-0fb3-4397-8b7c-b05bb0861a65",
    prompt: `${canon} Mark 4:11 private teaching after the crowd has departed. Over-the-shoulder geography master of a quiet small circle of seated disciples listening on a Galilean slope. Jesus is seen from side or rear with his mouth hidden, late-afternoon ambience, no one looks at camera.`,
    rationale: "The opening master establishes the private teaching circle while preventing an unsynchronized visible mouth."
  },
  {
    key: "v11-beat2-insert",
    kind: "beat" as const,
    id: "8647e349-5f4a-4679-a194-bcb3239abf96",
    prompt: `${canon} Mark 4:11 private teaching circle. First medium-close lip-sync insert of Jesus explaining to the seated inner circle, three-quarter front view, face and mouth clearly readable, two disciples softly visible listening in the foreground.`,
    rationale: "The first speaking insert gives the long source line a clear, source-bound performance view."
  },
  {
    key: "v11-beat3-reaction",
    kind: "beat" as const,
    id: "7c595ac4-bedf-4ef9-b195-700de353c23d",
    prompt: `${canon} Mark 4:11 private teaching circle. Intimate reaction cutaway of two or three Papuan/Hatam disciples listening thoughtfully, with Jesus only from behind or out of focus so no readable mouth appears. Same hillside, garments, daylight, and seating geometry as the surrounding teaching shots.`,
    rationale: "A listener reaction provides natural visual coverage during the continued source speech without a visible unsynchronized mouth."
  },
  {
    key: "v11-beat4-landing",
    kind: "beat" as const,
    id: "6f53ae2d-8db9-4c7a-a143-a86c2ad956c7",
    prompt: `${canon} Mark 4:11 private teaching circle. Distinct three-quarter medium-close lip-sync landing insert of Jesus, slightly lower camera angle than the earlier insert, completing his explanation to the seated listeners. His mouth is readable; disciples keep natural listening eyelines.`,
    rationale: "A distinct final speaking angle prevents the eleven-second line from becoming a single frozen performance."
  },
  {
    key: "v13-speaking",
    kind: "shot" as const,
    id: "740eb1df-5b4b-4c69-958c-f6bb8032cc39",
    prompt: `${canon} Mark 4:13 private teaching circle. Medium-close lip-sync performance of Jesus gently questioning the seated disciples about understanding the parable. His face and mouth are clear, his expression is intent but patient, and listeners are naturally oriented toward him.`,
    rationale: "A single medium-close speaking frame matches the short attributed question and preserves the established private-circle continuity."
  },
  {
    key: "v21-first-beat1-master",
    kind: "beat" as const,
    id: "97b6e0ba-1d35-4bb5-a0c2-ab738ee1c52e",
    prompt: `${canon} Mark 4:21 boat teaching with the lamp illustration. Side/rear geography master looking past a small oil lamp in the boat toward Jesus and the shore listeners; Jesus's mouth is turned away or hidden, the lamp is a small first-century clay oil lamp, and no flame or prop dominates the frame.`,
    rationale: "The master establishes the lamp-and-listeners geography while preventing a readable unsynchronized mouth."
  },
  {
    key: "v21-first-beat2-insert",
    kind: "beat" as const,
    id: "5f784c56-ed26-4341-88ed-6736144285ec",
    prompt: `${canon} Mark 4:21 boat teaching with the lamp illustration. Medium-close lip-sync insert of Jesus making a restrained, natural gesture toward a small clay oil lamp near him; face and mouth clearly readable, listening crowd remains soft contextual background, not a posed portrait.`,
    rationale: "The speaking insert covers the remainder of the first lamp interval with a clearly readable Jesus performance."
  },
  {
    key: "v21-second-speaking",
    kind: "shot" as const,
    id: "827cdcb5-0d38-406d-938e-c7ac77dce675",
    prompt: `${canon} Mark 4:21 lamp teaching, same boat and shore geography. Tight medium-close lip-sync view of Jesus delivering the brief next phrase, one hand close to the small clay lamp, mouth clearly readable. Distinct pose from the prior lamp insert while remaining continuous.`,
    rationale: "A brief source phrase still needs its own mouth-readable, non-legacy speaker keyframe."
  },
  {
    key: "v21-third-speaking",
    kind: "shot" as const,
    id: "86a71cf3-a873-498a-8e13-ce031e6cb8e1",
    prompt: `${canon} Mark 4:21 lamp teaching, same boat and shore geography. Three-quarter medium-close lip-sync performance of Jesus continuing after the pause, camera from the opposite side of the lamp from the preceding phrase. Mouth is clearly readable; listeners remain naturally placed and attentive.`,
    rationale: "A distinctly angled continuation preserves the source pause and avoids repeating the prior lamp composition."
  },
  {
    key: "v26-speaking",
    kind: "shot" as const,
    id: "45aacff9-0266-4909-acb2-ce09f659b24a",
    prompt: `${canon} Mark 4:26 shoreline teaching. Medium-close lip-sync performance of Jesus beginning the seed-growing parable from the boat, teaching toward a gathered shore crowd. A cultivated Galilean field is visible as distant context only; face and mouth are clear.`,
    rationale: "The new parable opening requires an exact, readable Jesus speaker frame with the source-grounded field context."
  },
  {
    key: "v30-first-speaking",
    kind: "shot" as const,
    id: "4934ce6e-3894-4800-a8b9-c380d91ae570",
    prompt: `${canon} Mark 4:30 boat teaching. Frontal medium-close lip-sync performance of Jesus posing the first kingdom-comparison question, with an open, inviting expression. His face and mouth are clear; the shore audience is visible only as soft listening context.`,
    rationale: "The first question interval needs a straightforward mouth-readable performance to carry its exact source speech."
  },
  {
    key: "v30-second-speaking",
    kind: "shot" as const,
    id: "8534f367-c673-4b45-a7a4-d42401f157a7",
    prompt: `${canon} Mark 4:30 boat teaching. Distinct three-quarter medium-close lip-sync performance of Jesus continuing the kingdom-comparison question after its natural pause, from a different side than the preceding frontal frame. His face and mouth are clear; boat and crowd continuity remain intact.`,
    rationale: "The continuation gets a separate, varied speaker composition rather than repeating the first question frame."
  }
];

const prepared = items.map((item) => {
  const brief = item.kind === "shot"
    ? prepareKeyframe(db, dataDir, item.id, item.prompt, item.rationale)
    : prepareCoverageBeatBrief(db, dataDir, item.id, item.prompt, item.rationale);
  const path = join(output, `${item.key}-${brief.id}.json`);
  writeFileSync(path, JSON.stringify({ key: item.key, kind: item.kind, brief }, null, 2), { flag: "wx" });
  return { key: item.key, kind: item.kind, briefId: brief.id, path };
});
console.log(JSON.stringify({ prepared, mediaGenerationStarted: false }, null, 2));
