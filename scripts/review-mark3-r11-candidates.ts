/** Screen retained Mark 3 r11 corrections; evidence never auto-selects a take. */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";

const root = join(getDataDir(), "assets"), db = getDb();
const names = ["synagogue-entry-motion", "synagogue-ots-man", "synagogue-leaders-same-room",
  "healed-man-joy", "healing-crowd-joy", "synagogue-angry-leaders",
  "house-jesus-canon", "house-listeners-ots", "house-canon-lateral", "house-canon-listener-close"];
const chosen = process.argv[2];
if (chosen && !names.includes(chosen)) throw new Error(`Unknown candidate ${chosen}`);
const results = [];
for (const name of names.filter(n => !chosen || n === chosen)) {
  const marker = `mark3-r11-${name}-v1`;
  const row = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE prompt LIKE ? AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1")
    .get(`${marker}%`) as { result_asset_path: string | null } | undefined;
  if (!row?.result_asset_path) throw new Error(`Candidate missing: ${marker}`);
  const path = join(root, row.result_asset_path);
  const review = await generateJsonWithImages<{
    visualPass: boolean; canonPass: boolean; noInventedSpeech: boolean; nativeAmbience: boolean;
    continuityPass: boolean; concern: string; confidence: number;
  }>(`Watch and listen to this entire five-second Mark 3 non-lip-sync correction: ${name}. ` +
    "Judge physical motion, first-century Capernaum room continuity, Papuan casting, the approved cream-mantle Jesus if visible, costume and anatomy. " +
    "For the healed man: he must visibly feel joy about his restored left hand, with five natural fingers. For the crowd: independently timed amazed reactions, shouts/gasps and claps may be nonverbal but there must be no intelligible new dialogue or chant. " +
    "For leaders: disappointment and contained anger before exit. For the house: no suspicious Jesus, white-cast drift or different building. " +
    "Check native ambience is audible. State concrete limitations; this screening is not producer approval.",
    [{ mimeType: "video/mp4", data: readFileSync(path).toString("base64") }],
    { type: "object", properties: { visualPass: { type: "boolean" }, canonPass: { type: "boolean" }, noInventedSpeech: { type: "boolean" },
      nativeAmbience: { type: "boolean" }, continuityPass: { type: "boolean" }, concern: { type: "string" }, confidence: { type: "number" } },
      required: ["visualPass", "canonPass", "noInventedSpeech", "nativeAmbience", "continuityPass", "concern", "confidence"] });
  results.push({ name, path, review });
  console.log(JSON.stringify({ name, review }));
}
const output = join(root, "generated/keyframes/mark3-r11-revision", chosen ? `${chosen}-motion-review-v1.json` : "motion-review-v1.json");
writeFileSync(output, JSON.stringify({ results, status: "held_for_producer_review" }, null, 2), { flag: "wx" });
