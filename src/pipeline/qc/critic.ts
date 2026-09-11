/**
 * Critic agent: a skeptical, research-grounded review of one generated
 * shot -- built 2026-09-06 at Dan's request to generalize what he'd been
 * doing by hand all session (asking "is this roof really that tall in
 * real Capernaum houses?", "would a tax booth really look like a dining
 * table?") into a repeatable, automated step. Unlike canonical-likeness.ts
 * (face-fidelity) and scene-fidelity.ts (setting/costume/continuity),
 * both of which judge a shot purely against ITS OWN reference/plan data,
 * the Critic's job is to bring in real outside knowledge the shot's own
 * plan might be silently wrong about -- historical/archaeological facts,
 * biblical scholarship, cultural details -- the same class of gap that
 * caught the Capernaum roof height and tax-booth-structure issues.
 *
 * Scope widened the same day, still before this shipped, per Dan's
 * follow-up: the Critic should ALSO doubt whether the keyframe itself is
 * a workable STARTING FRAME for the video clip it's about to become --
 * physical/staging plausibility (is there enough visible rope to keep
 * lowering someone? are the men standing somewhere that wouldn't
 * immediately topple them? would four men really stand on the mat they're
 * lowering, or on the roof structure?), missing consequences of the
 * action so far (where's the debris from digging through a roof?), and a
 * hard identity rule Dan stated explicitly: any character other than
 * Jesus wearing his exact locked robe combination is an automatic
 * failure, regardless of hairstyle or face similarity -- clothing alone
 * disqualifies, it isn't averaged against other signals. Confirmed
 * empirically this same session: asking Gemini to critique an actual
 * keyframe image for rope/standing-position plausibility, with search
 * grounding still active, correctly found real physical problems (an
 * early real test run said the ropes had "zero remaining rope to pay
 * out" and the men were "balanced precariously on a thin round log" --
 * exactly the kind of thing this was built to catch) and rated it severe.
 *
 * Two-call design, not one, because Gemini's `google_search` grounding
 * tool and `responseSchema` JSON mode don't reliably combine in a single
 * call (confirmed empirically while building this):
 * 1. generateGroundedText -- a real web-search-backed research pass,
 *    given the shot's action text, continuity notes, AND the actual
 *    generated keyframe image (confirmed grounding + image input DO
 *    combine in one call, unlike grounding + JSON mode).
 * 2. A severity line the critic appends to its own findings
 *    ("SEVERITY: none|minor|moderate|severe"), parsed by
 *    parseCriticSeverity (pure, tested) rather than trusted as free text.
 *
 * This is a genuinely new, real cost per shot (a live grounded search
 * call with an image attached), so -- like canonical-likeness.ts and
 * scene-fidelity.ts before it -- this module is standalone, not
 * auto-wired into every runMediaGeneration call yet. See director.ts for
 * how its findings combine with the existing checks, and
 * CURRENT_GOAL.md for the real per-shot cost/latency tradeoff this raises
 * before wiring it in by default.
 */
import { readFileSync } from "node:fs";
import { generateGroundedText, generateJsonWithImages, type GeminiJsonSchema } from "../../server/providers/gemini.js";

export type CriticSeverity = "none" | "minor" | "moderate" | "severe";

export interface CriticReport {
  severity: CriticSeverity;
  findings: string;
}

export interface CriticContinuityFrame {
  label: string;
  imagePath: string;
  description: string;
}

/** Context for one edit inside a longer covered sequence. */
export interface CriticCoverageBeat {
  sequence: number;
  type: string;
  notes: string;
}

interface CrowdDuplicateVerdict {
  largestIdenticalGroup: number;
  location: string;
  explanation: string;
}

const CROWD_DUPLICATE_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    largestIdenticalGroup: {
      type: "number",
      description: "Largest number of distinct visible people who are the same generated face and visual design. Return 1 when no duplicate exists."
    },
    location: { type: "string", description: "Where the largest same-face group appears, or 'none'." },
    explanation: { type: "string", description: "Concrete comparison of face, hair, beard, garment and pose evidence." }
  },
  required: ["largestIdenticalGroup", "location", "explanation"]
};

/** Pure severity gate for the dedicated visual duplicate-crowd verifier. */
export function crowdDuplicateSeverity(largestIdenticalGroup: number): CriticSeverity {
  if (largestIdenticalGroup >= 3) return "severe";
  if (largestIdenticalGroup === 2) return "moderate";
  return "none";
}

function higherSeverity(a: CriticSeverity, b: CriticSeverity): CriticSeverity {
  const levels: CriticSeverity[] = ["none", "minor", "moderate", "severe"];
  return levels.indexOf(a) >= levels.indexOf(b) ? a : b;
}

