/** Verified against https://kling.ai/document-api/api/video/avatar, 2026-10-14.
 * Descriptions are soft prompt intent, never independent numeric controls. */
export const AVATAR_ENDPOINT = "/v1/videos/avatar/image2video";
export const AVATAR_CAPABILITY_SOURCE = "https://kling.ai/document-api/api/video/avatar";
export const AVATAR_RESERVATION_RATE_USD = 0.112;
/** Dan's standing creative preference, 2026-10-14; not a Kling service default. */
export const NEUTRAL_POSITIVE_AVATAR_PROFILE_ID = "dan-neutral-positive-v1";
export const NEUTRAL_POSITIVE_AVATAR_PROMPT = "Smiling warmly at the camera, the character exudes a calm and confident demeanor, standing still with a gentle expression.";
export const AVATAR_PERFORMANCE_POLICY = `Dan's approved Kling Avatar preference: for most source-grounded neutral or positive speaking performances, prefer the profile ${NEUTRAL_POSITIVE_AVATAR_PROFILE_ID}: "${NEUTRAL_POSITIVE_AVATAR_PROMPT}". Never use this smiling baseline for negative speech such as "You brood of vipers!", rebuke, anger, grief, fear or distress. Use a passage-appropriate override and retain its source basis and why the baseline does not fit. Do not classify a passage from isolated keywords or verse labels; use its verified reference, surrounding passage, source performance and accepted treatment. Uncertain treatment is not positive by default. In saved Avatar direction, emotionalRegister neutral or positive makes this baseline eligible; retain more specific performance descriptions in the remaining intent fields. Explicit prompt overrides, including empty text, take precedence. Preserve approved performances, identity, source words/speed, cost/review gates and existing continuity; no automatic regeneration follows this preference.`;
export interface ActingIntent {
  emotionalRegister?: string; intensity?: string; gaze?: string; head?: string;
  body?: string; hands?: string; camera?: string; progression?: string;
}
export interface AvatarDirection {
  version: 1;
  baseline: { id: string; evidence: string; prompt?: string; mode?: "std" | "pro" };
  intent: ActingIntent;
  overrides: { prompt?: string; mode?: "std" | "pro" };
  reason: string;
  sourceEvidence: string;
  continuityGroup: string;
  requiredControls: string[];
}
const intentFields = ["emotionalRegister", "intensity", "gaze", "head", "body", "hands", "camera", "progression"] as const;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
function keys(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error("Unsupported Avatar field; retain and resolve required controls before spending.");
}
export function validateAvatarDirection(value: unknown): asserts value is AvatarDirection {
  keys(value, ["version", "baseline", "intent", "overrides", "reason", "sourceEvidence", "continuityGroup", "requiredControls"]);
  if (value.version !== 1) throw new Error("Unsupported Avatar direction version.");
  keys(value.baseline, ["id", "evidence", "prompt", "mode"]);
  keys(value.overrides, ["prompt", "mode"]); keys(value.intent, [...intentFields]);
  if (![value.baseline.id, value.baseline.evidence, value.reason, value.sourceEvidence, value.continuityGroup].every(text)) throw new Error("Avatar direction needs baseline, source, continuity and selection evidence.");
  for (const settings of [value.baseline, value.overrides]) {
    if ("prompt" in settings && (typeof settings.prompt !== "string" || settings.prompt.length > 2500)) throw new Error("Avatar prompt must be a string of at most 2500 characters.");
    if ("mode" in settings && !["std", "pro"].includes(String(settings.mode))) throw new Error("Avatar mode must be std or pro, or omitted.");
  }
  if (Object.values(value.intent).some(v => !text(v))) throw new Error("Acting intent must contain descriptions, not numeric controls.");
  if (!Array.isArray(value.requiredControls) || value.requiredControls.some(v => !["image", "sound_file", "prompt", "mode"].includes(v))) throw new Error("Required Avatar control is unsupported; no silent omission or fallback.");
  // Every neutral instruction must be visibly mapped to the submitted prompt.
  compileAvatarSettings(value as unknown as AvatarDirection);
}
export function compileAvatarSettings(direction?: AvatarDirection): { settings: { prompt?: string; mode?: "std" | "pro" }; omitted: string[]; defaults: Record<string, unknown>; baselineSelection: { profileId:string; authority:string } | null } {
  const settings: { prompt?: string; mode?: "std" | "pro" } = direction ? { ...pick(direction.baseline), ...direction.overrides } : {};
  const register=direction?.intent.emotionalRegister?.trim().toLowerCase();
  const eligible=register==="neutral" || register==="positive";
  const preferred=direction?.baseline.id===NEUTRAL_POSITIVE_AVATAR_PROFILE_ID;
  const explicitOverride=direction?.overrides.prompt!==undefined;
  let baselineSelection:{profileId:string;authority:string}|null=null;
  if(preferred && !explicitOverride && !eligible)throw new Error("The smiling Avatar baseline requires a source-grounded neutral or positive treatment; use a passage-appropriate override for negative or unresolved speech.");
  if(eligible && settings.prompt===undefined){
    settings.prompt=NEUTRAL_POSITIVE_AVATAR_PROMPT;
    baselineSelection={profileId:NEUTRAL_POSITIVE_AVATAR_PROFILE_ID,authority:"Dan, 2026-10-14: preferred for most neutral/positive performances; negative speech excluded"};
  }
  const negativeRegister=register && /\b(?:negative|rebuke|angry|anger|grief|grieving|sorrow|mourning|lament|fear|fearful|distress|condemnation)\b/.test(register);
  if(negativeRegister && settings.prompt?.toLowerCase().includes(NEUTRAL_POSITIVE_AVATAR_PROMPT.toLowerCase()))throw new Error("The preferred smiling Avatar prompt conflicts with this negative performance treatment; save a source-grounded override.");
  // These two eligibility labels already resolve to the preferred baseline;
  // keep them in requested intent/selection evidence without altering its text.
  const intent = direction ? intentFields.filter(k => direction.intent[k] && !(eligible && k==="emotionalRegister")).map(k => `${k}: ${direction.intent[k]}`).join("\n") : "";
  if (intent) settings.prompt = [settings.prompt, intent].filter(Boolean).join("\n");
  if (settings.prompt !== undefined && settings.prompt.length > 2500) throw new Error("Compiled Avatar prompt exceeds 2500 characters; revise direction without truncation.");
  if (direction?.requiredControls.some(k => ["prompt", "mode"].includes(k) && !(k in settings))) throw new Error("Required Avatar field is omitted.");
  const omitted = ["prompt", "mode", "audio_id", "watermark_info", "callback_url", "external_task_id"].filter(k => !(k in settings));
  return { settings, omitted, baselineSelection,defaults: { mode: settings.mode === undefined ? "std (documented service default)" : "explicit", prompt: settings.prompt === undefined ? "No documented omission behavior; not GUI equivalence" : "explicit", modelVersion: "not exposed by this endpoint" } };
}
function pick(baseline: AvatarDirection["baseline"]) {
  return { ...(baseline.prompt !== undefined ? {prompt:baseline.prompt} : {}), ...(baseline.mode !== undefined ? {mode:baseline.mode} : {}) };
}
/** Raw Base64 per current official contract, without data-URI prefixes. */
export function buildAvatarRequest(image: string, soundFile: string, direction?: AvatarDirection) {
  if (direction) validateAvatarDirection(direction);
  return { image, sound_file: soundFile, ...compileAvatarSettings(direction).settings };
}
