import "dotenv/config";

/** Runs the existing composite Critic/QC pass against only the held Mark 4
 * Jesus coverage candidates. It writes ordinary review evidence, never
 * accepts a candidate, selects media, or submits video generation. */
import { runKeyframeCandidateReview } from "../src/pipeline/qc/director.js";

const ids = [
  "d2e15f8b-d2b1-4e82-a989-6e8f0c6bb665",
  "173b8d3a-5f27-4c46-9525-dd521b185097",
  "df4f26b9-8b73-4c0a-bd7f-1a5606dd054e",
  "e62901ce-ca60-4f29-8274-16ecb33567e0",
  "bcc82f86-0a7d-4da8-a7c2-4a07926024a4",
  "4f6db394-9055-4198-91f2-aa1008d38df7",
  "5f3351e6-a5bf-4d4a-a2bc-55ef6a47381c",
  "1163d531-6d06-4169-83ac-b0ca62e8c010",
  "0278ef8d-9960-461e-9536-711a884e70ac",
  "32cc82f1-fb4a-4808-bcf6-ce4558e1ff69",
  "126e8c1f-4a20-456f-83eb-c0f8eeaea0ee",
  "538cb8fb-a09d-4873-9975-41627e4a2c5c"
];

const results: Array<{ id: string; criticSeverity: string; likenessAligned: boolean; fidelityAligned: boolean; decision: string }> = [];
for (const id of ids) {
  const result = await runKeyframeCandidateReview(id);
  results.push({
    id,
    criticSeverity: result.critic.severity,
    likenessAligned: result.likenessAligned,
    fidelityAligned: result.fidelityAligned,
    decision: result.decision.status
  });
  console.log(JSON.stringify(results.at(-1)));
}
console.log(JSON.stringify({ completed: results.length, results }, null, 2));
