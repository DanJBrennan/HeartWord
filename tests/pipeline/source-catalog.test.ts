import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let root = "";
vi.mock("../../src/db/client.js", () => ({ getDataDir: () => root }));
const put = (path: string, value = "source") => { const full = join(root, "assets", path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, value); };
const project = { id: "mark-3", language: "hatam", book: "mark", chapter: 3 };
function corpus() {
  put("source/hatam/text/Mark/Mark 3.docx", "hatam text");
  put("source/english-esv/text/Mark/Mark 3.docx", "english reference");
  put("source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___03_Markus______HADLAIN1DA.mp3", "non drama");
  put("source/hatam/audio/Hatam_had_LAI_NT_Drama/B02___03_Markus______HADLAIN2DA.mp3", "drama");
}
function db() { const value = new DatabaseSync(":memory:"); value.exec("CREATE TABLE project_source_bindings(project_id TEXT PRIMARY KEY,docx_path TEXT,audio_path TEXT,reference_path TEXT,audio_edition TEXT,docx_hash TEXT,audio_hash TEXT,reference_hash TEXT,provenance TEXT,bound_at INTEGER)"); return value; }
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = ""; });

it("discovers a fresh Mark 3 directly in the immutable corpus with Non-Drama selected", async () => {
  root = mkdtempSync(join(tmpdir(), "heartword-catalog-")); corpus();
  const { discoverSourcePaths } = await import("../../src/pipeline/ingestion/source-catalog.js");
  const paths = discoverSourcePaths(project);
  expect(paths).toMatchObject({ edition: "non_drama", provenance: "catalog", audioRelPath: "source/hatam/audio/Hatam_had_LAI_NT_Non-Drama/B02___03_Markus______HADLAIN1DA.mp3" });
  expect(paths.docxPath).toContain("source\\hatam\\text\\Mark\\Mark 3.docx");
  expect(paths.referencePath).toContain("source\\english-esv\\text\\Mark\\Mark 3.docx");
  expect(paths.audioPath).toContain("HADLAIN1DA.mp3");
  expect(() => discoverSourcePaths({ ...project, book: "genesis", chapter: 1 })).toThrow("Hatam FCBH audio");
});

it("binds paths and hashes without copying corpus media, then rejects a changed bound input", async () => {
  root = mkdtempSync(join(tmpdir(), "heartword-catalog-")); corpus(); const database = db();
  const { resolveAndBindSourcePaths } = await import("../../src/pipeline/ingestion/source-catalog.js");
  const first = resolveAndBindSourcePaths(database, project);
  expect(database.prepare("SELECT audio_edition,provenance FROM project_source_bindings WHERE project_id='mark-3'").get()).toMatchObject({ audio_edition: "non_drama", provenance: "catalog" });
  expect(first.audioPath).toContain("Hatam_had_LAI_NT_Non-Drama");
  expect(resolveAndBindSourcePaths(database, project).audioPath).toBe(first.audioPath);
  writeFileSync(first.audioPath, "changed source");
  expect(() => resolveAndBindSourcePaths(database, project)).toThrow("Bound source inputs changed");
  expect(existsSync(join(root, "assets", "source", "hatam", "mark-3"))).toBe(false);
  database.close();
});
