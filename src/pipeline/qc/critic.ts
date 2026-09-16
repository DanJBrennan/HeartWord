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
import { generateGroundedText, generateJsonWithImages, type GeminiJsonSchema, type GroundingSource } from "../../server/providers/gemini.js";

export type CriticSeverity = "none" | "minor" | "moderate" | "severe";

export interface CriticReport {
  severity: CriticSeverity;
  findings: string;
  /** Real web sources Gemini's search grounding actually cited while
   *  producing `findings` -- traceable provenance for a research claim
   *  ("archaeological evidence shows...") rather than an unverifiable
   *  assertion. May be empty when the model answered without searching. */
  sources: GroundingSource[];
  /** The smallest concrete correction for the most severe finding, in a
   *  form a regeneration prompt can use directly -- null when severity is
   *  "none" or the model didn't provide a usable one. See
   *  parseCriticSuggestedFix. */
  suggestedFix: string | null;
  /** What must NOT change if suggestedFix is applied -- null when
   *  severity is "none". Always paired with suggestedFix: a caller should
   *  not act on one without the other. See parseCriticPreserve. */
  preserve: string | null;
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

/** An approved reference image for one cast character, so the Critic can
 *  actually compare the generated frame against a real reference instead
 *  of judging a "hard identity rule" (e.g. Jesus's locked robe) from a
 *  textual description alone. */
export interface CriticCharacterReference {
  name: string;
  imagePath: string;
}

export interface CriticInputs {
  action: string;
  verseRef: string | null;
  continuityNotes: string | null;
  crowdDensity: string | null;
  /** The generated keyframe under review. */
  generatedImagePath: string;
  /** The verified scripture text (source + reference translation) this
   *  shot must be faithful to -- without this the Critic can only judge
   *  "scriptural accuracy" against a one-line action paraphrase, not the
   *  actual passage. Omit when unavailable (e.g. verseRef doesn't parse). */
  scriptureText?: string | null;
  /** Reference images for this shot's cast, so identity/costume rules can
   *  be checked against a real reference rather than a text description. */
  characterReferences?: CriticCharacterReference[];
  /** Standing production-wide canon decisions (e.g. "a striped shawl on a
   *  scribe is an accepted stylistic choice") -- apply to EVERY shot, not
   *  just this one. Loaded by the caller from review_notes rows scoped to
   *  the whole project, distinct from a one-shot exception below. */
  canonDecisions?: string[];
  /** Producer decisions already made for THIS specific shot (e.g. "the
   *  missing debris here is fine, people obscure the floor"). Must NOT be
   *  treated as generalizing to any other shot -- that's the difference
   *  from canonDecisions above. Loaded by the caller from review_notes
   *  rows scoped to this one shot_id. */
  shotOverrides?: string[];
  precedingCoverageFrame?: CriticContinuityFrame;
  coverageBeat?: CriticCoverageBeat;
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
      `robe or regional traits. A group of three matching background faces is a real clone artifact. Check the full crowd, ` +
      `including soft-focus background people -- but a face too blurred, small, or angled away from camera to compare with ` +
      `real confidence is INCONCLUSIVE, not a match: do not count it toward the group, and say in your explanation which people ` +
      `you excluded as too unclear to judge rather than guessing they're the same or different. Return 1 only when the full, ` +
      `clearly visible crowd genuinely shows no confident match.`,
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
  const severity = match[1]?.toLowerCase();
  return severity === "none" || severity === "minor" || severity === "moderate" || severity === "severe" ? severity : "moderate";
}

const SUGGESTED_FIX_LINE = /SUGGESTED FIX:\s*(.+)/i;
const PRESERVE_LINE = /PRESERVE:\s*(.+)/i;

/**
 * Extracts the Critic's proposed smallest correction, so a non-'accepted'
 * verdict carries an actual instruction the NEXT generation attempt can
 * use, instead of the retry silently reusing the exact prompt that just
 * failed. Returns null (not a placeholder string) when absent or the
 * model wrote "none" -- a caller should treat null as "no specific fix to
 * apply," not as if the line were missing due to a parsing failure.
 */
export function parseCriticSuggestedFix(findings: string): string | null {
  const match = findings.match(SUGGESTED_FIX_LINE);
  if (!match) return null;
  const fix = match[1]!.trim().replace(/^["']|["']$/g, "");
  return /^none\.?$/i.test(fix) ? null : fix;
}

/** Extracts what the Critic says must NOT change if the suggested fix
 *  above is applied -- paired with parseCriticSuggestedFix so a caller
 *  never has one without the other. */
export function parseCriticPreserve(findings: string): string | null {
  const match = findings.match(PRESERVE_LINE);
  if (!match) return null;
  const preserve = match[1]!.trim().replace(/^["']|["']$/g, "");
  return /^everything\.?$/i.test(preserve) ? null : preserve;
}

/**
 * Runs the Critic's real, grounded research pass against one shot's
 * generated keyframe. `generatedImagePath` is required -- the physical/
 * staging-plausibility half of this review is meaningless without
 * actually seeing the frame, unlike the original scriptural-accuracy-only
 * version of this function.
 */
export async function runCritic(inputs: CriticInputs): Promise<CriticReport> {
  const {
    action,
    verseRef,
    continuityNotes,
    crowdDensity,
    generatedImagePath,
    scriptureText,
    characterReferences,
    canonDecisions,
    shotOverrides,
    precedingCoverageFrame,
    coverageBeat
  } = inputs;

  const image = { mimeType: "image/png", data: readFileSync(generatedImagePath).toString("base64") };
  const precedingImage = precedingCoverageFrame
    ? { mimeType: "image/png", data: readFileSync(precedingCoverageFrame.imagePath).toString("base64") }
    : undefined;

  // Reference images for this shot's approved cast -- the SAME assets the
  // separate canonical-likeness check compares against, given here so the
  // identity hard rule (below) can be judged against a real reference
  // instead of a text description alone. generateGroundedText only takes a
  // flat image list with no per-image caption, so instead of an inline
  // label next to each image, the prompt describes their fixed attachment
  // order below.
  const referenceImages = (characterReferences ?? []).map((ref) => ({
    mimeType: "image/png",
    data: readFileSync(ref.imagePath).toString("base64")
  }));

  const actionContext = coverageBeat
    ? `This frame is coverage beat ${coverageBeat.sequence} (a ${coverageBeat.type}) of a longer covered-sequence shot. ` +
      `What THIS beat specifically needs to show: "${coverageBeat.notes}"\n` +
      `Broader parent-shot action, for scriptural/setting context only -- judge this beat's own motion and staging ` +
      `against the beat purpose above, NOT against this whole-scene description: "${action}"\n`
    : `Shot action: "${action}"\n`;

  const prompt =
    `You are a skeptical critic reviewing one generated keyframe for a Scripture video production dramatizing ` +
    `${verseRef ?? "an unspecified passage"}. You do not trust that this frame is historically accurate, ` +
    `scripturally faithful, or physically workable just because it looks plausible at a glance -- use REAL web ` +
    `research (archaeology, biblical scholarship, historical/cultural sources) where relevant, and your own ` +
    `careful physical reasoning about the image itself.\n\n` +
    actionContext +
    `${continuityNotes ? `Continuity/setting notes already recorded for this shot: "${continuityNotes}"\n` : ""}` +
    `${crowdDensity ? `Required crowd density: "${crowdDensity}"\n` : ""}\n` +
    `${scriptureText ? `The verified scripture text this shot must be faithful to:\n${scriptureText}\n\n` : ""}` +
    `${(characterReferences?.length ?? 0) > 0
      ? `The first ${characterReferences!.length} attached image(s) are approved canon reference images, in this order: ` +
        `${characterReferences!.map((r, i) => `${i + 1}) ${r.name}`).join(", ")}. Use them, not a general impression, to judge ` +
        `identity/costume rules below. ${precedingCoverageFrame ? "The next attached image is the preceding coverage frame, and " : "And "}` +
        `the FINAL attached image is the actual candidate keyframe under review.\n\n`
      : ""}` +
    `${precedingCoverageFrame
      ? `A preceding coverage frame is attached before the candidate. It is ${precedingCoverageFrame.label}: ${precedingCoverageFrame.description}\n\n`
      : ""}` +
    `First inventory what is actually visible in the candidate image. Image evidence is authoritative: do not claim that a person, ` +
    `prop, posture, architecture feature, or action is visible unless it is actually shown, and do not infer an absent subject's ` +
    `pose from the shot-level action text.\n\n` +
    `VISIBILITY & CONFIDENCE -- for every finding below, distinguish what you can actually SEE from what you're inferring. State ` +
    `where in the frame the evidence is and how confident you are (high/medium/low). Most importantly: an area, object, or person ` +
    `that is obscured, off-frame, out of focus, or too small to make out is UNCERTAIN, not absent -- never report something as ` +
    `"missing" (no debris, no rope, no reaction) when the only honest read is that you can't confirm it either way because it's ` +
    `not visible. Only call something missing when the relevant area IS visible and genuinely shows nothing there. The same rule ` +
    `applies to matching faces in item 8: a blurred or tiny background face is inconclusive, not a confirmed duplicate.\n\n` +
    `Review the attached image against ALL of the following:\n\n` +
    `1. HISTORICAL/SCRIPTURAL ACCURACY: wrong architecture for the period/region, an anachronistic object or ` +
    `practice, a detail that contradicts what the verified scripture text above (or, absent that, the shot action) says or ` +
    `implies, a widely-documented archaeological fact this frame seems to ignore.\n\n` +
    `2. MOTION/STAGING FEASIBILITY -- this keyframe is the STARTING FRAME for a short video clip that will ` +
    `animate the physical action described above (the beat's own purpose, when this is a coverage beat -- not the whole parent ` +
    `shot). Judge whether this specific frame is actually a workable starting point for that motion, not just whether it looks ` +
    `good as a still: Is there enough visible slack/rope/material left for the implied motion to continue believably (e.g. if ` +
    `something is being lowered, is there rope left to pay out, or has it already reached its final position with nothing left ` +
    `to animate)? Are any people in physically stable, sensible positions for what they're doing (e.g. would people actually ` +
    `stand on a solid structure/roof/beam to lower something, not stand ON the very thing being lowered)? Would ` +
    `the video generator most likely produce an awkward, physically implausible, or confusing result from this ` +
    `exact starting composition? If so, describe specifically what a BETTER starting frame would show instead.\n\n` +
    `3. MISSING CONSEQUENCES/CONTINUITY GAPS: does the frame fail to show the physical aftermath of an action the ` +
    `story already implies has happened (e.g. digging through a roof should leave visible debris -- broken ` +
    `branches, clumps of dried mud/clay -- on the floor or scattered below the opening)? Only report this if the relevant area ` +
    `is actually visible and clearly empty -- if people, framing, or focus obscure where that debris would be, say so and do ` +
    `NOT report it as missing.\n\n` +
    `4. CROWD DENSITY: does the number of people actually visible match the required density stated above, if any?\n\n` +
    `5. CHARACTER IDENTITY HARD RULE: if Jesus is meant to appear in this shot, treat ANY other person wearing his ` +
    `exact locked robe/clothing color combination as an automatic, disqualifying failure -- this holds even if ` +
    `their hairstyle, face, or build differs from his reference. A shared locked color-block is not a coincidence ` +
    `in this production; it is always a real identity error. Compare against the attached reference image(s) when present, not ` +
    `just a general impression of "his usual look."\n\n` +
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
    `visibly matching people is severe. A face too blurred, small, or angled away to compare with confidence is inconclusive -- ` +
    `do not count it toward a duplicate group. Do not confuse people who merely share a generic scholar robe with a duplicate.\n\n` +
    `${precedingCoverageFrame
      ? `9. COVERAGE-BEAT CONTINUITY: compare the preceding attached coverage frame with this candidate. Posture, position, ` +
        `orientation, props, crowd arrangement, and active eyelines must progress plausibly unless the attached context explicitly ` +
        `states an intervening action. Report an unexplained change such as Jesus standing in one beat and seated in the next as ` +
        `a staging continuity failure.\n\n`
      : ""}` +
    `${canonDecisions?.length
      ? `STANDING PRODUCTION CANON DECISIONS -- the production has explicitly reviewed and approved the following ` +
        `deviations or calibrations as deliberate choices that apply ACROSS THE WHOLE PRODUCTION, not just one shot. ` +
        `Do NOT flag anything already covered by these as an error, and do not rate it above minor even if it would ` +
        `otherwise concern you:\n` +
        canonDecisions.map((d) => `- ${d}`).join("\n") +
        `\n\n`
      : ""}` +
    `${shotOverrides?.length
      ? `PRODUCER DECISIONS ALREADY MADE FOR THIS SPECIFIC SHOT -- the producer has already reviewed a prior candidate ` +
        `for THIS shot and explicitly accepted the following. Do NOT re-raise these same concerns for this shot. These ` +
        `are scoped to this one shot only -- do not assume they apply to any other shot's review:\n` +
        shotOverrides.map((o) => `- ${o}`).join("\n") +
        `\n\n`
      : ""}` +
    `List every real problem you find, citing research where relevant. If you genuinely find nothing wrong in any ` +
    `of these areas, say so plainly rather than inventing a concern.\n\n` +
    `End your response with exactly these three lines, in this order (each on its own line):\n` +
    `"SEVERITY: none" (nothing wrong), "SEVERITY: minor" (a small, easily-overlooked detail), "SEVERITY: moderate" ` +
    `(worth fixing before this ships), or "SEVERITY: severe" (a clear error a knowledgeable viewer would notice, ` +
    `or a starting frame the video generator likely can't animate believably).\n` +
    `"SUGGESTED FIX: <the single smallest concrete change that would resolve your MOST severe finding, written as ` +
    `an instruction a prompt-writer could paste directly into the next generation attempt -- e.g. 'lower the roof ` +
    `pitch to flat construction' or 'add scattered debris on the floor beneath the opening', not a vague 'improve ` +
    `historical accuracy'. If severity is none, write 'none'.>"\n` +
    `"PRESERVE: <what is already correct and must NOT change if this frame gets regenerated with the fix above -- ` +
    `e.g. 'keep the crowd composition and Jesus's pose exactly as-is, only correct the roof'. This prevents a fix ` +
    `for one problem from accidentally discarding everything that already works. If severity is none, write ` +
    `'everything'.>"`;

  // A response with no parseable "SEVERITY: ..." line is retried once --
  // parseCriticSeverity's "moderate" fallback exists for a genuine
  // formatting slip in an otherwise-usable response, not as a stand-in
  // for a review that never actually happened. If the retry ALSO comes
  // back unparseable, throw rather than silently guess "moderate" --
  // there is no evidence yet that the image needs changing, only that
  // the review infrastructure failed twice. Callers already have to
  // handle a thrown runCritic (a network error behaves the same way);
  // media-generation/index.ts's per-shot handler treats this as an
  // incomplete review, not a content verdict, and does not spend another
  // generation call on it.
  const images = [...referenceImages, ...(precedingImage ? [precedingImage] : []), image];
  let result = await generateGroundedText(prompt, images);
  if (!SEVERITY_LINE.test(result.text)) {
    result = await generateGroundedText(prompt, images);
    if (!SEVERITY_LINE.test(result.text)) {
      throw new Error(
        `Critic's grounded research call returned no parseable SEVERITY line twice in a row -- treating as an ` +
          `incomplete review, not a content verdict. Last response: ${result.text.slice(0, 500)}`
      );
    }
  }
  const duplicateVerdict = await checkCrowdDuplicates(image);
  const duplicateSeverity = crowdDuplicateSeverity(duplicateVerdict.largestIdenticalGroup);
  const modelSeverity = parseCriticSeverity(result.text);
  const severity = higherSeverity(modelSeverity, duplicateSeverity);
  const duplicateFinding = duplicateVerdict.largestIdenticalGroup > 1
    ? `Dedicated crowd-duplicate verifier: ${duplicateVerdict.largestIdenticalGroup} visually identical people at ${duplicateVerdict.location}. ${duplicateVerdict.explanation}`
    : "Dedicated crowd-duplicate verifier: no visually identical crowd members detected.";
  // dedupe by uri, since the model can cite the same source more than once
  const sources = [...new Map(result.sources.map((s) => [s.uri, s])).values()];
  const sourcesFinding = sources.length
    ? `\n\nSources cited by the grounded research pass:\n${sources.map((s) => `- ${s.title} (${s.uri})`).join("\n")}`
    : "";

  let suggestedFix = parseCriticSuggestedFix(result.text);
  let preserve = parseCriticPreserve(result.text);
  // The dedicated crowd-duplicate verifier is a SEPARATE call from the
  // model's own free-text pass, so its own SUGGESTED FIX line may not
  // address duplicates at all if that wasn't what its own pass judged as
  // most severe. When the duplicate check is the dominant finding,
  // override with a fix that actually addresses it -- otherwise a
  // regeneration attempt would apply the wrong correction.
  if (higherSeverity(duplicateSeverity, modelSeverity) === duplicateSeverity && duplicateSeverity !== modelSeverity) {
    suggestedFix = `Regenerate with a genuinely distinct background crowd at ${duplicateVerdict.location} -- ${duplicateVerdict.explanation}`;
    preserve = preserve ?? "everything else in the frame; only vary the duplicated background people's faces, hair, beards, and clothing";
  }

  return {
    severity,
    findings: `${result.text}\n\n${duplicateFinding}\nSEVERITY: ${severity}${sourcesFinding}`,
    sources,
    suggestedFix,
    preserve
  };
}
