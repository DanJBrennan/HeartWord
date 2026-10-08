import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>, directory: string;
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => directory }));
vi.mock("../../src/providers/elevenlabs.js", () => ({ reVoiceAudio: vi.fn(async () => ({ audioBuffer: Buffer.from("new cast audio"), requestSettings: { model_id: "fixture-sts", remove_background_noise: true, output_format: "mp3_44100_128" } })) }));
vi.mock("../../src/pipeline/ingestion/detect-silences.js", () => ({ getAudioDurationMs: () => 1000 }));
vi.mock("../../src/pipeline/voicing/extract-clip.js", () => ({ extractClip: (_s: string, _a: number, _b: number, out: string) => writeFileSync(out, "extracted audio", { flag: "wx" }) }));
import { runVoicing } from "../../src/pipeline/voicing/index.js";
import { reVoiceAudio } from "../../src/providers/elevenlabs.js";
beforeEach(() => {
  vi.clearAllMocks(); directory = mkdtempSync(join(tmpdir(), "heartword-voicing-retention-")); mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "assets", "source.mp3"), "source");
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',4,1,1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Jesus','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,created_at) VALUES ('v','c','v1','approved','elevenlabs','voice',1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at) VALUES
    ('one','p','original_reading','source.mp3',0,1000,'c',1),('two','p','original_reading','source.mp3',1000,2000,'c',1);`);
});
afterEach(() => { db.close(); if (resolve(directory).startsWith(resolve(tmpdir(), "heartword-voicing-retention-"))) rmSync(directory, { recursive: true, force: true }); });
it("scoped voicing cannot collide by loop index; forced revisions retain old files and exact mappings", async () => {
  await runVoicing("p", { sourceSegmentIds: ["one"] });
  const first = db.prepare("SELECT source_path FROM audio_segments WHERE layer='composite_cast_master'").get()!;
  await runVoicing("p", { sourceSegmentIds: ["two"] });
  expect(reVoiceAudio).toHaveBeenCalledTimes(2);
  expect(db.prepare("SELECT COUNT(DISTINCT source_path) AS n FROM audio_segments WHERE layer='composite_cast_master'").get()).toMatchObject({ n: 2 });
  await runVoicing("p", { sourceSegmentIds: ["one"], force: true });
  expect(existsSync(join(directory, "assets", String(first.source_path)))).toBe(true);
  expect(readFileSync(join(directory, "assets", String(first.source_path)), "utf8")).toBe("new cast audio");
  const history = db.prepare("SELECT payload FROM edit_commands WHERE command_type='supersede_cast_master' ORDER BY sequence DESC LIMIT 1").get()!;
  expect(String(history.payload)).toContain(String(first.source_path).replaceAll("\\", "\\\\"));
  expect(String(history.payload)).toContain("previousMappings");
  const sidecar = JSON.parse(readFileSync(join(directory, "assets", `${String(first.source_path)}.json`), "utf8"));
  expect(sidecar).toMatchObject({ sourceStartMs: 0, sourceEndMs: 1000, originalSegmentId: "one", requestSettings: { model_id: "fixture-sts" }, usage: "not_reported", directCostUsd: null });
});
it("reuses exact source/voice mappings and holds a missing retained asset without a paid call", async () => {
  writeFileSync(join(directory, "assets", "old.mp3"), "retained");
  db.exec("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at) VALUES ('cast','p','composite_cast_master','old.mp3',0,1000,'c',1)");
  db.prepare("INSERT INTO composite_audio_source_map VALUES ('cast','one',?,'v',1)").run(createHash("sha256").update("source").digest("hex"));
  expect((await runVoicing("p", { sourceSegmentIds: ["one"] })).reused).toBe(1);
  expect(reVoiceAudio).not.toHaveBeenCalled();
  rmSync(join(directory, "assets", "old.mp3"));
  await expect(runVoicing("p", { sourceSegmentIds: ["one"] })).rejects.toThrow("Missing retained cast master");
  expect(reVoiceAudio).not.toHaveBeenCalled();
});
it("holds an equal-duration source-boundary change instead of reusing the wrong retained performance", async () => {
  await runVoicing("p", { sourceSegmentIds: ["one"] });
  vi.mocked(reVoiceAudio).mockClear();
  db.exec("UPDATE audio_segments SET start_ms=100,end_ms=1100 WHERE id='one'");
  await expect(runVoicing("p", { sourceSegmentIds: ["one"] })).rejects.toThrow("different source bounds");
  expect(reVoiceAudio).not.toHaveBeenCalled();
});
it("retains old voicing QC notes and their prior state when replacing the current projection", async () => {
  await runVoicing("p");
  db.exec("INSERT INTO review_notes VALUES ('old-qc','p','project','p','qc','Composite cast master: Missing voice',0,1)");
  await runVoicing("p");
  expect(db.prepare("SELECT note,resolved FROM review_notes WHERE id='old-qc'").get()).toEqual({ note: "Composite cast master: Missing voice", resolved: 1 });
  const history = JSON.parse(String(db.prepare("SELECT payload FROM edit_commands ORDER BY sequence DESC LIMIT 1").get()!.payload));
  expect(history.previousReviewNotes).toEqual([expect.objectContaining({ id: "old-qc", resolved: 0 })]);
  expect(history.originalSegments).toEqual(expect.arrayContaining([expect.objectContaining({ id: "one", start_ms: 0, end_ms: 1000 })]));
});
