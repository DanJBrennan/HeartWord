/** Records Dan's approval of the thirteen Mark 4 Jesus coverage keyframes.
 * This promotes only the already-held stills; it never submits audio/video
 * generation or alters unrelated chapter media. */
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
import { acceptKeyframe } from "../src/pipeline/media-generation/external-keyframes.js";
import { acceptCoverageBeatKeyframe } from "../src/pipeline/media-generation/external-coverage-keyframes.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const db = getDb();
const dataDir = getDataDir();
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const normal = [
  "3515296a-36f7-40db-bbee-4ef33619ac98",
  "d2e15f8b-d2b1-4e82-a989-6e8f0c6bb665",
  "173b8d3a-5f27-4c46-9525-dd521b185097",
  "df4f26b9-8b73-4c0a-bd7f-1a5606dd054e",
  "e62901ce-ca60-4f29-8274-16ecb33567e0",
  "bcc82f86-0a7d-4da8-a7c2-4a07926024a4",
  "4f6db394-9055-4198-91f2-aa1008d38df7"
];
const beatIds = [
  "e3ab722f-0fb3-4397-8b7c-b05bb0861a65",
  "8647e349-5f4a-4679-a194-bcb3239abf96",
  "7c595ac4-bedf-4ef9-b195-700de353c23d",
  "6f53ae2d-8db9-4c7a-a143-a86c2ad956c7",
  "97b6e0ba-1d35-4bb5-a0c2-ab738ee1c52e",
  "5f784c56-ed26-4341-88ed-6736144285ec"
];

const acceptedNormal = normal.map((id) => acceptKeyframe(db, id));
const acceptedBeats = beatIds.map((id) => acceptCoverageBeatKeyframe(db, id));
const now = Date.now();
db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
  VALUES (?,?,'project',?,'human',?,1,?)`).run(
  randomUUID(), projectId, projectId,
  "Dan approved all thirteen remaining Mark 4 Jesus speaker-coverage keyframes after visual review. The composite critic findings remain retained advisory evidence; no video or chapter-wide media generation is authorized by this approval.", now
);
if (!reapproveCurrentPlanAfterProducerEdit(db, dataDir, projectId)) throw new Error("No approved Mark 4 planning run was available to re-stamp.");
console.log(JSON.stringify({ acceptedNormal: acceptedNormal.length, acceptedCoverageBeats: acceptedBeats.length, videoGenerated: false }, null, 2));
