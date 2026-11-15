import express from "express";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { loadCrewBrief } from "../../pipeline/creative-direction/crew-context.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const state = vi.hoisted(() => ({ db: undefined as InstanceType<typeof DatabaseSync> | undefined, directory: "" }));
vi.mock("../../db/client.js", () => ({ getDb: () => state.db!, getDataDir: () => state.directory }));
vi.mock("../../pipeline/creative-direction/lesson-synthesis.js", () => ({
  proposeReusableLesson: vi.fn(async () => ({ principle: "Keep roof damage consistent across matching chapters.", rationale: "Preserve reviewed environmental continuity.", scope: "book" }))
}));

const { productionRouter } = await import("./production.js");
let db: InstanceType<typeof DatabaseSync>, directory: string, server: ReturnType<express.Express["listen"]>, base: string;
function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
function asset(path: string, body: string | Buffer) { const file = join(directory, "assets", path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, body); }
async function post(path: string, body: unknown, method = "POST") { const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { response, body: await response.json() as Record<string, string> }; }

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "heartword-correction-flow-")); state.directory = directory;
  db = new DatabaseSync(":memory:"); state.db = db; db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p2','hatam','mark',2,1,1),('p3','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s2','p2',1,'Mark 2:1','Mark 2:1',1),('s3','p3',1,'Mark 3:1','Mark 3:1',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,created_at) VALUES ('shot2','s2',1,'Teaching','Mark 2:1',1),('shot3','s3',1,'Teaching','Mark 3:1',1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Witness','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1);
    INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('a','v','body_pose','ref.png',1);
    INSERT INTO shot_characters VALUES ('shot2','c'),('shot3','c');
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('a2','p2','original_reading','source.wav',0,1000,'Mark 2:1',1),('a3','p3','original_reading','source.wav',0,1000,'Mark 3:1',1);`);
  asset("ref.png", "fixture"); asset("source.wav", "fixture");
  asset("source/hatam/mark-2/mark-2-text.docx", docx("1Words.")); asset("reference/english/mark-2/mark-2-text.docx", docx("1Reference."));
  asset("source/hatam/mark-3/mark-3-text.docx", docx("1Words.")); asset("reference/english/mark-3/mark-3-text.docx", docx("1Reference."));
  const app = express(); app.use(express.json()); app.use("/api/projects/:projectId/production", productionRouter);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); if (relative(tmpdir(), directory).startsWith("heartword-correction-flow-")) rmSync(directory, { recursive: true, force: true }); });

describe("recorded correction learning", () => {
  it("rejects invalid guidance without writing, then promotes an immutable reviewed successor for a matching later chapter", async () => {
    const invalid = await post("/api/projects/p2/production/guidance", { note: "Fix the roof", reusable: true, principle: "Fix the roof" });
    expect(invalid.response.status).toBe(400); expect(db.prepare("SELECT COUNT(*) AS n FROM review_notes").get()!.n).toBe(0); expect(db.prepare("SELECT COUNT(*) AS n FROM production_lessons").get()!.n).toBe(0);

    const created = await post("/api/projects/p2/production/guidance", { note: "The roof must remain damaged after the healing." });
    expect(created.response.status).toBe(201); const candidate = db.prepare("SELECT * FROM production_lessons WHERE id=?").get(created.body.lessonId!) as { id: string; status: string };
    expect(candidate.status).toBe("candidate");
    const revised = await post(`/api/projects/p2/production/lessons/${candidate.id}`, { requestedChange: "Keep roof damage consistent across matching chapters.", rationale: "Producer approved the generalized rule.", scope: "book" }, "PATCH");
    expect(revised.response.status).toBe(200);
    const original = db.prepare("SELECT status FROM production_lessons WHERE id=?").get(candidate.id) as { status: string };
    const successor = db.prepare("SELECT status,supersedes_id,scope_kind FROM production_lessons WHERE id=?").get(revised.body.lessonId!) as { status: string; supersedes_id: string; scope_kind: string };
    expect(original.status).toBe("superseded"); expect(successor).toEqual({ status: "active", supersedes_id: candidate.id, scope_kind: "book" });
    db.prepare(`INSERT INTO production_lessons (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,status,source_language,source_book,source_chapter,source_region,created_at,updated_at) VALUES ('wrong-language','p2','book','mark','p2','test','Wrong language','active','other','mark',2,'Papuan',1,1),('disabled','p2','book','mark','p2','test','Disabled rule','disabled','hatam','mark',2,'Papuan',1,1)`).run();
    const applied = loadCrewBrief(db, directory, "p3", "planning").appliedLessons ?? [];
    expect(applied.map(lesson => lesson.id)).toEqual([revised.body.lessonId]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM production_lesson_events WHERE lesson_id IN (?,?)").get(candidate.id, revised.body.lessonId!)!.n).toBeGreaterThanOrEqual(3);
  });
});
