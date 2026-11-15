import { writeFileSync } from "node:fs";
import { generateCodexJson } from "../../src/providers/codex-text.js";

const output = "outputs/mark6-preparation/codex-smoke-v2-result.json";
const response = await generateCodexJson('Return {"status":"ready","chapter":6}. This is a transport check, not film or source approval.',
  { type: "object", properties: { status: { type: "string", enum: ["ready"] }, chapter: { type: "integer", enum: [6] } }, required: ["status", "chapter"] }, [],
  { maxSuppliedTextBytes: 5000, retainResponse: jsonl => writeFileSync("outputs/mark6-preparation/codex-smoke-v2-response.jsonl", jsonl, {flag:"wx"}), beforeSubmit: input => writeFileSync("outputs/mark6-preparation/codex-smoke-v2-submission.json",
    JSON.stringify({ requestedModel: "gpt-6.1-sol", reasoningEffort: "medium", purpose: "transport-only", input, submittedAt: new Date().toISOString() }, null, 2), { flag: "wx" }) });
writeFileSync(output, JSON.stringify(response, null, 2), { flag: "wx" });
console.log(JSON.stringify(response));
