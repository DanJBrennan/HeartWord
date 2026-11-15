/** Screening evidence for the held Mark 3 -> Mark 4 motion and native sound. */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { generateJsonWithImages } from "../src/providers/gemini-text.js";

const root = join(getDataDir(), "assets"), db = getDb();
const tasks = [
  { name: "interior-departure", frame: "last-wide-source-v1.png", direction: "Jesus rises from the same seated crowd and walks toward the same house doorway." },
  { name: "street-to-sea", frame: "exterior-departure-v1.png", direction: "Outside the same house Jesus walks toward the sea while a few residents notice and begin to follow." },
  { name: "aerial-retreat", frame: "aerial-retreat-v1.png", direction: "An elevated camera pulls back as Jesus keeps walking toward the sea and becomes smaller; people gather naturally." }
] as const;
const results = [];
for (const task of tasks) {
  const row = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE prompt LIKE ? AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1")
    .get(`mark3-nextchapter-${task.name}-v1%`) as { result_asset_path: string | null } | undefined;
  if (!row?.result_asset_path) throw new Error(`Retained clip missing: ${task.name}`);
  const videoPath = join(root, row.result_asset_path), framePath = join(root, "generated/keyframes/mark3-nextchapter-bridge", task.frame);
  const review = await generateJsonWithImages<{
    visualPass: boolean; continuityPass: boolean; noSpeechOrMouthing: boolean; nativeAmbience: boolean;
    concern: string; confidence: number;
  }>(`Watch and listen to this complete five-second proposed wordless post-source transition. Intended action: ${task.direction} ` +
    "The Mark 3 performance is finished; Mark 4:1 begins teaching beside the sea with a large crowd, but the bridge must not depict teaching or boat use. " +
    "Compare the first frame to the supplied reference and check approved Jesus identity/cream-and-blue wardrobe, first-century basalt setting, geographic screen direction, physically natural motion and independently timed crowd behavior. " +
    "Listen for appropriate native room/footstep/shore ambience and any intelligible or wordless vocal speech; mouths must not speak. Note limitations rather than claiming certainty.",
    [{ mimeType: "video/mp4", data: readFileSync(videoPath).toString("base64"), caption: "Generated transition clip with native sound." },
      { mimeType: "image/png", data: readFileSync(framePath).toString("base64"), caption: "Reviewed first-frame reference." }],
    { type: "object", properties: { visualPass: { type: "boolean" }, continuityPass: { type: "boolean" }, noSpeechOrMouthing: { type: "boolean" },
      nativeAmbience: { type: "boolean" }, concern: { type: "string" }, confidence: { type: "number" } },
      required: ["visualPass", "continuityPass", "noSpeechOrMouthing", "nativeAmbience", "concern", "confidence"] });
  results.push({ name: task.name, videoPath, framePath, review });
  console.log(JSON.stringify({ name: task.name, review }));
}
const out = join(root, "generated/keyframes/mark3-nextchapter-bridge/motion-review-v1.json");
writeFileSync(out, JSON.stringify({ results, status: "held_for_producer_review", limitation: "Automated screening is not producer approval or a native-speaker review." }, null, 2), { flag: "wx" });
