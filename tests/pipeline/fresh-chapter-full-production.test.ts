import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import express from "express";
import { afterEach, expect, it, vi } from "vitest";
import { EDITORIAL_CHECKS } from "../../src/pipeline/qc/editorial-review.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root = "", server: ReturnType<express.Express["listen"]> | undefined;
const image = vi.fn(), video = vi.fn(), sync = vi.fn();
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));
vi.mock("../../src/providers/elevenlabs.js", () => ({ reVoiceAudio: vi.fn(async (_: string, path: string) => ({ audioBuffer: readFileSync(path) })) }));
vi.mock("../../src/providers/gemini/index.js", () => ({ GeminiImageProvider: class { generate = image; }, GeminiVideoProvider: class { generateFinal = video; }, GeminiDraftVideoProvider: class { generateDraft = video; } }));
vi.mock("../../src/providers/kling/index.js", () => ({ KlingLipSyncProvider: class { sync = sync; }, KlingVideoProvider: class { generateFinal = video; } }));
vi.mock("../../src/providers/gemini-text.js", () => {
  const contribution = (prompt: string, schema: any) => {
    if (schema.properties.score) return { score: 100, instanceCount: 1, wardrobeStatus: "match", wardrobeNotes: "Synthetic canon wardrobe matches.", notes: "Synthetic reference match." };
    if (schema.properties.settingScore) return { settingScore: 100, crowdDensityMatch: true, actionMatch: true, continuityViolation: false, notes: "Synthetic fixture passes." };
    if (schema.properties.largestIdenticalGroup) return { largestIdenticalGroup: 1, location: "none", explanation: "No duplicate.", confidence: 100, limitations: "fixture" };
    if (schema.properties.shots) return { reasoning: "Synthetic source-grounded plan.", lightingContinuity: "daylight", shots: [
      { action: "Narration view of the stated event.", characterNames: [], verseRef: "Mark 5:1", framing: "wide", cameraMovement: "static", needsLipSync: false, dialogueCharacterName: "", crowdDensity: "sparse", continuityNotes: "No invented action." },
      { action: "Synthetic speaker delivers the second approved line.", characterNames: ["Synthetic speaker"], verseRef: "Mark 5:2", framing: "close_up", cameraMovement: "static", needsLipSync: true, dialogueCharacterName: "Synthetic speaker", crowdDensity: "sparse", continuityNotes: "One speaker only." },
      { action: "Synthetic speaker delivers the third approved line.", characterNames: ["Synthetic speaker"], verseRef: "Mark 5:3", framing: "close_up", cameraMovement: "static", needsLipSync: true, dialogueCharacterName: "Synthetic speaker", crowdDensity: "sparse", continuityNotes: "One speaker only." }
    ] };
    const role = prompt.match(/HeartWord's ([^.]+)\./)?.[1]?.replaceAll(" ", "_");
    const briefText = prompt.split("CHAPTER BRIEF:\n")[1]?.split("\nTEAM CONTRIBUTIONS")[0] ?? "{}";
    const brief = JSON.parse(briefText);
    const directions = (brief.shots ?? []).map((s: any) => ({ shotId: s.id, instruction: "Preserve the exact approved source order.", scriptureBasis: s.verseRef }));
    const base: any = { summary: `Synthetic ${role} approval.`, directions, findings: [] };
    if (role === "picture_editor") {
      const timeline = (brief.shots ?? []).every((s: any) => s.clip) ? (brief.shots ?? []).map((s: any, i: number) => ({ shotId: s.id, sourceStartMs: 0, durationMs: brief.audio[i].endMs - brief.audio[i].startMs })) : [];
      Object.assign(base, { coverageRequests: [], edits: timeline, pauses: [] });
      if (prompt.includes("Phase: finishing")) base.editorialChecks = EDITORIAL_CHECKS.map(name => ({ name, status: "clear", startMs: 0, endMs: brief.render.durationMs, evidence: "Synthetic fixture review of the complete cut", requestedChange: "None" }));
    }
    if (role === "colorist") base.colorAdjustments = [];
    if (role === "sound_designer" || role === "composer") Object.assign(base, { audioCues: [], generationRequests: [] });
    if (role === "production_director") base.decision = "approve";
    return base;
  };
  return { GEMINI_TEXT_MODEL: "synthetic", generateJson: vi.fn(async (p: string, s: any) => contribution(p, s)), generateJsonWithImages: vi.fn(async (p: string, _m: any, s: any) => contribution(p, s)),
    generateJsonWithImagesMetered: vi.fn(async (p: string, _m: any, s: any) => ({ result: contribution(p, s), usage: { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0 }, costUsd: 0 })),
    generateGroundedText: vi.fn(async () => ({ text: "No issue.\nSEVERITY: none\nSUGGESTED FIX: none\nPRESERVE: everything\nFINDINGS_JSON: {\"findings\":[]}", sources: [], searchQueries: [] })) };
});

const cleanup = () => { if (server) server.close(); db?.close(); if (root) rmSync(root, { recursive: true, force: true }); root = ""; server = undefined; };
const originalGeminiKey=process.env.GEMINI_API_KEY;
afterEach(() => { vi.unstubAllEnvs(); if(originalGeminiKey===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originalGeminiKey; cleanup(); });
function docx(lines: string[]) { const n=Buffer.from("word/document.xml"), b=Buffer.from(`<w:document>${lines.map(x=>`<w:p><w:r><w:t>${x}</w:t></w:r></w:p>`).join("")}</w:document>`), l=Buffer.alloc(30), c=Buffer.alloc(46), e=Buffer.alloc(22); l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50,0);c.writeUInt32LE(b.length,20);c.writeUInt16LE(n.length,28);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(1,10);e.writeUInt32LE(l.length+n.length+b.length,16);return Buffer.concat([l,n,b,c,n,e]); }
function mp4(path: string, color: string) { mkdirSync(dirname(path), { recursive:true }); execFileSync("ffmpeg", ["-v","error","-y","-f","lavfi","-i",`color=${color}:s=160x90:r=24:d=1`,"-f","lavfi","-i","sine=frequency=440:duration=1","-shortest","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",path]); }

it("takes a fresh reviewed chapter through real common stages without provider calls", async () => {
  vi.stubEnv("HEARTWORD_VIDEO_PROVIDER","veo");
  delete process.env.GEMINI_API_KEY;
  root=mkdtempSync(join(tmpdir(),"hw-full-fresh-")); const assets=join(root,"assets"), source=join(assets,"source","hatam","mark-5"); mkdirSync(source,{recursive:true});
  writeFileSync(join(source,"mark-5-text.docx"),docx(["MARKUS 5","Synthetic published heading","(Mat. 1:1)","1Approved narration.","2Approved spoken line.","3Approved second spoken line."]));
  const ref=join(assets,"reference","english","mark-5"); mkdirSync(ref,{recursive:true}); writeFileSync(join(ref,"mark-5-text.docx"),docx(["1Approved narration.","2Approved spoken line.","3Approved second spoken line."]));
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=0.5","-f","lavfi","-i","anullsrc=r=44100:cl=mono:d=0.5","-f","lavfi","-i","sine=frequency=480:duration=0.5","-f","lavfi","-i","anullsrc=r=44100:cl=mono:d=0.5","-f","lavfi","-i","sine=frequency=520:duration=0.5","-filter_complex","[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1","-c:a","libmp3lame",join(source,"mark-5-fcbh-audio.mp3")]);
  writeFileSync(join(assets,"canon.png"),"synthetic canon"); mp4(join(assets,"returned.mp4"),"blue"); writeFileSync(join(assets,"key.png"),"synthetic keyframe");
  image.mockResolvedValue({status:"accepted",media:{path:"key.png"},cost:{usd:0},provenance:{provider:"mock-image",model:"mock",prompt:"fixture"}}); video.mockResolvedValue({status:"accepted",media:{path:"returned.mp4"},cost:{usd:0},provenance:{provider:"mock-video",model:"mock",prompt:"fixture"}}); sync.mockResolvedValue({media:{path:"returned.mp4"},cost:{usd:0},provenance:{provider:"mock-lipsync",model:"mock",prompt:"fixture"}});
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh-full','hatam','mark',5,1,1); INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('speaker','Synthetic speaker','global','approved','Papuan',1,1); INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,created_at) VALUES ('voice','speaker','synthetic','approved','elevenlabs','fixture',1); INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('canon','voice','headshot','canon.png',1)");
  const { runPipeline }=await import("../../src/pipeline/orchestrator.js");
  const initial=await runPipeline("fresh-full"); expect(initial).toMatchObject({stoppedAt:"ingestion"}); expect(initial.results[0]?.reasoning).toContain("Aligned 3 verse-group");
  const segments=db.prepare("SELECT id,verse_ref FROM audio_segments WHERE project_id='fresh-full' ORDER BY start_ms").all() as Array<{id:string;verse_ref:string}>; expect(segments).toHaveLength(3);
  // This is the fixture's explicit source-review decision: two exact source
  // intervals are confirmed as the approved speaker before attestation.
  db.prepare("UPDATE audio_segments SET speaker_character_id='speaker' WHERE id IN (?,?)").run(segments[1]!.id,segments[2]!.id);
  const { projectsRouter }=await import("../../src/server/routes/projects.js"); const app=express(); app.use(express.json()); app.use("/api/projects",projectsRouter); await new Promise<void>(resolve=>{server=app.listen(0,resolve);}); const port=(server.address() as any).port;
  const review=await fetch(`http://127.0.0.1:${port}/api/projects/fresh-full/source-alignment-review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reviewerName:"Synthetic language reviewer",attestation:"confirm",evidence:"Compared each fixture interval with the supplied DOCX, audio, and English reference."})}); expect(review.status).toBe(201);
  const planned=await runPipeline("fresh-full"); expect(planned.stoppedAt, planned.results.at(-1)?.reasoning).toBe("media_generation");
  const { acceptFinalVideoCandidate }=await import("../../src/pipeline/media-generation/final-video.js");
  const videoCandidates=db.prepare("SELECT id FROM generation_attempts WHERE operation='generate_final_video'").all() as Array<{id:string}>;
  expect(videoCandidates).toHaveLength(1);
  for(const row of videoCandidates) acceptFinalVideoCandidate(db,"fresh-full",row.id,1000);
  const afterVideo=await runPipeline("fresh-full"); expect(afterVideo.stoppedAt, JSON.stringify(db.prepare("SELECT note FROM review_notes WHERE note LIKE 'REVIEW STATUS:%'").all())).toBe("voice_lipsync");
  const shots=db.prepare("SELECT id,verse_ref FROM shots WHERE needs_lip_sync=1 ORDER BY sequence").all() as Array<{id:string;verse_ref:string}>; const { bindShotUtterance }=await import("../../src/pipeline/voice-lipsync/utterance-binding.js"); for(const [i,shot] of shots.entries()) { const sourceSegment=segments[i+1]!; const row=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=?").get(sourceSegment.id) as {start_ms:number;end_ms:number}; bindShotUtterance(db,{projectId:"fresh-full",shotId:shot.id,sourceSegmentId:sourceSegment.id,startMs:row.start_ms,endMs:row.end_ms,characterVersionId:"voice",approvedBy:"Synthetic producer"}); }
  expect((await runPipeline("fresh-full")).stoppedAt).toBe("voice_lipsync");
  const { acceptLipSyncCandidate }=await import("../../src/pipeline/voice-lipsync/candidate-selection.js"); for(const row of db.prepare("SELECT id FROM generation_attempts WHERE operation='lip_sync'").all() as Array<{id:string}>) acceptLipSyncCandidate(db,"fresh-full",row.id);
  const { assembleSingleShot }=await import("../../src/pipeline/assembly/assemble-single-shot.js"); for(const row of db.prepare("SELECT id FROM shots ORDER BY sequence").all() as Array<{id:string}>) assembleSingleShot(db,row.id);
  const finished=await runPipeline("fresh-full"); expect(finished.stoppedAt, finished.results.at(-1)?.reasoning).toBeUndefined(); expect(db.prepare("SELECT COUNT(*) n FROM chapter_renders WHERE project_id='fresh-full'").get()).toMatchObject({n:expect.any(Number)}); expect(sync).toHaveBeenCalledTimes(2);
  const accepted=db.prepare("SELECT COUNT(*) n FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE ga.operation='lip_sync' AND ga.status='accepted'").get() as {n:number}; expect(accepted.n).toBe(2);
  expect((await runPipeline("fresh-full")).results.every(r=>r.reasoning.startsWith("Reused valid"))).toBe(true);
},30000);
