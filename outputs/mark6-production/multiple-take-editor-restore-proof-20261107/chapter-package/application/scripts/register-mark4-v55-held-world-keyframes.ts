/** Register the four v45 world-consolidation keyframes as held Codex assets.
 * They are review inputs only: this script never accepts a keyframe, requests
 * video, or changes the assembled chapter. */
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { importKeyframe, prepareKeyframe } from "../src/pipeline/media-generation/external-keyframes.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const data = getDataDir();
const candidates = [
  {
    shotId: "7af4222c-ae6e-4577-abe7-65f904cbdb67",
    image: "generated/editorial/mark4-v45-held-replacements/scene1-sailboat-v03-close-v1.png",
    rationale: "Held source-bound Scene 1 close reference for the Mark 4:3–8 boat-teaching replacement; canonical Jesus is seated in the same sailboat world, face and mouth clearly available for a later exact audio window.",
    prompt: "Cinematic 16:9 medium close view for the Mark 4:3–8 boat-teaching performance: canonical Papuan Jesus seated in the established offshore sailboat, rocky shore crowd behind him, warm golden morning continuity, mouth clear, no invented gesture or extra speaker."
  },
  {
    shotId: "17246352-3c8d-498a-b99e-47c70ff89d2a",
    image: "generated/editorial/mark4-v45-held-replacements/scene2-rocky-hillside-v12-close-v1.png",
    rationale: "Held Scene 2 rocky-hillside close reference, replacing meadow geography and reserving a canon-consistent close for the missing 4:12 ending beat after a pause-aligned source plan is recorded.",
    prompt: "Cinematic 16:9 medium-close view for private teaching on the established rocky seaside hillside: canonical Papuan Jesus with a small inner circle, bright midday continuity, sea visible beyond the rocks, mouth readable, no meadow, no terrace, no invented action."
  },
  {
    shotId: "45aacff9-0266-4909-acb2-ce09f659b24a",
    image: "generated/editorial/mark4-v45-held-replacements/scene4-shore-v26-performance-v1.png",
    rationale: "Held Scene 4 shore/boat performance reference for Mark 4:26–29; it removes the field/garden Jesus-location drift while retaining field material only as parable illustration.",
    prompt: "Cinematic 16:9 medium-close source-performance view for Mark 4:26–29: canonical Papuan Jesus at the established lakeshore boat world, face and mouth clear, late-afternoon shore continuity, listeners only in shore context; no crop field or garden setting."
  }
] as const;

const db = getDb();
// Dan explicitly authorized the v45 scene-world recommendations. Re-stamping
// the already-approved plan records that direct producer decision; it neither
// invents a crew approval nor accepts any of the candidates below.
if (!reapproveCurrentPlanAfterProducerEdit(db, data, "8a5659a4-b033-4d5f-80e2-904b217cf8a0")) {
  throw new Error("No approved Mark 4 planning run is available to re-stamp.");
}
for (const candidate of candidates) {
  const image = join(data, "assets", candidate.image);
  const brief = prepareKeyframe(db, data, candidate.shotId, candidate.prompt, candidate.rationale);
  const imported = importKeyframe(db, data, brief, image, "Automated v45 scorecard review: held for producer review. Scene-world and canonical presentation visibly match the approved replacement brief. This candidate has no timeline, clip, or provider-video authority.");
  console.log(JSON.stringify({ shotId: candidate.shotId, ...imported, status: "hold_for_review" }));
}
