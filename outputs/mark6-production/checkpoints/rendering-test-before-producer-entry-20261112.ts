import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { expect, it } from "vitest";
import { crewBriefHash, digest, loadCrewBrief } from "../../src/pipeline/creative-direction/crew-context.js";
import { renderEditorialCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { applyFinishing, mediaDurationMs } from "../../src/pipeline/assembly/finishing.js";
import type { CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
import { exportChapterPackage, restoreChapterPackage, verifyChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
function audioSampleRate(path: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", path], { encoding: "utf8" }).trim());
}
function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
it.skipIf(!ffmpegAvailable).each([false,true])("renders pauses, cast and score, then independently restores the edit (retained master: %s)", (retained) => {
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
    ffmpeg(["-f","lavfi","-i","color=green:s=160x90:r=24:d=1","-c:v","libx264","-pix_fmt","yuv420p",join(assets,"narration-alt.mp4")]);
    db.exec("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at)VALUES('narration-alt','narration','local','test','assemble_shot','accepted','narration-alt.mp4',0,2); INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('narration-alt','narration','narration-alt',0,1000,2)");
    if(retained){
      ffmpeg(["-i",join(assets,"source.wav"),"-i",join(assets,"dub.wav"),"-filter_complex","[0:a]atrim=end=1,asetpts=PTS-STARTPTS,volume=0.5[n];[1:a]volume=0.75[d];[n][d]concat=n=2:v=0:a=1[out]","-map","[out]","-ac","2","-c:a","pcm_s16le",join(assets,"retained-performance.wav")]);
      put("performance-evidence.json",JSON.stringify({fixture:true,reviewOnly:true}));
      const saved={version:1,path:"retained-performance.wav",sha256:digest(readFileSync(join(assets,"retained-performance.wav"))),durationMs:2000,
        evidencePath:"performance-evidence.json",evidenceSha256:digest(readFileSync(join(assets,"performance-evidence.json"))),inputSignature:loadCrewBrief(db,directory,"p","editing").performanceInputSignature};
      db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES('performance','p',1,'retain_review_performance_master',?,'performance',1)").run(JSON.stringify(saved));
    }
    const before = loadCrewBrief(db, directory, "p", "editing");
    const edit: CrewResult = { status: "approved", calls: 5, summary: "Intro and pause", contributions: { picture_editor: { summary: "Cut", directions: [], findings: [], coverageRequests: [],
      edits: [{ shotId: "narration", clipId:"narration", sourceStartMs: 0, durationMs: 500 }, { shotId: "narration", clipId:"narration-alt", sourceStartMs: 0, durationMs: 1000 }, { shotId: "narration", clipId:"narration", sourceStartMs: 0, durationMs: 500 }, { shotId: "dialogue", sourceStartMs: 0, durationMs: 1000 }],
      pauses: [{ afterSegmentId: null, durationMs: 500, reason: "Establish location" }, { afterSegmentId: "n", durationMs: 500, reason: "A reaction" }] } } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('edit','p','editing',?,?,'approved',?,1)").run(crewBriefHash(before, "editing"), JSON.stringify(before), JSON.stringify(edit));
    const cut = renderEditorialCut(db, directory, "p", "edit");
    const colorsAt=(path:string)=>[.25,1,1.75,2.5].map(t=>[...execFileSync("ffmpeg",["-v","error","-ss",String(t),"-i",path,"-vf","scale=1:1","-frames:v","1","-threads","1","-pix_fmt","rgb24","-f","rawvideo","pipe:1"])]);
    const assertChosenTakes=(path:string)=>{const c=colorsAt(path);expect(c[0]![0]).toBeGreaterThan(c[0]![1]!+100);expect(c[1]![1]).toBeGreaterThan(c[1]![0]!+80);expect(c[2]![0]).toBeGreaterThan(c[2]![1]!+100);expect(c[3]![2]).toBeGreaterThan(c[3]![0]!+100);};
    assertChosenTakes(join(assets,cut.path));
    const chosen=JSON.parse(String(db.prepare("SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?").get(cut.renderId)!.timeline_json));
    expect(chosen.slice(0,3).map((p:any)=>[p.clipId,p.path])).toEqual([["narration","narration.mp4"],["narration-alt","narration-alt.mp4"],["narration","narration.mp4"]]);
    for(const p of chosen.slice(0,3))expect(p.sha256).toBe(digest(readFileSync(join(assets,p.path))));
    expect(renderEditorialCut(db, directory, "p", "edit")).toEqual(cut);
    expect(audioSampleRate(join(assets, cut.path))).toBe(48000);
    expect(Math.abs(mediaDurationMs(join(assets, cut.path)) - 3000)).toBeLessThan(100);
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(assets, cut.path), "-f", "f32le", "-ac", "1", "-ar", "8000", "pipe:1"]);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const rms = (start: number, end: number) => Math.sqrt(samples.slice(start * 8000, end * 8000).reduce((sum, n) => sum + n * n, 0) / ((end - start) * 8000));
    expect(rms(0.1, 0.4)).toBeLessThan(0.001); expect(rms(1.6, 1.9)).toBeLessThan(0.001);
    expect(rms(0.6, 1.4)).toBeGreaterThan(retained?0.02:0.04); expect(rms(2.1, 2.9)).toBeGreaterThan(0.04);
    if(retained){
      const inputRms=(name:string)=>{const bytes=execFileSync("ffmpeg",["-v","error","-i",join(assets,name),"-f","f32le","-ac","1","-ar","8000","pipe:1"]);const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);return Math.sqrt(values.slice(800,7200).reduce((sum,n)=>sum+n*n,0)/6400);};
      expect(rms(0.6,1.4)/inputRms("source.wav")).toBeCloseTo(0.5,2);
      expect(rms(2.1,2.9)/inputRms("dub.wav")).toBeCloseTo(0.75,2);
    }
    const crossings = (start: number, end: number) => { let count = 0; for (let i = start * 8000 + 1; i < end * 8000; i++) if (samples[i - 1]! <= 0 && samples[i]! > 0) count++; return count / (end - start); };
    expect(crossings(0.6, 1.4)).toBeCloseTo(440, -1); expect(crossings(2.1, 2.9)).toBeCloseTo(880, -1);
    db.prepare("INSERT INTO production_audio_assets (id,project_id,kind,description,path,sha256,duration_ms,created_at) VALUES ('m','p','music','Test instrumental','music.wav',?,3000,1)").run(digest(readFileSync(join(assets, "music.wav"))));
    const brief = loadCrewBrief(db, directory, "p", "finishing");
    if(retained){
      expect(brief.render!.audioMap.map(p=>p.performance?.sourceStartMs)).toEqual([0,1000]);
      expect(brief.render!.audioMap.map(p=>p.performance?.originalInput.path)).toEqual(["source.wav","dub.wav"]);
    }
    const finish: CrewResult = { status: "approved", calls: 7, summary: "Restrained score", contributions: {
      colorist: { summary: "Match", directions: [], findings: [], colorAdjustments: [{ shotId: "narration", brightness: 0.01, contrast: 1, saturation: 1, reason: "Match adjacent shot" }] },
      composer: { summary: "Cue", directions: [], findings: [], generationRequests: [], audioCues: [{ assetId: "m", startMs: 0, endMs: 3000, sourceStartMs: 0, gainDb: -24, reason: "Quiet underscore", fadeInMs: 500, fadeOutMs: 500 }] },
      sound_designer: { summary: "No effects needed", directions: [], findings: [], generationRequests: [], audioCues: [] }
    } };
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('finish','p','finishing',?,?,'approved',?,2)").run(crewBriefHash(brief, "finishing"), JSON.stringify(brief), JSON.stringify(finish));
    const finished = applyFinishing(db, directory, "p", "finish"); expect(applyFinishing(db, directory, "p", "finish")).toEqual(finished);
    expect(finished.path).not.toBe(cut.path); expect(Math.abs(mediaDurationMs(join(assets, finished.path)) - 3000)).toBeLessThan(100);
    expect(audioSampleRate(join(assets, finished.path))).toBe(48000);
    const finishedRaw = execFileSync("ffmpeg", ["-v", "error", "-i", join(assets, finished.path), "-f", "f32le", "-ac", "1", "-ar", "8000", "pipe:1"]);
    const finishedSamples = new Float32Array(finishedRaw.buffer, finishedRaw.byteOffset, finishedRaw.byteLength / 4);
    // Measure only the music's 220Hz component; the retained 440/880Hz
    // source/cast tones must not masquerade as a soundtrack envelope.
    const musicAmplitude = (start: number, end: number) => {
      let sine = 0, cosine = 0;
      const first = Math.round(start * 8000), last = Math.round(end * 8000);
      for (let i = first; i < last; i++) {
        const phase = 2 * Math.PI * 220 * i / 8000;
        sine += finishedSamples[i]! * Math.sin(phase); cosine += finishedSamples[i]! * Math.cos(phase);
      }
      return Math.hypot(sine, cosine) * 2 / (last - first);
    };
    expect(musicAmplitude(0.02, 0.07)).toBeLessThan(musicAmplitude(0.3, 0.4) * 0.3);
    expect(musicAmplitude(2.85, 2.95)).toBeLessThan(musicAmplitude(2.15, 2.25) * 0.4);
    const phase = (values: Float32Array, start: number, end: number, hz: number) => {
      let sine=0,cosine=0;
      for(let i=Math.round(start*8000);i<Math.round(end*8000);i++){
        const angle=2*Math.PI*hz*i/8000;sine+=values[i]!*Math.sin(angle);cosine+=values[i]!*Math.cos(angle);
      }
      return Math.atan2(cosine,sine);
    };
    for(const [start,end,hz] of [[0.7,1.1,440],[2.3,2.7,880]]){
      const difference=phase(finishedSamples,start!,end!,hz!)-phase(samples,start!,end!,hz!);
      expect(Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))).toBeLessThan(0.04);
    }
    expect(loadCrewBrief(db, directory, "p", "finishing").render!.audioMap).toEqual(brief.render!.audioMap);
    const revisedBrief = loadCrewBrief(db, directory, "p", "finishing");
    expect(revisedBrief.render!.finishing!.baseRenderId).toBe(cut.renderId);
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('finish2','p','finishing',?,?,'approved',?,3)").run(crewBriefHash(revisedBrief, "finishing"), JSON.stringify(revisedBrief), JSON.stringify(finish));
    const revised = applyFinishing(db, directory, "p", "finish2");
    expect(audioSampleRate(join(assets, revised.path))).toBe(48000);
    const pcm = (path: string) => execFileSync("ffmpeg", ["-v", "error", "-i", join(assets, path), "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
    const first = pcm(finished.path), second = pcm(revised.path);
    const firstSamples = new Int16Array(first.buffer, first.byteOffset, first.byteLength / 2), secondSamples = new Int16Array(second.buffer, second.byteOffset, second.byteLength / 2);
    expect(firstSamples.length).toBe(secondSamples.length);
    let maxDelta = 0, squaredError = 0;
    for (let index = 0; index < firstSamples.length; index++) { const delta = Math.abs(firstSamples[index]! - secondSamples[index]!); maxDelta = Math.max(maxDelta, delta); squaredError += delta ** 2; }
    // AAC frame encoding is not sample-deterministic across two independent
    // encodes: a small boundary transient can decode differently even when the
    // continuous mix is identical. Eight signed-16-bit RMS units is below
    // -72 dBFS; the intentional 1 dB cue edit below must exceed that tolerance.
    // The peak check also rejects a timing shift or duplicate score.
    expect(maxDelta).toBeLessThanOrEqual(128);
    expect(Math.sqrt(squaredError / firstSamples.length)).toBeLessThanOrEqual(8);
    // Restore under another root with the original assets unavailable, reopen
    // through the real crew brief and make a small saved finishing revision.
    const packaged = join(directory, "portable-chapter"), restored = join(directory, "different-root");
    exportChapterPackage(db, directory, "p", packaged);
    restoreChapterPackage(packaged, restored);
    const offlineAssets=join(directory,"offline-original-assets");
    if(dirname(assets)!==directory||dirname(offlineAssets)!==directory)throw Error("Fixture move escapes temporary workspace.");
    renameSync(assets, offlineAssets);
    const reopened = new DatabaseSync(join(restored, "db", "heartword.sqlite"));
    try {
      const pictureBrief=loadCrewBrief(reopened,restored,"p","editing");
      expect(pictureBrief.shots.find(s=>s.id==="narration")!.availableClips?.map(c=>c.id)).toContain("narration");
      reopened.prepare("INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at)VALUES('restored-picture','p','editing',?,?,'approved',?,5)")
        .run(crewBriefHash(pictureBrief,"editing"),JSON.stringify(pictureBrief),JSON.stringify(edit));
      const rebuilt=renderEditorialCut(reopened,restored,"p","restored-picture");
      assertChosenTakes(join(restored,"assets",rebuilt.path));
      expect(mediaDurationMs(join(restored,"assets",rebuilt.path))).toBeCloseTo(3000,-2);
      expect(reopened.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get()).toEqual(db.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get());
      const reopenedBrief = loadCrewBrief(reopened, restored, "p", "finishing");
      expect(reopenedBrief.render!.audioMap).toEqual(revisedBrief.render!.audioMap);
      const modified = structuredClone(finish);
      modified.summary = "Lower retained music by 1 dB";
      modified.contributions.composer!.audioCues![0]!.gainDb = -26;
      reopened.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('restored-edit','p','finishing',?,?,'approved',?,4)")
        .run(crewBriefHash(reopenedBrief, "finishing"), JSON.stringify(reopenedBrief), JSON.stringify(modified));
      const preview = applyFinishing(reopened, restored, "p", "restored-edit");
      expect(audioSampleRate(join(restored, "assets", preview.path))).toBe(48000);
      expect(mediaDurationMs(join(restored, "assets", preview.path))).toBeCloseTo(3000, -2);
      const previewPcm = execFileSync("ffmpeg", ["-v", "error", "-i", join(restored, "assets", preview.path), "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
      const previewSamples = new Int16Array(previewPcm.buffer, previewPcm.byteOffset, previewPcm.byteLength / 2);
      expect(previewSamples.length).toBe(firstSamples.length);
      const editedError = previewSamples.reduce((sum, sample, index) => sum + (sample - firstSamples[index]!) ** 2, 0);
      expect(Math.sqrt(editedError / firstSamples.length)).toBeGreaterThan(8);
      expect(reopened.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get()).toEqual(db.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get());
      expect(reopened.prepare("SELECT payload FROM edit_commands WHERE idempotency_key='finishing:restored-edit'").get()).toBeTruthy();
      expect(verifyChapterPackage(packaged).files.length).toBeGreaterThan(6);
      if (process.env.HEARTWORD_PRESERVATION_DEMO_DIR) {
        const demo = process.env.HEARTWORD_PRESERVATION_DEMO_DIR;
        if (requireNewDemo(demo)) {
          mkdirSync(demo);
          cpSync(packaged, join(demo, "chapter-package"), { recursive: true, errorOnExist: true, force: false });
          cpSync(join(restored, "assets", preview.path), join(demo, "revised-preview.mp4"), { errorOnExist: true, force: false });
          const retainedRoot = join(demo, "revised-data");
          mkdirSync(join(retainedRoot, "db"), { recursive: true });
          cpSync(join(restored, "assets"), join(retainedRoot, "assets"), { recursive: true, errorOnExist: true, force: false });
          reopened.exec(`VACUUM INTO '${join(retainedRoot, "db", "heartword.sqlite").replaceAll("'", "''")}'`);
          const retainedDb = new DatabaseSync(join(retainedRoot, "db", "heartword.sqlite"), { readOnly: true });
          try { expect(loadCrewBrief(retainedDb, retainedRoot, "p", "finishing").render!.audioMap).toEqual(reopenedBrief.render!.audioMap); }
          finally { retainedDb.close(); }
          writeFileSync(join(demo, "evidence.json"), JSON.stringify({ fixture: "Synthetic chapter: red/blue picture, 440 Hz original narration, 880 Hz cast speech, 220 Hz music; no generated or invented Scripture.", originalRootUnavailable: true, restoredRoot: retainedRoot, change: "Music cue -24 dB to -26 dB", preview: preview.path, durationMs: mediaDurationMs(join(restored, "assets", preview.path)), costLedgerUnchanged: true, audioMap: reopenedBrief.render!.audioMap, history: reopened.prepare("SELECT command_type,payload FROM edit_commands ORDER BY sequence").all() }, null, 2));
        }
      }
    } finally { reopened.close(); }
  } finally { db.close(); if (relative(tmpdir(), directory).startsWith("heartword-render-test-")) rmSync(directory, { recursive: true, force: true }); }
}, 30000);

function requireNewDemo(path: string) { if (existsSync(path)) throw new Error("Choose a new preservation demo directory."); return true; }

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
