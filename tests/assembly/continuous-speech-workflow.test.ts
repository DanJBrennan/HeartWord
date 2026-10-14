import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root = "";
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));
const revoice = vi.fn(async (_voice: string, path: string) => ({ audioBuffer: readFileSync(path), requestSettings: { syntheticFixture: true, operation: "unchanged source copy" } }));
vi.mock("../../src/providers/elevenlabs.js", () => ({ reVoiceAudio: (...args: [string, string]) => revoice(...args) }));
import { confirmContinuousSpeech, readConfirmedSpeechRuns } from "../../src/pipeline/ingestion/continuous-speech.js";
import { bindShotUtterance } from "../../src/pipeline/voice-lipsync/utterance-binding.js";
import { resolveSpeechRunCastAudio } from "../../src/pipeline/voice-lipsync/speech-run-audio.js";
import { runVoicing } from "../../src/pipeline/voicing/index.js";
import { crewBriefHash, loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { renderEditorialCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import type { CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
function docx(text: string) {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: ["ignore", "ignore", "pipe"] });
it("renders changing picture over a continuous multi-verse performance, with narration, two speakers in a verse and an evidenced emphasis", async () => {
  const retained = process.env.HEARTWORD_CONTINUOUS_SPEECH_DEMO_DIR;
  if (retained) { if (existsSync(retained)) throw new Error("Demonstration destination already exists; refuse overwrite."); root = resolve(retained); mkdirSync(root, { recursive: true }); }
  else root = mkdtempSync(join(tmpdir(), "hw-speech-workflow-"));
  const put = (path: string, bytes: Buffer | string) => { const out = join(root, "assets", path); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, bytes); };
  mkdirSync(join(root, "db"));
  db = new DatabaseSync(join(root, "db", "heartword.sqlite")); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  try {
    const text = '1Synthetic test. 2Setup. 3He said, “First. 4Emphasized phrase. 5Speech ends.” 6Narrator; “Question”; “Answer.”';
    put("source/hatam/mark-4/mark-4-text.docx", docx(text)); put("reference/english/mark-4/mark-4-text.docx", docx(text));
    const sourceRel = "source/hatam/mark-4/mark-4-fcbh-audio.mp3";
    ffmpeg(["-f", "lavfi", "-i", "aevalsrc=0.1*sin(2*PI*if(lt(t\\,1.8)\\,400\\,if(lt(t\\,5.2)\\,600\\,if(lt(t\\,9)\\,400\\,if(lt(t\\,10)\\,200\\,if(lt(t\\,12)\\,800\\,400)))))*t):s=48000:d=14", "-c:a", "libmp3lame", "-q:a", "2", join(root, "assets", sourceRel)]);
    put("reference.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"));
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('synthetic-continuous-speech','hatam','mark',4,1,1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('jesus','Synthetic Jesus','global','approved','Papuan',1,1),('peter','Synthetic Peter','global','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,created_at) VALUES ('jv','jesus','fixture','approved','fixture-sts','jvoice',1),('pv','peter','fixture','approved','fixture-sts','pvoice',1);
      INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('ja','jv','headshot','reference.png',1),('pa','pv','headshot','reference.png',1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','synthetic-continuous-speech',1,'Mark 4:3','Mark 4:6',1);`);
    const intervals = [["a", 0, 2000, "Mark 4:3"], ["b", 2000, 5000, null], ["c", 5000, 9000, "Mark 4:5"], ["n", 9000, 10000, "Mark 4:6"], ["p", 10000, 12000, "Mark 4:6"], ["j", 12000, 14000, "Mark 4:6"]] as const;
    for (const [id, start, end, ref] of intervals) db.prepare("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,confidence,created_at) VALUES (?,'synthetic-continuous-speech','original_reading',?,?,?,?,70,1)").run(id, sourceRel, start, end, ref);
    const confirm = (ids: string[], characterId: string | null, verseRef: string, key: string) => confirmContinuousSpeech(db, { projectId: "synthetic-continuous-speech", audioSegmentIds: ids, characterId, verseRef, internalVerseTiming: "unresolved", reviewerName: "Synthetic fixture reviewer", evidence: "SYNTHETIC TONAL TEST: exact source intervals and uninterrupted owner verified from fixture construction, not Hatam linguistic evidence.", idempotencyKey: key });
    const run = confirm(["a", "b", "c"], "jesus", "Mark 4:3-5", "long"); confirm(["n"], null, "Mark 4:6", "narrator"); confirm(["p"], "peter", "Mark 4:6", "question"); confirm(["j"], "jesus", "Mark 4:6", "answer");
    const shots = [["cover1", 1800, "red"], ["emphasis", 3400, "blue"], ["cover2", 3800, "green"], ["narrator", 1000, "yellow"], ["question", 2000, "cyan"], ["answer", 2000, "purple"]] as const;
    for (const [index, [id, duration, color]] of shots.entries()) {
      ffmpeg(["-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=${duration / 1000}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(root, "assets", `${id}.mp4`)]);
      db.prepare("INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,created_at) VALUES (?,'scene',?,'Synthetic coverage',?,?,?,1)").run(id, index + 1, index < 3 ? "Mark 4:3-5" : "Mark 4:6", id === "emphasis" ? 1 : 0, id === "emphasis" ? "jesus" : null);
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','synthetic','assemble_shot','accepted',?,0,1)").run(id, id, `${id}.mp4`);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,1)").run(id, id, id, duration);
    }
    db.exec("INSERT INTO shot_characters VALUES ('emphasis','jesus')");
    bindShotUtterance(db, { projectId: "synthetic-continuous-speech", shotId: "emphasis", sourceSegmentId: "a", speechRunId: run.id, startMs: 1800, endMs: 5200, characterVersionId: "jv", approvedBy: "Synthetic phrase reviewer", timingEvidence: "Fixture's original source changes from 400 to 600 Hz at 1.8s and returns at 5.2s; independent of approximate verse metadata." });
    const voicing = await runVoicing("synthetic-continuous-speech"); expect(voicing.ok).toBe(true); expect(revoice).toHaveBeenCalledTimes(3);
    const window = resolveSpeechRunCastAudio(db, "emphasis", "jv"); expect(window).toMatchObject({ startMs: 1800, endMs: 5200 });
    const brief = loadCrewBrief(db, root, "synthetic-continuous-speech", "editing");
    const edit: CrewResult = { status: "approved", calls: 0, summary: "Synthetic deterministic acceptance fixture; no production crew model calls", contributions: { picture_editor: { summary: "Picture changes independently of audio", directions: [], findings: [], pauses: [], edits: shots.map(([shotId, durationMs]) => ({ shotId, durationMs, sourceStartMs: 0 })) } } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('edit','synthetic-continuous-speech','editing',?,?,'approved',?,1)").run(crewBriefHash(brief, "editing"), JSON.stringify(brief), JSON.stringify(edit));
    const cut = renderEditorialCut(db, root, "synthetic-continuous-speech", "edit");
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(root, "assets", cut.path), "-f", "f32le", "-ar", "8000", "-ac", "1", "pipe:1"]);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const frequency = (start: number, end: number) => { let n = 0; for (let i = Math.round(start * 8000) + 1; i < end * 8000; i++) if (samples[i - 1]! <= 0 && samples[i]! > 0) n++; return n / (end - start); };
    const observed = [[0.5, 1.5, 400], [2.5, 4.5, 600], [6, 8, 400], [9.2, 9.8, 200], [10.5, 11.5, 800], [12.5, 13.5, 400]].map(([start, end, expected]) => ({ start, end, expectedHz: expected, measuredHz: frequency(start!, end!) }));
    observed.forEach(o => expect(o.measuredHz).toBeCloseTo(o.expectedHz!, -1));
    expect(samples.length / 8000).toBeCloseTo(14, 1);
    const map = JSON.parse(String(db.prepare("SELECT source_audio_json FROM chapter_render_manifests WHERE render_id=?").get(cut.renderId)!.source_audio_json));
    expect(map.map((m: { segmentId: string }) => m.segmentId)).toEqual(["a", "b", "c", "n", "p", "j"]);
    // Existing accepted per-verse cast files also remain usable: locally join
    // only the exact performance window, without a new voice-provider call.
    const previousMaps = db.prepare("SELECT a.* FROM audio_segments a JOIN composite_audio_source_map m ON a.id=m.composite_segment_id WHERE m.original_segment_id IN ('a','b','c')").all();
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) SELECT 'fixture-legacy','synthetic-continuous-speech',MAX(sequence)+1,'fixture_retain_legacy_cast_mapping',?,'fixture-legacy',1 FROM edit_commands").run(JSON.stringify({ synthetic: true, previousMaps }));
    for (const [id, start, end] of intervals.slice(0, 3)) {
      const rel = `retained-${id}.wav`;
      ffmpeg(["-i", join(root, "assets", window!.path), "-ss", String(start / 1000), "-t", String((end - start) / 1000), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", join(root, "assets", rel)]);
      db.prepare("UPDATE audio_segments SET source_path=?,start_ms=0,end_ms=? WHERE id=(SELECT composite_segment_id FROM composite_audio_source_map WHERE original_segment_id=?)").run(rel, end - start, id);
    }
    const joined = resolveSpeechRunCastAudio(db, "emphasis", "jv")!;
    expect(joined).toMatchObject({ startMs: 0, endMs: 3400 });
    expect(resolveSpeechRunCastAudio(db, "emphasis", "jv")).toEqual(joined);
    const joinedPath = join(root, "assets", joined.path), retainedBytes = readFileSync(joinedPath);
    writeFileSync(joinedPath, "corrupt synthetic cache");
    expect(() => resolveSpeechRunCastAudio(db, "emphasis", "jv")).toThrow("changed or lacks provenance");
    writeFileSync(joinedPath, retainedBytes); // keep any explicitly retained demo valid
    expect(revoice).toHaveBeenCalledTimes(3);
    writeFileSync(join(root, "workflow-evidence.json"), JSON.stringify({ synthetic: true, limitations: "Tones verify timing/order/continuity. No actual Hatam speech, voice conversion or acting quality is certified. Voice provider is mocked; no paid calls.", sourceDurationMs: 14000, sourceIntervals: intervals, runs: readConfirmedSpeechRuns(db, "synthetic-continuous-speech"), exactEmphasisWindow: window, joinedRetainedCastWindow: joined, sourceMap: map, observed, cut, directProductionCostUsd: 0 }, null, 2));
    if (retained) writeFileSync("outputs/continuous-speech-workflow.json", JSON.stringify({ synthetic: true, dataDir: root, report: join(root, "workflow-evidence.json"), video: join(root, "assets", cut.path), directProductionCostUsd: 0 }, null, 2));
  } finally { db.close(); if (!retained && resolve(root).startsWith(resolve(tmpdir(), "hw-speech-workflow-"))) rmSync(root, { recursive: true, force: true }); }
}, 60000);
