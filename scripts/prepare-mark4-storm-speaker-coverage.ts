/**
 * Materializes Dan's post-attribution Mark 4 storm coverage plan. This is a
 * review-only casting update: it changes no media, accepts no existing take,
 * and starts no provider work.
 */
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const now = Date.now();

type Proposal = {
  sequence: number;
  speaker: "Peter" | "Jesus";
  action: string;
  sourceNote: string;
};

const proposals: Proposal[] = [
  {
    sequence: 10,
    speaker: "Peter",
    action: "Medium-close source-bound performance of Peter, visibly aboard the storm-tossed boat beside the sleeping Jesus. Peter delivers the final desperate plea; the other disciples remain naturally occupied with the flooding boat.",
    sourceNote: "Mark 4:38: Peter speaks only the final source-bound plea. Proposed keyframe must show Peter in the boat; no off-screen speaking Peter and no media generation before producer review."
  },
  {
    sequence: 12,
    speaker: "Jesus",
    action: "Medium-close source-bound performance of Jesus after he rises in the boat. He speaks the brief command toward the wind and waves; the storm geography and disciples remain continuous with the preceding shot.",
    sourceNote: "Mark 4:39: narrator leads in and resumes afterward; Jesus's command is the retained middle source interval. Review a new speaking keyframe before any lip-sync generation."
  },
  {
    sequence: 15,
    speaker: "Jesus",
    action: "Medium-close source-bound performance of Jesus in the sudden calm, facing the drenched disciples for the first retained phrase of his question. His mouth is clear; listeners remain naturally oriented toward him.",
    sourceNote: "Mark 4:40: narrator leads in; this is the first of two retained Jesus speech intervals. Review a new speaking keyframe before any lip-sync generation."
  },
  {
    sequence: 17,
    speaker: "Jesus",
    action: "A distinct medium-close source-bound performance of Jesus in the same calm boat for the second retained phrase of his question. Keep the disciples, wardrobe, wet boat, and calm water continuous; do not repeat the prior composition.",
    sourceNote: "Mark 4:40: this is the second retained Jesus speech interval after a natural pause. Review a new speaking keyframe before any lip-sync generation."
  }
];

const characters = new Map(
  (db.prepare("SELECT id,name FROM characters WHERE name IN ('Peter','Jesus') AND canon_status='approved'").all() as Array<{ id: string; name: string }>).map(row => [row.name, row.id])
);
if (characters.size !== 2) throw new Error("Approved Peter and Jesus canon records are required.");

db.exec("BEGIN TRANSACTION");
try {
  for (const proposal of proposals) {
    const shot = db.prepare(
      `SELECT sh.id, sh.continuity_notes FROM shots sh
       JOIN scenes sc ON sc.id=sh.scene_id
       WHERE sc.project_id=? AND sc.sequence=7 AND sh.sequence=?`
    ).get(projectId, proposal.sequence) as { id: string; continuity_notes: string | null } | undefined;
    if (!shot) throw new Error(`Missing Mark 4 storm Shot ${proposal.sequence}.`);
    const characterId = characters.get(proposal.speaker)!;
    const notes = [shot.continuity_notes, `SPEAKER COVERAGE PROPOSAL (awaiting producer keyframe review): ${proposal.sourceNote}`]
      .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
      .join("\n");
    db.prepare(
      `UPDATE shots SET action=?, framing='medium_close', needs_lip_sync=1,
       dialogue_character_id=?, coverage_plan='single_clip', coverage_notes=NULL,
       continuity_notes=? WHERE id=?`
    ).run(proposal.action, characterId, notes, shot.id);
    db.prepare("INSERT OR IGNORE INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(shot.id, characterId);

    const note = `Dan Brennan producer direction: ${proposal.sourceNote} Existing Mark 4 generated keyframes and video remain retained history; this creates a review-only speaker-coverage proposal.`;
    const exists = db.prepare(
      "SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?"
    ).get(projectId, shot.id, note);
    if (!exists) db.prepare(
      "INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?,? ,?,?,?)"
    ).run(randomUUID(), projectId, "shot", shot.id, "human", note, 0, now);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

if (!reapproveCurrentPlanAfterProducerEdit(db, getDataDir(), projectId)) {
  throw new Error("No approved Mark 4 planning run was available to re-stamp after Dan's direct plan edit.");
}

console.log(JSON.stringify({
  projectId,
  proposals: proposals.map(({ sequence, speaker }) => ({ scene: 7, shot: sequence, speaker })),
  mediaGenerationStarted: false
}, null, 2));
