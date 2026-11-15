/** One-off drill adapter: the normal helper checks all ancestors for links.
 * Node grants directory read recursively, so granting C:\Users\danbr merely
 * for lstat would also grant live production. Replay only independently
 * preflighted ancestor metadata; all file contents remain permission gated.
 * The captured application and normal restore implementation are unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

const certificate = JSON.parse(fs.readFileSync("outputs/disaster-backup-boundary-metadata-20261025.json", "utf8"));
assert(Date.now() - Date.parse(certificate.at) < 10 * 60 * 1000, "Refresh ancestor preflight before starting the drill");
const key = (path: unknown) => typeof path === "string" ? resolve(path.replace(/^\\\\\?\\/, "")).toLowerCase() : "";
const boundaries = new Set<string>(certificate.ancestors.map((row: {path:string;directory:boolean;symbolicLink:boolean}) => {
  assert(row.directory && !row.symbolicLink, "Untrusted restoration ancestor");
  return key(row.path);
}));
const exists = fs.existsSync, lstat = fs.lstatSync;
export const deferredFlushPaths = new Set<string>();
const write = fs.writeFileSync;
const restorePrefix = key(process.argv[3]);
fs.writeFileSync = ((path: Parameters<typeof write>[0], data: Parameters<typeof write>[1], options: unknown) => {
  if (options && typeof options === "object" && (options as {flush?:boolean}).flush) {
    // Node's permission model disables fsync even on allowed files. The outer
    // worker durably flushes these newly restored metadata files after success.
    const target=key(path);
    assert(restorePrefix && (target===restorePrefix || target.startsWith(restorePrefix+"\\") || target.startsWith(restorePrefix+"-")), "Deferred flush must belong to this isolated drill");
    deferredFlushPaths.add(String(path));
    return write(path,data,{...options,flush:false});
  }
  return (write as Function)(path,data,options);
}) as typeof write;
const cached = (path: unknown) => boundaries.has(key(path)) && !process.permission?.has("fs.read", String(path));
fs.existsSync = ((path: Parameters<typeof exists>[0]) => cached(path) ? true : exists(path)) as typeof exists;
fs.lstatSync = ((path: Parameters<typeof lstat>[0], ...options: unknown[]) => cached(path)
  ? { isSymbolicLink: () => false }
  : (lstat as Function)(path, ...options)) as typeof lstat;
// A cloud recall error can omit the filename. Preserve exact read progress and
// attach that filename to failures without swallowing or retrying an error.
const stream = fs.createReadStream;
let completedReads = 0, completedBytes = 0, lastProgressAt = 0;
function progress(path: unknown, state: string, detail: unknown = undefined) {
  const now = Date.now();
  if (state === "reading" && now - lastProgressAt < 10000) return;
  lastProgressAt = now;
  fs.writeFileSync("outputs/disaster-backup-cloud-read-progress-20261025.json", JSON.stringify({
    at:new Date(now).toISOString(), pid:process.pid, state, path:String(path), completedReads, completedBytes, detail
  },null,2));
}
fs.createReadStream = ((path: Parameters<typeof stream>[0], ...options: unknown[]) => {
  progress(path,"reading");
  const input = (stream as Function)(path,...options) as fs.ReadStream;
  input.once("end", () => { completedReads++; completedBytes += input.bytesRead; progress(path,"reading"); });
  input.once("error", error => { error.message += ` (backup read: ${String(path)})`; progress(path,"failed",{message:error.message,code:(error as NodeJS.ErrnoException).code}); });
  return input;
}) as typeof stream;
syncBuiltinESMExports();
export const ancestorMetadataEvidence = { path:"outputs/disaster-backup-boundary-metadata-20261025.json", checked:boundaries.size, method:"preflight metadata only; no ancestor content permission granted" };
