/**
 * Records the remaining attributed Jesus coverage as review-only planning.
 * It binds exact existing source intervals and specifies keyframe needs, but
 * does not voice, generate imagery, video, or alter the timeline.
 */
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";
import { bindShotUtterance } from "../src/pipeline/voice-lipsync/utterance-binding.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb(), now = Date.now();
type Plan = { shotId: string; verse: string; sourceId: string; start: number; end: number; action: string; coverage: "single_clip" | "covered_sequence"; keyframe: string };
const plans: Plan[] = [
  { shotId: "67a2d802-6a79-4461-bd99-aca44b3b7622", verse: "Mark 4:9", sourceId: "fd150379-a2ae-411c-9d2b-5dbed6ffe2b3", start: 111217, end: 114896, coverage: "single_clip", action: "Medium-close source-bound performance of Jesus in the boat delivering the brief concluding call to the gathered shore audience; his mouth is clearly readable.", keyframe: "One new medium-close Jesus keyframe, boat and shore crowd continuous with the teaching scene." },
  { shotId: "17246352-3c8d-498a-b99e-47c70ff89d2a", verse: "Mark 4:11", sourceId: "95b36a21-021d-4ca3-b1d8-c1f5f1569f67", start: 133062, end: 144130, coverage: "covered_sequence", action: "Source-bound Jesus teaching his small inner circle after the crowd has departed. The 11-second explanation must be covered by an opening geography view, two distinct medium-close Jesus inserts, and one listener reaction; never hold a single speaking image for the whole line.", keyframe: "Four new keyframes: over-shoulder master of the quiet circle, first medium-close Jesus insert, attentive disciple reaction, and a distinct three-quarter Jesus insert for the landing." },
  { shotId: "740eb1df-5b4b-4c69-958c-f6bb8032cc39", verse: "Mark 4:13", sourceId: "7f9e6066-5f16-42ba-96c7-910e1686bfd2", start: 172991, end: 179991, coverage: "single_clip", action: "Medium-close source-bound performance of Jesus questioning the seated disciples about understanding the parable; show his face and mouth clearly, with listeners oriented toward him.", keyframe: "One new medium-close Jesus keyframe in the private teaching circle." },
  { shotId: "611a8078-e67e-47c3-9cff-8c920809798e", verse: "Mark 4:21 (first interval)", sourceId: "f13972b1-1558-466c-abd8-68cc4a083d37", start: 262484, end: 270880, coverage: "covered_sequence", action: "Source-bound Jesus teaching from the boat with the lamp illustration. Cover the 8.4-second first interval with a side/rear geography view followed by a clear medium-close Jesus insert; do not leave a visible mouth moving unsynchronized in the master.", keyframe: "Two new keyframes: side/rear master emphasizing lamp and listeners, then a medium-close Jesus lamp-gesture insert." },
  { shotId: "827cdcb5-0d38-406d-938e-c7ac77dce675", verse: "Mark 4:21 (second interval)", sourceId: "22736946-752e-414e-885c-af8a0651348e", start: 271401, end: 271864, coverage: "single_clip", action: "Brief source-bound Jesus phrase in the same lamp teaching, held in a clear medium-close view with the lamp still geographically consistent.", keyframe: "One new medium-close Jesus keyframe; it may share the lamp setup but must not reuse legacy media." },
  { shotId: "86a71cf3-a873-498a-8e13-ce031e6cb8e1", verse: "Mark 4:21 (third interval)", sourceId: "698dc882-8765-4758-85a3-0cf7d9ce71b2", start: 272422, end: 275720, coverage: "single_clip", action: "Medium-close source-bound Jesus continuation of the lamp teaching, angled distinctly from the preceding brief phrase while keeping boat, lamp, and listeners continuous.", keyframe: "One new three-quarter medium-close Jesus keyframe." },
  { shotId: "45aacff9-0266-4909-acb2-ce09f659b24a", verse: "Mark 4:26", sourceId: "4a7a0236-00e6-4045-9a02-d2d05d9c0d98", start: 314979, end: 320681, coverage: "single_clip", action: "Medium-close source-bound Jesus beginning the seed-growing parable, teaching the gathered crowd with nearby fields as context and his mouth readable.", keyframe: "One new medium-close Jesus keyframe, shoreline teaching geography." },
  { shotId: "4934ce6e-3894-4800-a8b9-c380d91ae570", verse: "Mark 4:30 (first interval)", sourceId: "cbcd2c8e-c3a2-4dd4-80f4-3f7cc20ef5f7", start: 361365, end: 364948, coverage: "single_clip", action: "Medium-close source-bound Jesus posing the first kingdom-comparison question from the boat; audience remains visible only as listening context.", keyframe: "One new medium-close frontal Jesus keyframe." },
  { shotId: "8534f367-c673-4b45-a7a4-d42401f157a7", verse: "Mark 4:30 (second interval)", sourceId: "8f5a7a3d-ca34-482a-a8c7-425cc0f54c83", start: 365526, end: 368866, coverage: "single_clip", action: "Distinct medium-close source-bound Jesus continuation of the kingdom-comparison question after its natural pause; keep the boat and crowd continuity while changing angle.", keyframe: "One new three-quarter Jesus keyframe, distinct from the first verse 30 shot." }
];
const jesus = db.prepare("SELECT id FROM characters WHERE name='Jesus' AND canon_status='approved'").get() as { id: string } | undefined;
const version = jesus && db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").get(jesus.id) as { id: string } | undefined;
if (!jesus || !version) throw Error("Jesus's approved canon and version are required.");

