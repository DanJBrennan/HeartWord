/**
 * Registers the second v45 scorecard scene-world coverage batch as held
 * keyframes. It never accepts an asset, generates video, or changes a cut.
 */
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { importKeyframe, prepareKeyframe } from "../src/pipeline/media-generation/external-keyframes.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const data = getDataDir();
const candidates = [
  {
    shotId: "5a812d41-8b6a-443e-9028-3dd8bc4649d2",
    image: "generated/editorial/mark4-v45-held-replacements/scene1-boat-to-rocky-shore-reverse-v1.png",
    rationale: "Held Scene 1 reverse coverage: the recommended public-teaching world viewed from the boat toward the same rocky shore crowd. It is continuity coverage only and cannot substitute for a source-bound performance.",
    prompt: "Landscape 16:9 Mark 4 public boat-teaching reverse: canonical Papuan Jesus seated in the established wooden boat facing the same rocky shore crowd, warm established golden light, no sailboat, terrace, garden, crop field, or readable mouth movement. Held review keyframe only."
  },
  {
    shotId: "cfdb65be-62c3-4c88-b2e7-8d2f5459ab39",
    image: "generated/editorial/mark4-v45-held-replacements/scene3-olive-grove-private-teaching-wide-v1.png",
    rationale: "Held Scene 3 wide coverage: the same private olive-grove slope and disciple circle throughout Mark 4:14–20, replacing the meadow/grove geography drift without inventing new action.",
    prompt: "Landscape 16:9 Mark 4 private teaching wide: canonical Papuan Jesus and a small disciple circle on the same olive-grove slope above the lake, warm established light, no meadow, boat, crop field, terrace, or readable mouth movement. Held review keyframe only."
  },
  {
    shotId: "0003976f-7c1a-4508-a40c-cad61cd7bb37",
    image: "generated/editorial/mark4-v45-held-replacements/scene4-lakeshore-teaching-coverage-v1.png",
    rationale: "Held Scene 4 lakeshore coverage: Jesus, listeners, and the fishing boat remain in one shore world for Mark 4:21–25. It is non-speaking coverage and cannot be treated as lip sync.",
    prompt: "Landscape 16:9 Mark 4 lakeshore teaching coverage: canonical Papuan Jesus with listeners by the established wooden fishing boat on the same rocky shore, warm established late-afternoon light, no field, garden, terrace, sailboat, or readable mouth movement. Held review keyframe only."
  }
] as const;

const db = getDb();
// Direct producer authorization covers the v45 location recommendations. This
// preserves plan provenance but intentionally does not approve these assets.
if (!reapproveCurrentPlanAfterProducerEdit(db, data, "8a5659a4-b033-4d5f-80e2-904b217cf8a0")) {
  throw new Error("No approved Mark 4 planning run is available to re-stamp.");
}

for (const candidate of candidates) {
  const brief = prepareKeyframe(db, data, candidate.shotId, candidate.prompt, candidate.rationale);
  const imported = importKeyframe(
    db,
    data,
    brief,
    join(data, "assets", candidate.image),
    "Automated v45 scorecard recommendation. Held for visible producer review only; no timeline, clip, or video-generation authority."
  );
  console.log(JSON.stringify({ shotId: candidate.shotId, ...imported, status: "hold_for_review" }));
}
