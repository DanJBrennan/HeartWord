import { createHash } from "node:crypto";

/** Supplied text/schema bytes only. Provider instructions and image tokens are
 * additional; actual token usage must be retained from the response. */
export function crewInputBudget(prompt: string, schema: unknown, maxBytes: number): { suppliedTextBytes: number; sha256: string } {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1000) throw new Error("Crew supplied-text byte limit must be an integer >= 1000.");
  const suppliedTextBytes = Buffer.byteLength(prompt, "utf8") + Buffer.byteLength(JSON.stringify(schema), "utf8");
  if (suppliedTextBytes > maxBytes) throw new Error(`Crew input held before submission: ${suppliedTextBytes} supplied text/schema UTF-8 bytes exceed ${maxBytes}. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.`);
  return { suppliedTextBytes, sha256: createHash("sha256").update(JSON.stringify({ prompt, schema })).digest("hex") };
}
