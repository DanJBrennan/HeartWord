import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { GeminiJsonSchema, GeminiMediaInput } from "./gemini-text.js";
import { crewInputBudget } from "./input-budget.js";
import {CODEX_MULTIPART_HEADER,CODEX_MULTIPART_TEXT_LIMIT,executeCodexMultipart,parseCodexMultipartEvents,type MultipartRequest} from './codex-multipart.js';

export const CODEX_CREW_MODEL = "gpt-6.1-sol";
// Per-text-item ceiling; larger bounded requests use the same CLI multipart protocol.
export const CODEX_MAX_INPUT_CHARACTERS = 1_048_576;
export interface CodexUsage { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningOutputTokens: number | null }
export interface CodexReasoningReceipt {
  provider: "codex_cli"; requestedModel: string; reportedModel: string | null; reasoningEffort: "medium";
  authentication: "chatgpt"; billing: "chatgpt_allowance_or_credits"; costUsd: null;
  usage: CodexUsage; suppliedTextBytes: number; inputSha256: string; diagnostics: string[];
}
type Execute = (args: string[], input?: string) => Promise<string>;
const TRANSPORT_NOTICES:readonly [string,RegExp][]=[
  ['stream_reconnect_notice',/\breconnecting\b/i],
  ['rate_limit_notice',/\b429\b|\brate[_ -]limit(?:ed|_exceeded)?\b/i],
  ['stream_interrupted_notice',/\bstream[^\r\n]{0,120}\b(?:disconnected|interrupted)\b/i],
  ['transport_timeout_notice',/\btimed out\b|\btimeout\b|\bdeadline has elapsed\b/i],
  ['connection_error_notice',/\bconnection reset\b|\berror sending request\b|\bfailed to connect\b|\berror decoding response body\b/i],
];
export class CodexExitError extends Error {
  constructor(public readonly exitCode: number | null, public readonly jsonl: string, reason?: string, public readonly diagnosticCodes: string[] = []) {
    super(reason ?? `Codex exited with code ${exitCode}; reconcile the submission before retrying.`);
    this.diagnosticCodes=[...new Set(diagnosticCodes)].filter(code=>TRANSPORT_NOTICES.some(([allowed])=>allowed===code));
  }
}

/** Use argv/stdin directly, never shell interpolation. Ignore user configuration
 * so hooks, MCPs, custom providers and project instructions cannot expand a
 * bounded inference packet. Authentication still uses the existing Codex login.
 * No resume: every role request starts a fresh, ephemeral inference context. */
export function executeCodex(args: string[], input?: string): Promise<string> {
  const timeoutSeconds=Number(process.env.HEARTWORD_CODEX_TIMEOUT_SECONDS??600);
  if(!Number.isInteger(timeoutSeconds)||timeoutSeconds<60||timeoutSeconds>1800)return Promise.reject(new Error("Codex timeout must be 60..1800 seconds; no process started."));
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const child = spawn(process.env.HEARTWORD_CODEX_BIN || "codex", args, { env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", bytes = 0, stopped = false, diagnosticTail = "";
    const diagnosticCodes=new Set<string>();
    const stop = (message: string) => { if (!stopped) { stopped = true; child.kill(); reject(new CodexExitError(child.exitCode,output,message,[...diagnosticCodes])); } };
    const timer = setTimeout(() => stop("Codex request timed out; reconcile its retained submission before retrying."), timeoutSeconds * 1000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > 8 * 1024 * 1024) stop("Codex output limit exceeded; reconcile before retrying."); else output += chunk; });
    // Consume diagnostics without printing credentials or copying arbitrary CLI
    // stderr into production prompts. JSONL errors remain in the event stream.
    child.stderr.on("data", (chunk: Buffer) => {
      if (args.length === 2 && args[0] === "login" && args[1] === "status" && chunk.toString("utf8").includes("Logged in using ChatGPT")) output = "Logged in using ChatGPT";
      // Never retain arbitrary stderr: it may contain credentials, account IDs
      // or URLs. Bounded split-chunk matching emits only these fixed notices.
      diagnosticTail=(diagnosticTail+chunk.toString('utf8')).slice(-4096);
      for(const [code,pattern]of TRANSPORT_NOTICES)if(pattern.test(diagnosticTail))diagnosticCodes.add(code);
    });
    child.on("error", () => { clearTimeout(timer); stop("Codex executable could not start; no provider fallback was attempted."); });
    child.on("close", code => { clearTimeout(timer); if (stopped) return; stopped = true;
      if (code !== 0) reject(new CodexExitError(code, output,undefined,[...diagnosticCodes])); else resolve(output); });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

/** Gemini nullable/optional fields become standard strict JSON Schema. The
 * semantic crew validator still enforces ownership and film acceptance. */
export function codexOutputSchema(schema: GeminiJsonSchema): GeminiJsonSchema {
  const convert = (node: any): any => {
    if (!node || typeof node !== "object") return node;
    const { nullable, ...copy } = node;
    if (copy.properties) {
      const required = new Set(copy.required ?? []);
      copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([key, value]) => {
        const converted = convert(value);
        return [key, required.has(key) ? converted : { anyOf: [converted, { type: "null" }] }];
      }));
      copy.required = Object.keys(copy.properties); copy.additionalProperties = false;
    }
    if (copy.items) copy.items = convert(copy.items);
    return nullable ? { anyOf: [copy, { type: "null" }] } : copy;
  };
  return convert(schema);
}

