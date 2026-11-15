/** Retain Dan's Mark 3 -> 4 transition instruction in the normal planner record. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { buildChapterEndingPlan } from "../src/pipeline/casting/chapter-ending.js";
import { parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";
import { discoverSourcePaths } from "../src/pipeline/ingestion/source-catalog.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267", db = getDb();
if (db.prepare("SELECT project_id FROM chapter_ending_plans WHERE project_id=?").get(projectId)) throw new Error("Mark 3 ending plan already exists; inspect before revising.");
const current = parseSourceTextByVerse(discoverSourcePaths({ language: "hatam", book: "mark", chapter: 3 }, undefined, undefined, false).referencePath)
  .filter(v => v.verse >= 31).map(v => v.text).join(" ");
const next = parseSourceTextByVerse(discoverSourcePaths({ language: "hatam", book: "mark", chapter: 4 }, undefined, undefined, false).referencePath)
  .find(v => v.verse === 1)?.text;
if (!next) throw new Error("Verified Mark 4:1 reference is missing.");
const sourceClockEndMs = Number((db.prepare("SELECT MAX(end_ms) AS endMs FROM audio_segments WHERE project_id=? AND layer='original_reading'")
  .get(projectId) as { endMs: number | null }).endMs);
const plan = buildChapterEndingPlan({ currentFinalText: current, nextChapterRef: "Mark 4:1", nextChapterFirstVerse: next,
  sourceClockEndMs, proposal: { reasoning: "Dan directed an inferred, wordless walk from the Mark 3 house toward Mark 4's verified lakeside setting. Jesus and a gradually gathering crowd recede in an aerial pull-back. The bridge begins only after the final Hatam words and does not depict Mark 4 teaching or boat use.", shots: [
    { role: "departure", description: "Jesus rises from the seated crowd and leaves the same house; the listeners naturally make space.", reason: "Give the final spoken line a deliberate visual consequence and remove the stray end flash.", currentEvidence: "those who sat around him", nextEvidence: "beside the sea", durationSec: 5 },
    { role: "journey", description: "Outside, Jesus walks toward the sea while individual townspeople notice and some follow.", reason: "Connect the established house and shoreline with a human-scale inferred passage.", currentEvidence: "Here are my mother and my brothers", nextEvidence: "beside the sea", durationSec: 5 },
    { role: "destination_hint", description: "The camera rises to a bird's-eye pull-back; Jesus becomes smaller as people gather and the sea fills more of the frame.", reason: "Prepare Mark 4:1's lakeside crowd without beginning its teaching or boat action.", currentEvidence: "those who sat around him", nextEvidence: "a very large crowd gathered", durationSec: 5 }
  ] } });
if (plan.status !== "proposed") throw new Error(`Mark 3 ending plan held: ${plan.reviewNotes.join(" ")}`);
const now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_ending_plans (project_id,plan_json,status,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run(projectId, JSON.stringify(plan), plan.status, now, now);
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,0,?)")
    .run(randomUUID(), projectId, projectId, "Producer-directed Mark 3 -> Mark 4 post-source transition: depart the house, walk toward the sea, gather followers, pull back to bird's-eye view. This is inferred staging, not Scripture narration. Review generated media and the final cut before approval.", now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ projectId, status: plan.status, shots: plan.shots.length, sourceClockEndMs }));