async function checkCrowdDuplicates(image: { mimeType: string; data: string }): Promise<CrowdDuplicateVerdict> {
  return generateJsonWithImages<CrowdDuplicateVerdict>(
    `Inspect this single generated keyframe solely for copied crowd members. Enumerate every visible person, then compare ` +
      `facial structure, hairline/curl pattern, beard shape, garment folds, and pose. Count the largest group of distinct ` +
      `people that are visibly the same generated person. Do not count people as duplicates merely because they share a generic ` +
      `robe or regional traits. A group of three matching background faces is a real clone artifact. Return 1 only after checking ` +
      `the full crowd, including soft-focus background people.`,
    [image],
    CROWD_DUPLICATE_SCHEMA
  );
}

const SEVERITY_LINE = /SEVERITY:\s*(none|minor|moderate|severe)/i;

/**
 * Extracts the self-reported severity from the critic's free-text
 * findings. Fails safe to "moderate" (not "none") when the model doesn't
 * include a parseable severity line -- an unparseable response shouldn't
 * silently wave a shot through, but shouldn't force a human review either
 * when the miss is just a formatting slip.
 */
export function parseCriticSeverity(findings: string): CriticSeverity {
  const match = findings.match(SEVERITY_LINE);
  if (!match) return "moderate";
  return match[1].toLowerCase() as CriticSeverity;
}

/**
 * Runs the Critic's real, grounded research pass against one shot's
 * generated keyframe. `generatedImagePath` is required -- the physical/
 * staging-plausibility half of this review is meaningless without
 * actually seeing the frame, unlike the original scriptural-accuracy-only
 * version of this function.
 */