export function stripOptionalNulls(value: any, original: any): any {
  if (Array.isArray(value)) return value.map(v => stripOptionalNulls(v, original?.items));
  if (value && typeof value === "object") {
    const required = new Set(original?.required ?? []);
    return Object.fromEntries(Object.entries(value).filter(([k, v]) => v !== null || required.has(k))
      .map(([k, v]) => [k, stripOptionalNulls(v, original?.properties?.[k])]));
  }
  return value;
}

export function parseCodexEvents(jsonl: string): { result: unknown; usage: CodexUsage; reportedModel: string | null; diagnostics: string[] } {
  const events = jsonl.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if(events.some(e=>e.method))return parseCodexMultipartEvents(jsonl);
  const completedIndex = events.findIndex(e => e.type === "turn.completed");
  // The CLI can reconnect its own transport before completing the same turn.
  // Only these observed notices, before a genuine completion, are nonterminal.
  const reconnect = (e:any,index:number) => index < completedIndex && e.type === "error" &&
    typeof e.message === "string" && /^Reconnecting\.\.\. [1-5]\/5 \(stream disconnected before completion: websocket closed by server before response\.completed\)$/.test(e.message);
  const httpsRecovery = (e:any,index:number) => index < completedIndex && e.type === "item.completed" && e.item?.type === "error" &&
    e.item.message === "Falling back from WebSockets to HTTPS transport. stream disconnected before completion: websocket closed by server before response.completed";
  if (events.some((e,i) => e.type === "turn.failed" || (e.type === "error" && !reconnect(e,i)))) throw new Error("Codex turn failed; no review or fallback was accepted.");
  // Installed CLI emits this fail-closed diagnostic when the tool host is
  // deliberately disabled, even when the subsequent inference completes.
  const disabledHost = (e: any) => e.item?.type === "error" && typeof e.item.message === "string" &&
    /^Code Mode is unavailable because code-mode host is disabled\./.test(e.item.message) && e.item.message.includes("fail closed");
  const diagnostics = [...events.filter(disabledHost).map(e => String(e.item.message)),
    ...(events.some(reconnect)?["stream_reconnect_notice"]:[]),
    ...(events.some(httpsRecovery)?["https_transport_recovery_notice"]:[])];
  const unexpected = events.filter((e,i) => e.type?.startsWith("item.") && !["agent_message", "reasoning"].includes(e.item?.type) && !disabledHost(e) && !httpsRecovery(e,i));
  if (unexpected.length) throw new Error(`Codex returned unsupported item types (${[...new Set(unexpected.map(e => String(e.item?.type)))].join(", ")}); retain and reconcile the submission.`);
  const completed = events.filter(e => e.type === "turn.completed");
  const messages = events.filter(e => e.type === "item.completed" && e.item?.type === "agent_message");
  if (completed.length !== 1 || !messages.length) throw new Error("Codex returned no unambiguous completed turn.");
  const u = completed[0].usage;
  for (const key of ["input_tokens", "cached_input_tokens", "output_tokens"]) if (!Number.isSafeInteger(u?.[key]) || u[key] < 0) throw new Error("Codex usage is missing or invalid.");
  if (u.cached_input_tokens > u.input_tokens) throw new Error("Codex cached input exceeds total input.");
  return { result: JSON.parse(messages.at(-1)!.item.text),
    usage: { inputTokens: u.input_tokens, cachedInputTokens: u.cached_input_tokens, outputTokens: u.output_tokens,
      reasoningOutputTokens: Number.isSafeInteger(u.reasoning_output_tokens) ? u.reasoning_output_tokens : null },
    reportedModel: completed[0].model ?? null, diagnostics };
}

