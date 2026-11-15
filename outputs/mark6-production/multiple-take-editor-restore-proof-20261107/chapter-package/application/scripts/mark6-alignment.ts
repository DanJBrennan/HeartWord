/** Existing aligner with an explicit, isolated preparation budget and durable
 * per-call evidence. No production DB writes, voice, image or video generation. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { alignWithGemini, alignmentKey, alignmentIdentificationPrompt, ALIGNMENT_IDENTIFICATION_SCHEMA } from "../src/pipeline/ingestion/gemini-alignment.js";
import { parseNarratedParagraphTitles } from "../src/pipeline/ingestion/parse-source-text.js";
import { generateJsonWithImagesMetered, GeminiResponseError } from "../src/providers/gemini-text.js";

const { values } = parseArgs({ options: { packet: { type: "string" }, output: { type: "string" },
  execute: { type: "boolean" }, "recover-terminal-json": { type: "boolean" }, "max-usd": { type: "string" }, "env-file": { type: "string" } } });
if (!values.packet || !values.output) throw new Error("Supply --packet <source-packet.json> --output <new-folder>. Default is preparation only; execution additionally requires --execute --max-usd <approved-ceiling>.");
const packetPath = resolve(values.packet), root = resolve(values.output), packet = JSON.parse(readFileSync(packetPath, "utf8"));
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const config = { fastModel: "gemini-3.6-flash", strongModel: "gemini-3.1-pro-preview", maxSegmentMs: 14000 };
const maximum = Number(values["max-usd"] ?? 10);
if (packet.project.language !== "hatam" || packet.project.book !== "mark" || packet.project.chapter !== 6 || packet.bodyCoverage?.complete !== true) throw new Error("Requires the complete, corrected Mark 6 source packet.");
for (const [name, path] of [["hatam", packet.input.hatam], ["reference", packet.input.english], ["audio", packet.input.audio]]) {
  if (hash(path) !== packet.input.sourceHashes[name]) throw new Error(`Pinned ${name} source changed.`);
}
if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 10) throw new Error("This preparation proposal permits an explicitly approved ceiling up to $10, never Mark 5's budget.");
const planPath = join(root, "plan.json");
if (!values.execute) {
  if (existsSync(root)) throw new Error("Retained alignment preparation exists; inspect it rather than replacing it.");
  mkdirSync(root, { recursive: true });
  const fast = packet.alignmentPreflight.fastCalls, strong = packet.alignmentPreflight.maximumStrongCalls;
  writeFileSync(planPath, JSON.stringify({ status: "prepared_not_authorized", sourcePacket: packetPath, sourcePacketSha256: hash(packetPath),
    proposedMaximumUsd: maximum, config, fastCalls: fast, maximumStrongCalls: strong,
    perCallUpperBoundUsd: { fast: .03, strong: .08 }, allCallsAtConservativeBoundsUsd: Math.round((fast * .03 + strong * .08) * 100) / 100,
    maxOutputTokens: 2048, maxSuppliedPromptAndSchemaBytes: 20000, maxAudioBytesPerCall: 500000,
    pricingVerifiedDate: "2026-10-31", pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingScope: "Standard Flash $0.75/$3.75 through 2026-12-31; Pro <=200k input $2/$12 per million input/output tokens, including thinking. Estimate, not invoice.",
    purpose: "Initial chapter announcement, ordered text/audio alignment and uncovered-word/verse evidence; no film production or source approval." }, null, 2), { flag: "wx" });
  console.log(readFileSync(planPath, "utf8"));
} else {
  if (!values["max-usd"]) throw new Error("Execution requires the newly approved --max-usd value explicitly.");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (plan.sourcePacketSha256 !== hash(packetPath) || JSON.stringify(plan.config) !== JSON.stringify(config)) throw new Error("Alignment plan/source changed; prepare and review a new plan.");
  if (new Date() >= new Date("2027-01-01T00:00:00Z")) throw new Error("Pinned Flash pricing expired; verify rates and bounds before spending.");
  const journalPath = join(root, "execution.json");
  const recovering = values["recover-terminal-json"] === true;
  let previous: any;
  if (existsSync(journalPath)) {
    if (!recovering) throw new Error("An execution already exists. Reconcile its receipts; no automatic retry.");
    previous = JSON.parse(readFileSync(journalPath,"utf8"));
    const pending = previous.calls.filter((call:any)=>call.status!=="completed");
    if(previous.status!=="held_uncertain_submission" || pending.length!==1 || pending[0]!==previous.calls.at(-1) ||
      !pending[0].error?.startsWith("Gemini's response wasn't valid JSON despite responseSchema:") ||
      !pending[0].error.includes(" -- raw: ") || previous.uncertainUpperBoundUsd!==pending[0].upperBoundUsd ||
      maximum!==previous.approvedMaximumUsd) throw new Error("Recovery requires one known-terminal legacy JSON parse failure; transport/missing-usage uncertainty stays held.");
    writeFileSync(join(root,"execution-before-recovery.json"),readFileSync(journalPath),{flag:"wx"});
    writeFileSync(join(root,"alignment-before-recovery.json"),readFileSync(join(root,"alignment.json")),{flag:"wx"});
    writeFileSync(join(root,"recovery-plan.json"),JSON.stringify({priorExecutionSha256:hash(journalPath),approvedMaximumUsd:maximum,
      knownTerminalCall:pending[0].index,unreportedCostUpperBoundUsd:pending[0].upperBoundUsd,
      action:"Replay retained results without API calls; omit unusable completed reply; submit only unsubmitted spans and original planned strong fills.",
      maxOutputTokens:4096,thinkingLevel:"low",perCallUpperBoundUsd:{fast:.04,strong:.10},maximumTotalCalls:plan.fastCalls+plan.maximumStrongCalls},null,2),{flag:"wx"});
    pending[0].status="terminal_json_unusable_unreported_cost";
  } else if(recovering) throw new Error("No retained execution to reconcile.");
  if (values["env-file"]) (await import("dotenv")).config({ path: resolve(values["env-file"]) });
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini credential is unavailable; no model call submitted.");
  const state: any = previous ?? { status: "running", approvedMaximumUsd: maximum, spentEstimatedUsd: 0, uncertainUpperBoundUsd: 0, calls: [] as any[] };
  const save = () => writeFileSync(journalPath, JSON.stringify(state, null, 2));
  const replay = previous ? [...previous.calls] : [];
  let replayIndex=0;
  state.status="running";
  if(previous) save(); else writeFileSync(journalPath, JSON.stringify(state), { flag: "wx" });
  const outputTokens=recovering?4096:2048;
  const usableUsage=(usage:any,cost:number,bound:number)=>usage &&
    [usage.promptTokenCount,usage.candidatesTokenCount,usage.thoughtsTokenCount,usage.totalTokenCount].every(n=>Number.isSafeInteger(n)&&n>=0) &&
    usage.promptTokenCount>0 && usage.totalTokenCount>=usage.promptTokenCount+usage.candidatesTokenCount+usage.thoughtsTokenCount &&
    usage.promptTokenCount<=25000 && Number.isFinite(cost) && cost>=0 && cost<=bound;
  try {
    const result = await alignWithGemini({ audioPath: packet.input.audio, verses: packet.verses, chapterTitle: packet.printedChapterTitle,
      titles: parseNarratedParagraphTitles(packet.input.hatam), durationMs: packet.durationMs, gaps: packet.alignmentPreflight.gaps, config,
      identify: async (audio, context, model) => {
        if (state.status !== "running") throw new Error("Alignment is held; no further paid request.");
        const prompt = alignmentIdentificationPrompt(context);
        const audioSha256=createHash("sha256").update(audio).digest("hex"), promptSha256=createHash("sha256").update(prompt).digest("hex");
        if(replayIndex<replay.length){
          const retained=replay[replayIndex++];
          if(retained.model!==model || retained.audioSha256!==audioSha256 || retained.promptSha256!==promptSha256){state.status="held_replay_mismatch";save();throw new Error("Replay differs from retained request; no paid request.");}
          return retained.status==="completed"?retained.result:undefined;
        }
        const bound = model === config.fastModel ? (recovering?.04:.03) : model === config.strongModel ? (recovering?.10:.08) : NaN;
        if (!Number.isFinite(bound) || audio.length > 500000 || Buffer.byteLength(prompt) + Buffer.byteLength(JSON.stringify(ALIGNMENT_IDENTIFICATION_SCHEMA)) > 20000) throw new Error("Alignment request exceeds reviewed model/input bounds.");
        if (state.calls.length >= plan.fastCalls + plan.maximumStrongCalls || state.spentEstimatedUsd + state.uncertainUpperBoundUsd + bound > maximum + 1e-9) {
          state.status = "held_budget_limit"; save(); throw new Error("Alignment spending/call ceiling reached; no request submitted.");
        }
        if (hash(packet.input.audio) !== packet.input.sourceHashes.audio) throw new Error("Source recording changed before submission.");
        const index = state.calls.length + 1, audioPath = join(root, `call-${index}.wav`);
        writeFileSync(audioPath, audio, { flag: "wx" });
        const receipt: any = { index, model, upperBoundUsd: bound, status: "submission_started", audioPath,
          audioSha256: createHash("sha256").update(audio).digest("hex"), promptSha256: createHash("sha256").update(prompt).digest("hex") };
        writeFileSync(join(root, `call-${index}-request.json`), JSON.stringify({ prompt, schema: ALIGNMENT_IDENTIFICATION_SCHEMA, model, maxOutputTokens: outputTokens, ...(recovering?{thinkingLevel:"low"}:{}) }), { flag: "wx" });
        state.calls.push(receipt); state.uncertainUpperBoundUsd = Math.round((state.uncertainUpperBoundUsd+bound)*1e6)/1e6; save();
        try {
          const response = await generateJsonWithImagesMetered(prompt, [{ mimeType: "audio/wav", data: audio.toString("base64") }], ALIGNMENT_IDENTIFICATION_SCHEMA, model, { maxOutputTokens: outputTokens, ...(recovering?{thinkingLevel:"low" as const}:{}) });
          if (!usableUsage(response.usage,response.costUsd,bound)) throw new Error("Usage is unreported or exceeds the reviewed per-call bound.");
          Object.assign(receipt, { status: "completed", usage: response.usage, estimatedCostUsd: response.costUsd, result: response.result });
          state.spentEstimatedUsd = Math.round((state.spentEstimatedUsd + response.costUsd) * 1e6) / 1e6;
          state.uncertainUpperBoundUsd = Math.round((state.uncertainUpperBoundUsd-bound)*1e6)/1e6; save(); return response.result;
        } catch (error) {
          if(error instanceof GeminiResponseError && usableUsage(error.receipt.usage,error.receipt.costUsd,bound)){
            Object.assign(receipt,{status:"terminal_json_unusable_metered",usage:error.receipt.usage,estimatedCostUsd:error.receipt.costUsd,
              finishReason:error.receipt.finishReason,rawText:error.receipt.rawText,error:error.message});
            state.spentEstimatedUsd=Math.round((state.spentEstimatedUsd+error.receipt.costUsd)*1e6)/1e6;
            state.uncertainUpperBoundUsd=Math.round((state.uncertainUpperBoundUsd-bound)*1e6)/1e6;save();return undefined;
          }
          receipt.error = String((error as Error).message).split(process.env.GEMINI_API_KEY!).join("[redacted]");
          receipt.status = "held_reconcile_before_retry"; state.status = "held_uncertain_submission"; save(); throw error;
        }
      } });
    state.status = state.status === "running" ? "completed_provisional" : state.status;
    writeFileSync(join(root, recovering?"alignment-recovered.json":"alignment.json"), JSON.stringify({ result, sourceHash: alignmentKey(packet.input.audio, packet.verses, config, packet.printedChapterTitle ?? ""),
      sourceHashes: packet.input.sourceHashes, sourceApproval: "not_inferred", executionStatus: state.status }, null, 2), { flag: "wx" }); save();
    console.log(JSON.stringify({ status: state.status, calls: state.calls.length, estimatedCostUsd: state.spentEstimatedUsd,
      coverage: result.coverage, uncoveredVerses: result.uncoveredVerses }));
  } catch (error) {
    if (state.status === "running") state.status = "held_local_failure"; save();
    throw new Error(String((error as Error).message).split(process.env.GEMINI_API_KEY!).join("[redacted]"));
  }
}
