import "dotenv/config";
import { getDb } from "../src/db/client.js";

async function run() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT narration_span_verse_ref, idea_id, round, role, verdict, content, created_at
       FROM director_negotiation_log ORDER BY narration_span_verse_ref, idea_id, round, created_at`
    )
    .all() as Array<{
    narration_span_verse_ref: string;
    idea_id: string;
    round: number;
    role: string;
    verdict: string | null;
    content: string;
    created_at: number;
  }>;

  let lastGap = "";
  let lastIdea = "";
  for (const row of rows) {
    if (row.narration_span_verse_ref !== lastGap) {
      console.log(`\n\n${"=".repeat(80)}\nGAP: ${row.narration_span_verse_ref}\n${"=".repeat(80)}`);
      lastGap = row.narration_span_verse_ref;
      lastIdea = "";
    }
    if (row.idea_id !== lastIdea) {
      console.log(`\n--- idea ${row.idea_id.slice(0, 8)} ---`);
      lastIdea = row.idea_id;
    }
    if (row.role === "creative_director") {
      const idea = JSON.parse(row.content);
      console.log(`  [round ${row.round}] Creative Director proposes: "${idea.label}" (${idea.operation}) -- ${idea.description}`);
    } else {
      console.log(`  [round ${row.round}] Production Director: ${row.verdict?.toUpperCase()} -- ${row.content}`);
    }
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
