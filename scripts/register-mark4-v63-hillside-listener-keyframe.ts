/** Register one additional held Scene 2 listener view; no media is accepted or placed. */
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { importKeyframe, prepareKeyframe } from "../src/pipeline/media-generation/external-keyframes.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const data = getDataDir();
const db = getDb();
if (!reapproveCurrentPlanAfterProducerEdit(db, data, "8a5659a4-b033-4d5f-80e2-904b217cf8a0")) {
  throw new Error("No approved Mark 4 planning run is available to re-stamp.");
}
const brief = prepareKeyframe(
  db,
  data,
  "6096a4f9-7032-440d-97c8-ee2d92f377d7",
  "Landscape 16:9 private Mark 4 rocky-seaside hillside listener over-the-shoulder: canonical Papuan Jesus seated on limestone with two disciples in the foreground, bright midday, lake beyond, no meadow, terrace, boat, crop field, garden, or readable mouth movement. Held review keyframe only.",
  "Held Scene 2 listener coverage for Mark 4:10–12. It anchors the private-teaching world to the approved rocky seaside hillside and has no speaking or timeline authority."
);
const imported = importKeyframe(
  db,
  data,
  brief,
  join(data, "assets", "generated/editorial/mark4-v45-held-replacements/scene2-rocky-hillside-listener-ots-v1.png"),
  "Automated v45 scorecard recommendation. Held for visible producer review only; no timeline, clip, or video-generation authority."
);
console.log(JSON.stringify({ shotId: "6096a4f9-7032-440d-97c8-ee2d92f377d7", ...imported, status: "hold_for_review" }));
