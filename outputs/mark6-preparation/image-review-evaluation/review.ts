import { readFileSync, writeFileSync } from "node:fs";
import { generateCodexJson } from "../../../src/providers/codex-text.js";
const root = "outputs/mark6-preparation/image-review-evaluation";
const response = await generateCodexJson("Inspect both supplied candidate still images independently. For each, identify whether any short-haired man wearing light clothing is visible in the foreground at the right edge, and cite visible evidence. Also describe the main man's hair and garment. Do not infer who any character is from appearance. Do not infer audio, lip-sync, movement, Scripture fidelity or approval from these stills. Return one inspection for each supplied label.",
  { type: "object", properties: { inspections: { type: "array", minItems: 2, maxItems: 2, items: { type: "object",
    properties: { label: { type: "string", enum: ["candidate-a", "candidate-b"] }, shortHairedForegroundManVisible: { type: "boolean" }, evidence: { type: "string" } }, required: ["label", "shortHairedForegroundManVisible", "evidence"] } },
    limitations: { type: "string" } }, required: ["inspections", "limitations"] },
  ["candidate-a", "candidate-b"].map(label => ({ mimeType: "image/png", data: readFileSync(`${root}/${label}.png`).toString("base64"), caption: label })),
  { maxSuppliedTextBytes: 10000,
    beforeSubmit: input => writeFileSync(`${root}/submission.json`, JSON.stringify(input, null, 2), { flag: "wx" }),
    retainResponse: jsonl => writeFileSync(`${root}/response.jsonl`, jsonl, { flag: "wx" }) });
writeFileSync(`${root}/result.json`, JSON.stringify(response, null, 2), { flag: "wx" });
const inspections = (response.result as any).inspections;
const matches = inspections.length === 2 && new Set(inspections.map((x: any) => x.label)).size === 2 &&
  inspections.find((x: any) => x.label === "candidate-a")?.shortHairedForegroundManVisible === true &&
  inspections.find((x: any) => x.label === "candidate-b")?.shortHairedForegroundManVisible === false;
writeFileSync(`${root}/evaluation.json`, JSON.stringify({ matchesKnownVisibleDifference: matches,
  evaluated: "Two retained stills from a known producer-reported defect and its repair. Ground truth was not included in the inference prompt.",
  notEvaluated: ["canon identity correctness", "lip sync", "audio", "motion", "general video review reliability"] }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ matchesKnownVisibleDifference: matches, receipt: response.receipt }));