const coverage = new Map<string, Array<{ type: "master" | "lip_sync_insert" | "cutaway"; start: number; end: number; lip: number; note: string }>>([
  ["17246352-3c8d-498a-b99e-47c70ff89d2a", [
    { type: "master", start: 0, end: 3500, lip: 0, note: "Opening over-shoulder master; keep Jesus's mouth out of clear view while the source line begins." },
    { type: "lip_sync_insert", start: 3500, end: 5784, lip: 1, note: "First medium-close Jesus source-speech insert; provisional proportional boundary requires phrase review before media." },
    { type: "cutaway", start: 5784, end: 8784, lip: 0, note: "Listening disciples reaction while the uninterrupted Jesus source audio continues." },
    { type: "lip_sync_insert", start: 8784, end: 11068, lip: 1, note: "Distinct three-quarter Jesus landing insert; provisional proportional boundary requires phrase review before media." }
  ]],
  ["611a8078-e67e-47c3-9cff-8c920809798e", [
    { type: "master", start: 0, end: 3500, lip: 0, note: "Side/rear lamp-and-listeners master; avoid a readable unsynchronized Jesus mouth." },
    { type: "lip_sync_insert", start: 3500, end: 8396, lip: 1, note: "Medium-close Jesus lamp-gesture insert; provisional proportional boundary requires phrase review before media." }
  ]]
]);

db.exec("BEGIN IMMEDIATE");
try {
  for (const plan of plans) {
    const current = db.prepare("SELECT continuity_notes FROM shots WHERE id=?").get(plan.shotId) as { continuity_notes: string | null } | undefined;
    if (!current) throw Error(`Planned shot is missing for ${plan.verse}.`);
    const note = `SPEAKER COVERAGE PLAN (awaiting producer keyframe review): ${plan.verse}. ${plan.keyframe} Legacy Mark 4 media remains retained history and is not approved for this restart coverage.`;
    const continuity = [current.continuity_notes, note].filter(Boolean).join("\n");
    db.prepare("UPDATE shots SET action=?, framing='medium_close', needs_lip_sync=1, dialogue_character_id=?, coverage_plan=?, coverage_notes=?, continuity_notes=? WHERE id=?")
      .run(plan.action, jesus.id, plan.coverage, plan.coverage === "covered_sequence" ? "Coverage beats are provisional visual splits of one exact source interval; refine phrase boundaries before media generation." : null, continuity, plan.shotId);
    db.prepare("INSERT OR IGNORE INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(plan.shotId, jesus.id);
    if (!db.prepare("SELECT id FROM shot_utterance_bindings WHERE shot_id=?").get(plan.shotId)) {
      bindShotUtterance(db, { projectId, shotId: plan.shotId, sourceSegmentId: plan.sourceId, startMs: plan.start, endMs: plan.end, characterVersionId: version.id, approvedBy: "Dan Brennan — recorded Jesus attribution plan" });
    }
    const humanNote = `Dan Brennan goal: ${plan.verse} is an attributed Jesus interval requiring the following new keyframe: ${plan.keyframe} No media generation is authorized by this planning record.`;
    if (!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?").get(projectId, plan.shotId, humanNote)) {
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)").run(randomUUID(), projectId, "shot", plan.shotId, humanNote, now);
    }
  }
  for (const [shotId, beats] of coverage) {
    const progressed = db.prepare("SELECT COUNT(*) n FROM coverage_beats WHERE shot_id=? AND status!='planned'").get(shotId) as { n: number };
    if (progressed.n) throw Error(`Cannot replace progressed coverage beats for ${shotId}.`);
    db.prepare("DELETE FROM coverage_beats WHERE shot_id=? AND status='planned'").run(shotId);
    for (let index = 0; index < beats.length; index++) {
      const beat = beats[index]!;
      db.prepare("INSERT INTO coverage_beats (id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,audio_confidence,needs_lip_sync,character_id,requires_new_keyframe,notes,status,created_at) VALUES (?,?,?,?,?,?,NULL,?,?,1,?,'planned',?)")
        .run(randomUUID(), shotId, index + 1, beat.type, beat.start, beat.end, beat.lip, beat.lip ? jesus.id : null, beat.note, now);
    }
  }
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }

if (!reapproveCurrentPlanAfterProducerEdit(db, getDataDir(), projectId)) throw Error("No approved planning run was available to re-stamp.");
console.log(JSON.stringify({ projectId, intervals: plans.map(({ verse, start, end, coverage }) => ({ verse, start, end, coverage })), coverageSequences: [...coverage.entries()].map(([shotId, beats]) => ({ shotId, beats: beats.length })), mediaGenerationStarted: false }, null, 2));
