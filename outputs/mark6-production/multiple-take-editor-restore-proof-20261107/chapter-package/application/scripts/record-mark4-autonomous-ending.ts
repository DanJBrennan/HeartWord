/** Record Dan's explicit overnight direction for a 24-second, post-source bridge. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const sourceEndMs = 515754;
const introMs = 11500;
const start = sourceEndMs + introMs;
const beats = [
  {
    type: "journey", description: "The boat glides on the now-calm sea beneath clearing night clouds.",
    rationale: "A quiet visual release after Mark 4:41, retaining the boat already present in the source chapter.",
    evidence: "Mark 4:35–41 crossing; post-source editorial handoff.",
  },
  {
    type: "destination_hint", description: "A distant eastern shoreline slowly emerges as dawn begins.",
    rationale: "Prepares the verified destination named at Mark 5:1 without depicting its next event.",
    evidence: "Mark 5:1, 'the other side of the sea, to the country of the Gerasenes.'",
  },
  {
    type: "arrival", description: "Jesus and the disciples step from the boat onto the quiet shore.",
    rationale: "A restrained arrival image connects the completed crossing to the next chapter's opening location.",
    evidence: "Mark 5:1; editorial post-source preview only.",
  },
  {
    type: "departure", description: "A very wide, slow pull-away shows Jesus walking a few paces along the shore path with the disciples behind him, then settles on the new horizon.",
    rationale: "User-directed closing pull-away that creates a finished handoff without showing the later Gerasene encounter.",
    evidence: "Editorial post-source bridge directed by producer; no later Mark 5 action may appear.",
  },
].map((beat, sequence) => ({ ...beat, sequence: sequence + 1, duration_ms: 6000, timeline_start_ms: start + sequence * 6000, timeline_end_ms: start + (sequence + 1) * 6000 }));
const plan = {
  nextChapterRef: "Mark 5:1",
  sourceClockEndMs: sourceEndMs,
  editorialDurationMs: 24000,
  musicDirection: "Quiet instrumental under the source chapter; rise to a clear, resolved finish only across the 24-second post-source bridge.",
  constraints: ["post-source only", "no Gerasene encounter, tombs, or new named character", "Jesus and established disciples only", "label as editorial handoff"],
  beats,
};
const now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE editorial_beats SET status='held' WHERE project_id=? AND placement='post_source' AND status IN ('approved_for_generation','generated','accepted')").run(projectId);
  const insert = db.prepare(`INSERT INTO editorial_beats (id,project_id,sequence,placement,beat_type,description,rationale,evidence,duration_ms,timeline_start_ms,timeline_end_ms,source_label,status,approved_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE editorial_beats SET beat_type=?,description=?,rationale=?,evidence=?,duration_ms=?,timeline_start_ms=?,timeline_end_ms=?,source_label=?,status='approved_for_generation',approved_by=?
    WHERE project_id=? AND placement='post_source' AND sequence=?`);
  for (const beat of beats) {
    const changed = update.run(beat.type, beat.description, beat.rationale, beat.evidence, beat.duration_ms, beat.timeline_start_ms, beat.timeline_end_ms, "Editorial post-source bridge to Mark 5:1", "Dan Brennan — overnight autonomous direction", projectId, beat.sequence).changes;
    if (!changed) insert.run(randomUUID(), projectId, beat.sequence, "post_source", beat.type, beat.description, beat.rationale, beat.evidence, beat.duration_ms, beat.timeline_start_ms, beat.timeline_end_ms, "Editorial post-source bridge to Mark 5:1", "approved_for_generation", "Dan Brennan — overnight autonomous direction", now);
  }
  db.prepare("UPDATE chapter_ending_plans SET plan_json=?, status='needs_review', updated_at=? WHERE project_id=?").run(JSON.stringify(plan), now, projectId);
  db.exec("COMMIT");
  console.log(JSON.stringify({ editorialDurationMs: 24000, beats: beats.map(({ type, duration_ms }) => ({ type, duration_ms })) }, null, 2));
} catch (error) { db.exec("ROLLBACK"); throw error; }