export function codexPrompt(prompt:string,media:GeminiMediaInput[]):string {
 const legacy="Return only the requested JSON. Do not call tools, inspect files, browse, delegate or read any history. All evidence is supplied in this request.\n" +
    media.map((m, i) => `Attached image ${i + 1}: ${m.caption ?? "No caption supplied"}`).join("\n") + "\n" + prompt;
 return legacy.length>CODEX_MAX_INPUT_CHARACTERS?CODEX_MULTIPART_HEADER+legacy:legacy;
}
function assertTransportLength(input: string) {
  // UTF-16 length is conservative for supplementary Unicode characters.
  if (input.length > CODEX_MULTIPART_TEXT_LIMIT) throw new Error("Codex transport character limit exceeded before submission; split the task context.");
}
/** Exact supplied protocol/schema/caption bytes; image tokens remain separate. */
export function codexInputBudget(prompt:string,schema:GeminiJsonSchema,media:GeminiMediaInput[],maxBytes:number){
 const input=codexPrompt(prompt,media);assertTransportLength(input);
 return crewInputBudget(input,codexOutputSchema(schema),maxBytes);
}
export async function generateCodexJson(prompt: string, schema: GeminiJsonSchema, media: GeminiMediaInput[] = [], options: {
  maxSuppliedTextBytes: number; execute?: Execute; executeMultipart?:(request:MultipartRequest)=>Promise<string>; beforeSubmit?: (input: { suppliedTextBytes: number; sha256: string }) => void;
  retainResponse?: (jsonl: string, transport?: { succeeded: boolean; exitCode: number | null; reason?: string; diagnosticCodes?:string[] }) => void;
}): Promise<{ result: unknown; receipt: CodexReasoningReceipt }> {
  const execute = options.execute ?? executeCodex;
  if (media.some(m => !["image/png", "image/jpeg", "image/webp"].includes(m.mimeType))) throw new Error("Codex crew route accepts still images only. Audio/video needs an explicitly selected audiovisual review provider.");
  if (media.length > 16 || media.reduce((n, m) => n + Buffer.byteLength(m.data, "base64"), 0) > 16 * 1024 * 1024) throw new Error("Codex image attachment budget exceeded before submission.");
  const strictSchema = codexOutputSchema(schema);
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(strictSchema);
  const input = codexPrompt(prompt,media);
  assertTransportLength(input);
  const budget = crewInputBudget(input, strictSchema, options.maxSuppliedTextBytes);
  if(input.length>CODEX_MAX_INPUT_CHARACTERS&&options.execute&&!options.executeMultipart)throw Error('Injected Codex execution requires an explicit multipart executor; no process started.');
  const status = await execute(["login", "status"]);
  if (!status.includes("Logged in using ChatGPT")) throw new Error("Codex crew requires verified ChatGPT login; API-key billing is not enabled by this route.");
  const root = await mkdtemp(join(tmpdir(), "heartword-reasoning-"));
  try {
    const schemaPath = join(root, "response.schema.json");
    await writeFile(schemaPath, JSON.stringify(strictSchema));
    const args = ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--cd", root,
      "--model", CODEX_CREW_MODEL, "-c", 'model_reasoning_effort="medium"', "-c", 'web_search="disabled"', "--json", "--color", "never", "--output-schema", schemaPath];
    for (const feature of ["apps", "browser_use", "computer_use", "multi_agent", "code_mode_host", "shell_tool", "skill_search", "memories"]) args.push("--disable", feature);
    const imagePaths:string[]=[];
    for (const [i, m] of media.entries()) {
      const path = join(root, `image-${i + 1}.${m.mimeType === "image/png" ? "png" : m.mimeType === "image/webp" ? "webp" : "jpg"}`);
      await writeFile(path, Buffer.from(m.data, "base64")); args.push("--image", path);imagePaths.push(path);
    }
    args.push("-");
    const multipart=input.length>CODEX_MAX_INPUT_CHARACTERS;let submitted=false;
    const beforeStart=()=>{options.beforeSubmit?.(budget);submitted=true;};
    if(!multipart)beforeStart();
    let jsonl: string;
    try { jsonl = multipart?await (options.executeMultipart??(r=>executeCodexMultipart(r,(code,out,reason)=>new CodexExitError(code,out,reason))))({input,schema:strictSchema,images:imagePaths,cwd:root,model:CODEX_CREW_MODEL,beforeStart}):await execute(args, input); }
    catch (error) {
      if (submitted&&error instanceof CodexExitError) options.retainResponse?.(error.jsonl, { succeeded: false, exitCode: error.exitCode, reason:error.message,...(error.diagnosticCodes.length?{diagnosticCodes:error.diagnosticCodes}:{}) });
      throw error;
    }
    if(!submitted)throw Error('Codex multipart executor did not confirm the bounded submission.');
    options.retainResponse?.(jsonl, { succeeded: true, exitCode: 0 });
    const parsed = parseCodexEvents(jsonl);
    if (!validate(parsed.result)) throw new Error("Codex response failed local JSON Schema validation; no contribution was accepted.");
    return { result: stripOptionalNulls(parsed.result, schema), receipt: { provider: "codex_cli", requestedModel: CODEX_CREW_MODEL,
      reportedModel: parsed.reportedModel, reasoningEffort: "medium", authentication: "chatgpt", billing: "chatgpt_allowance_or_credits",
      costUsd: null, usage: parsed.usage, suppliedTextBytes: budget.suppliedTextBytes, inputSha256: budget.sha256, diagnostics: parsed.diagnostics } };
  } finally {
    // Only this invocation's mkdtemp directory, never a computed project path.
    await rm(root, { recursive: true, force: true, maxRetries:5, retryDelay:100 });
  }
}
