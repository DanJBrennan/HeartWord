/** Small, deliberately non-deploying workflow for reviewed QC evidence.
 * Usage:
 *   npx tsx scripts/evaluate-reviewed-evidence.ts export v1 > v1.json
 *   npx tsx scripts/evaluate-reviewed-evidence.ts import v2 v2.json
 *   npx tsx scripts/evaluate-reviewed-evidence.ts compare v1 v2 [heldOutProjectId]
 */
import { readFileSync } from "node:fs";
import { getDb } from "../src/db/client.js";
import { adjudicateRetainedEvidence, compareEvaluation, exportEvaluationPredictions, importEvaluationPredictions, type EvaluationLabel, type EvaluationPrediction } from "../src/pipeline/qc/evaluation.js";

const [command, first, second, heldOutProjectId] = process.argv.slice(2);
if (command === "export" && first) {
  console.log(JSON.stringify(exportEvaluationPredictions(getDb(), first), null, 2));
} else if (command === "import" && first && second) {
  const parsed = JSON.parse(readFileSync(second, "utf8")) as { version?: string; predictions?: EvaluationPrediction[] };
  if (parsed.version && parsed.version !== first) throw new Error("Input version does not match the requested version.");
  console.log(JSON.stringify(importEvaluationPredictions(getDb(), first, parsed.predictions ?? []), null, 2));
} else if (command === "compare" && first && second) {
  console.log(JSON.stringify(compareEvaluation(getDb(), { baselineVersion:first, candidateVersion:second, heldOutProjectId }), null, 2));
} else if (command === "list-cases" && first) {
  console.log(JSON.stringify(getDb().prepare("SELECT id,subject_type,subject_id,label,protected,synthetic,created_at FROM evaluation_cases WHERE project_id=? ORDER BY created_at").all(first), null, 2));
} else if (command === "adjudicate" && first && second) {
  const [projectId, subjectType, subjectId, label, note] = process.argv.slice(4);
  if (!["project","shot","clip","audio_segment","review_note"].includes(subjectType ?? "") || !["accept","reject","hold"].includes(label ?? "") || !note) throw new Error("adjudicate needs <projectId> <subjectType> <subjectId> <accept|reject|hold> <note>");
  console.log(JSON.stringify(adjudicateRetainedEvidence(getDb(),{projectId:projectId!,subjectType:subjectType as "project"|"shot"|"clip"|"audio_segment"|"review_note",subjectId:subjectId!,label:label as EvaluationLabel,note,protected:false,factual:false,synthetic:false}), null, 2));
} else {
  throw new Error("Usage: list-cases <project> | adjudicate <project> <subject-type> <id> <label> <note> | export <version> | import <version> <json-file> | compare <baseline> <candidate> [held-out-project-id]");
}