export async function runCritic(
  action: string,
  verseRef: string | null,
  continuityNotes: string | null,
  crowdDensity: string | null,
  generatedImagePath: string,
  precedingCoverageFrame?: CriticContinuityFrame,
  coverageBeat?: CriticCoverageBeat
): Promise<CriticReport> {
  const image = { mimeType: "image/png", data: readFileSync(generatedImagePath).toString("base64") };
  const precedingImage = precedingCoverageFrame
    ? { mimeType: "image/png", data: readFileSync(precedingCoverageFrame.imagePath).toString("base64") }
    : undefined;

  const prompt =
    `You are a skeptical critic reviewing one generated keyframe for a Scripture video production dramatizing ` +
    `${verseRef ?? "an unspecified passage"}. You do not trust that this frame is historically accurate, ` +
    `scripturally faithful, or physically workable just because it looks plausible at a glance -- use REAL web ` +
    `research (archaeology, biblical scholarship, historical/cultural sources) where relevant, and your own ` +
    `careful physical reasoning about the image itself.\n\n` +
    `Shot action: "${action}"\n` +
    `${continuityNotes ? `Continuity/setting notes already recorded for this shot: "${continuityNotes}"\n` : ""}` +
    `${crowdDensity ? `Required crowd density: "${crowdDensity}"\n` : ""}\n` +
    `${coverageBeat
      ? `This is coverage beat ${coverageBeat.sequence}, a ${coverageBeat.type}. Its assigned purpose is: "${coverageBeat.notes}". ` +
        `Judge the frame against that purpose. A reaction or cutaway may deliberately omit the shot's active speaker, paralytic, ` +
        `or another action subject when that subject is off-screen; do not call that intentional omission a defect.\n`
      : ""}` +
    `${precedingCoverageFrame
      ? `A preceding coverage frame is attached before the candidate. It is ${precedingCoverageFrame.label}: ${precedingCoverageFrame.description}\n\n`
      : ""}` +
    `First inventory what is actually visible in the candidate image. Image evidence is authoritative: do not claim that a person, ` +
    `prop, posture, architecture feature, or action is visible unless it is actually shown, and do not infer an absent subject's ` +
    `pose from the shot-level action text.\n\n` +
    `Review the attached image against ALL of the following:\n\n` +
    `1. HISTORICAL/SCRIPTURAL ACCURACY: wrong architecture for the period/region, an anachronistic object or ` +
    `practice, a detail that contradicts what the actual text says or implies, a widely-documented archaeological ` +
    `fact this frame seems to ignore.\n\n` +
    `2. MOTION/STAGING FEASIBILITY -- this keyframe is the STARTING FRAME for a short video clip that will ` +
    `animate whatever physical action the shot's text describes. Judge whether this specific frame is actually a ` +
    `workable starting point for that motion, not just whether it looks good as a still: Is there enough visible ` +
    `slack/rope/material left for the implied motion to continue believably (e.g. if something is being lowered, ` +
    `is there rope left to pay out, or has it already reached its final position with nothing left to animate)? ` +
    `Are any people in physically stable, sensible positions for what they're doing (e.g. would people actually ` +
    `stand on a solid structure/roof/beam to lower something, not stand ON the very thing being lowered)? Would ` +
    `the video generator most likely produce an awkward, physically implausible, or confusing result from this ` +
    `exact starting composition? If so, describe specifically what a BETTER starting frame would show instead.\n\n` +
    `3. MISSING CONSEQUENCES/CONTINUITY GAPS: does the frame fail to show the physical aftermath of an action the ` +
    `story already implies has happened (e.g. digging through a roof should leave visible debris -- broken ` +
    `branches, clumps of dried mud/clay -- on the floor or scattered below the opening; is it missing here)?\n\n` +
    `4. CROWD DENSITY: does the number of people actually visible match the required density stated above, if any?\n\n` +
    `5. CHARACTER IDENTITY HARD RULE: if Jesus is meant to appear in this shot, treat ANY other person wearing his ` +
    `exact locked robe/clothing color combination as an automatic, disqualifying failure -- this holds even if ` +
    `their hairstyle, face, or build differs from his reference. A shared locked color-block is not a coincidence ` +
    `in this production; it is always a real identity error.\n\n` +
    `6. CASTING REGION RULE: every visible person, including background crowd members, must have Papuan/Hatam facial identity. ` +
    `A clearly white/European-looking background person is a real casting drift: rate it at least moderate, and severe if ` +
    `it is prominent or an intended canon character.\n\n` +
    `7. AUDIENCE EYELINE: when an audience is visibly watching Jesus teach, locate Jesus in the image and verify that their ` +
    `heads and eyes plausibly orient toward him or the relevant off-camera speaker. Report a conflicting spatial eyeline as a ` +
    `real staging failure, not a stylistic preference.\n\n` +
    `8. DUPLICATED CROWD MEMBERS: inspect the entire crowd, including background faces, for visibly identical generated ` +
    `people: group matching faces before assigning severity, and explicitly report the largest same-face group you can see. ` +
    `The same face, hair, beard, clothing, and pose repeated as though copied is a generation artifact. A repeated canon crowd ` +
    `design may recur elsewhere in a scene, but two visually indistinguishable rendered people in the same frame are not valid ` +
    `population. One subtle background pair is minor; a clear pair or a prominent duplicate is at least moderate; three or more ` +
    `visibly matching people is severe. Do not confuse people who merely share a generic scholar robe with a duplicate.\n\n` +
    `${precedingCoverageFrame
      ? `9. COVERAGE-BEAT CONTINUITY: compare the preceding attached coverage frame with this candidate. Posture, position, ` +
        `orientation, props, crowd arrangement, and active eyelines must progress plausibly unless the attached context explicitly ` +
        `states an intervening action. Report an unexplained change such as Jesus standing in one beat and seated in the next as ` +
        `a staging continuity failure.\n\n`
      : ""}` +
    `PRODUCTION CANON CALIBRATION: a white-and-black striped shawl on a scribe is a minor costume-canon violation. ` +
    `Report it briefly, but do not rate it above minor or use it to make an otherwise usable keyframe fail.\n\n` +
    `List every real problem you find, citing research where relevant. If you genuinely find nothing wrong in any ` +
    `of these areas, say so plainly rather than inventing a concern.\n\n` +
    `End your response with exactly one line in this format: "SEVERITY: none" (nothing wrong), "SEVERITY: minor" ` +
    `(a small, easily-overlooked detail), "SEVERITY: moderate" (worth fixing before this ships), or "SEVERITY: ` +
    `severe" (a clear error a knowledgeable viewer would notice, or a starting frame the video generator likely ` +
    `can't animate believably).`;

  // A response with no parseable "SEVERITY: ..." line is retried once --
  // parseCriticSeverity's "moderate" fallback exists for a genuine
  // formatting slip, not as a first resort, since silently guessing
  // "moderate" on a malformed response (e.g. an unresolved grounding
  // tool-call artifact leaking into the text instead of real findings)
  // can trigger an unnecessary regeneration for a review that never
  // actually happened.
  const images = precedingImage ? [precedingImage, image] : [image];
  let findings = await generateGroundedText(prompt, images);
  if (!SEVERITY_LINE.test(findings)) {
    findings = await generateGroundedText(prompt, images);
  }
  const duplicateVerdict = await checkCrowdDuplicates(image);
  const duplicateSeverity = crowdDuplicateSeverity(duplicateVerdict.largestIdenticalGroup);
  const severity = higherSeverity(parseCriticSeverity(findings), duplicateSeverity);
  const duplicateFinding = duplicateVerdict.largestIdenticalGroup > 1
    ? `Dedicated crowd-duplicate verifier: ${duplicateVerdict.largestIdenticalGroup} visually identical people at ${duplicateVerdict.location}. ${duplicateVerdict.explanation}`
    : "Dedicated crowd-duplicate verifier: no visually identical crowd members detected.";
  return { severity, findings: `${findings}\n\n${duplicateFinding}\nSEVERITY: ${severity}` };
}
