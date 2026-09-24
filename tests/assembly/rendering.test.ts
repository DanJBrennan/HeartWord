import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { expect, it } from "vitest";
import { crewBriefHash, digest, loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { renderEditorialCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { applyFinishing, mediaDurationMs } from "../../src/pipeline/assembly/finishing.js";
import type { CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
it.skipIf(!ffmpegAvailable)("renders real pauses and cast speech, then applies a reviewed score without shifting the cut", () => {
  const directory = mkdtempSync(join(tmpdir(), "heartword-render-test-")), assets = join(directory, "assets");
  mkdirSync(assets);
  const db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  const put = (path: string, content: Buffer | string) => { const p = join(assets, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  try {
    put("source/hatam/mark-2/mark-2-text.docx", docx("1Original words. 2Dialogue.")); put("reference/english/mark-2/mark-2-text.docx", docx("1Reference words. 2Dialogue.")); put("ref.png", "canon fixture");
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=44100", "-ac", "2", join(assets, "source.wav")]);
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=880:duration=1:sample_rate=44100", "-ac", "2", join(assets, "dub.wav")]);
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=3:sample_rate=44100", "-ac", "2", join(assets, "music.wav")]);
    for (const [name, color] of [["narration", "red"], ["dialogue", "blue"]]) ffmpeg(["-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(assets, `${name}.mp4`)]);
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 2:1','Mark 2:2',1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Speaker','global','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1);
      INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('a','v','body_pose','ref.png',1);
      INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,created_at) VALUES ('narration','scene',1,'Teaching','Mark 2:1',0,NULL,1),('dialogue','scene',2,'Speaking','Mark 2:2',1,'c',1);
      INSERT INTO shot_characters VALUES ('dialogue','c');
      INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,speaker_character_id,created_at) VALUES
        ('n','p','original_reading','source.wav',0,1000,'Mark 2:1',NULL,1),('d','p','original_reading','source.wav',1000,2000,'Mark 2:2','c',1),('dub','p','composite_cast_master','dub.wav',0,1000,'Mark 2:2','c',1);`);
    for (const name of ["narration", "dialogue"]) {
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','test','assemble_shot','accepted',?,0,1)").run(name, name, `${name}.mp4`);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,1000,1)").run(name, name, name);
    }
    const before = loadCrewBrief(db, directory, "p", "editing");
    const edit: CrewResult = { status: "approved", calls: 5, summary: "Intro and pause", contributions: { picture_editor: { summary: "Cut", directions: [], findings: [], coverageRequests: [],
      edits: [{ shotId: "narration", sourceStartMs: 0, durationMs: 500 }, { shotId: "narration", sourceStartMs: 0, durationMs: 1000 }, { shotId: "narration", sourceStartMs: 0, durationMs: 500 }, { shotId: "dialogue", sourceStartMs: 0, durationMs: 1000 }],
      pauses: [{ afterSegmentId: null, durationMs: 500, reason: "Establish location" }, { afterSegmentId: "n", durationMs: 500, reason: "A reaction" }] } } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('edit','p','editing',?,?,'approved',?,1)").run(crewBriefHash(before, "editing"), JSON.stringify(before), JSON.stringify(edit));
    const cut = renderEditorialCut(db, directory, "p", "edit");
    expect(renderEditorialCut(db, directory, "p", "edit")).toEqual(cut);
    expect(Math.abs(mediaDurationMs(join(assets, cut.path)) - 3000)).toBeLessThan(100);
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(assets, cut.path), "-f", "f32le", "-ac", "1", "-ar", "8000", "pipe:1"]);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const rms = (start: number, end: number) => Math.sqrt(samples.slice(start * 8000, end * 8000).reduce((sum, n) => sum + n * n, 0) / ((end - start) * 8000));
    expect(rms(0.1, 0.4)).toBeLessThan(0.001); expect(rms(1.6, 1.9)).toBeLessThan(0.001);
    expect(rms(0.6, 1.4)).toBeGreaterThan(0.04); expect(rms(2.1, 2.9)).toBeGreaterThan(0.04);
    const crossings = (start: number, end: number) => { let count = 0; for (let i = start * 8000 + 1; i < end * 8000; i++) if (samples[i - 1]! <= 0 && samples[i]! > 0) count++; return count / (end - start); };
    expect(crossings(0.6, 1.4)).toBeCloseTo(440, -1); expect(crossings(2.1, 2.9)).toBeCloseTo(880, -1);
    db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES ('m','p','music','Test instrumental','music.wav',?,3000,1)").run(digest(readFileSync(join(assets, "music.wav"))));
    const brief = loadCrewBrief(db, directory, "p", "finishing");
    const finish: CrewResult = { status: "approved", calls: 7, summary: "Restrained score", contributions: {
      colorist: { summary: "Match", directions: [], findings: [], colorAdjustments: [{ shotId: "narration", brightness: 0.01, contrast: 1, saturation: 1, reason: "Match adjacent shot" }] },
      composer: { summary: "Cue", directions: [], findings: [], generationRequests: [], audioCues: [{ assetId: "m", startMs: 0, endMs: 3000, sourceStartMs: 0, gainDb: -24, reason: "Quiet underscore" }] },
      sound_designer: { summary: "No effects needed", directions: [], findings: [], generationRequests: [], audioCues: [] }
    } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('finish','p','finishing',?,?,'approved',?,2)").run(crewBriefHash(brief, "finishing"), JSON.stringify(brief), JSON.stringify(finish));
    const finished = applyFinishing(db, directory, "p", "finish"); expect(applyFinishing(db, directory, "p", "finish")).toEqual(finished);
    expect(finished.path).not.toBe(cut.path); expect(Math.abs(mediaDurationMs(join(assets, finished.path)) - 3000)).toBeLessThan(100);
    expect(loadCrewBrief(db, directory, "p", "finishing").render!.audioMap).toEqual(brief.render!.audioMap);
    const revisedBrief = loadCrewBrief(db, directory, "p", "finishing");
    expect(revisedBrief.render!.finishing!.baseRenderId).toBe(cut.renderId);
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('finish2','p','finishing',?,?,'approved',?,3)").run(crewBriefHash(revisedBrief, "finishing"), JSON.stringify(revisedBrief), JSON.stringify(finish));
    const revised = applyFinishing(db, directory, "p", "finish2");
    const pcm = (path: string) => execFileSync("ffmpeg", ["-v", "error", "-i", join(assets, path), "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
    const first = pcm(finished.path), second = pcm(revised.path);
    const firstSamples = new Int16Array(first.buffer, first.byteOffset, first.byteLength / 2), secondSamples = new Int16Array(second.buffer, second.byteOffset, second.byteLength / 2);
    expect(firstSamples.length).toBe(secondSamples.length);
    let maxDelta = 0, squaredError = 0;
    for (let index = 0; index < firstSamples.length; index++) { const delta = Math.abs(firstSamples[index]! - secondSamples[index]!); maxDelta = Math.max(maxDelta, delta); squaredError += delta ** 2; }
    // AAC produces occasional one-unit PCM rounding differences between otherwise
    // identical renders. Keep the assertion at decoded signal level: any changed
    // cue, duplicate score, or timing shift exceeds this one-unit bound.
    expect(maxDelta).toBeLessThanOrEqual(1);
    expect(Math.sqrt(squaredError / firstSamples.length)).toBeLessThanOrEqual(0.1);
  } finally { db.close(); if (relative(tmpdir(), directory).startsWith("heartword-render-test-")) rmSync(directory, { recursive: true, force: true }); }
}, 30000);

it.skipIf(!ffmpegAvailable)("holds an exported audio turn with a renewed onset cut off after silence", () => {
  const directory = mkdtempSync(join(tmpdir(), "heartword-tail-test-")), assets = join(directory, "assets");
  mkdirSync(assets);
  const db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  const put = (path: string, content: Buffer) => { const full = join(assets, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content); };
  try {
    put("source/hatam/mark-2/mark-2-text.docx", docx("1Source words."));
    put("reference/english/mark-2/mark-2-text.docx", docx("1Reference words."));
    put("ref.png", Buffer.from("canon fixture"));
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=200:duration=1.0:sample_rate=8000",
      "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono:d=0.84",
      "-f", "lavfi", "-i", "sine=frequency=200:duration=0.16:sample_rate=8000",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1", join(assets, "source.wav")]);
    ffmpeg(["-f", "lavfi", "-i", "color=red:s=160x90:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(assets, "shot.mp4")]);
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 2:1','Mark 2:1',1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Witness','global','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v','c','v1','approved',1);
      INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('a','v','body_pose','ref.png',1);
      INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,created_at) VALUES ('shot','scene',1,'Listening','Mark 2:1',0,1);
      INSERT INTO shot_characters VALUES ('shot','c');
      INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('line','p','original_reading','source.wav',0,2000,'Mark 2:1',1);
      INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)
        VALUES ('take','shot','local','test','assemble_shot','accepted','shot.mp4',0,1);
      INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)
        VALUES ('clip','shot','take',0,2000,1);`);
    const before = loadCrewBrief(db, directory, "p", "editing");
    const edit: CrewResult = { status: "approved", calls: 1, summary: "Test cut", contributions: {
      picture_editor: { summary: "Cut", directions: [], findings: [], coverageRequests: [],
        edits: [{ shotId: "shot", sourceStartMs: 0, durationMs: 2000 }], pauses: [] }
    } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('edit','p','editing',?,?,'approved',?,1)")
      .run(crewBriefHash(before, "editing"), JSON.stringify(before), JSON.stringify(edit));
    expect(() => renderEditorialCut(db, directory, "p", "edit")).toThrow(/renewed onset after a quiet gap/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM chapter_renders WHERE project_id='p'").get()).toMatchObject({ n: 0 });
  } finally { db.close(); if (relative(tmpdir(), directory).startsWith("heartword-tail-test-")) rmSync(directory, { recursive: true, force: true }); }
}, 30000);
