/**
 * Produce the autonomous Mark 4 overnight review cut from retained accepted
 * coverage.  It preserves the unbroken chapter clock, replaces only verified
 * speaker turns with the corresponding cast-master audio, and uses the
 * producer-approved speaking performances.  It does not modify clips or the
 * editable shot plan.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDataDir, getDb } from "../src/db/client.js";

type AudioRow = { id:string; verse_ref:string|null; start_ms:number; end_ms:number; speaker:string|null; speaker_id:string|null };
type Coverage = { id:string; verse_ref:string; scene:number; shot:number; path:string; needs_lip_sync:number };
type Piece = { start:number; end:number; path:string; sourceStart:number; kind:"speaker"|"coverage"|"gap"; verse:string|null };
type SpeakerMedia = { path:string; visualStart?:number; visualEnd?:number };
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir=getDataDir(), db=getDb(), assets=join(dataDir,"assets");
const sourceBinding=db.prepare("SELECT audio_path FROM project_source_bindings WHERE project_id=?").get(projectId) as {audio_path:string}|undefined;
if (!sourceBinding || !existsSync(join(assets,sourceBinding.audio_path))) throw Error("Verified Mark 4 source recording is unavailable.");
const audioRows=db.prepare(`SELECT a.id,a.verse_ref,a.start_ms,a.end_ms,c.name speaker,a.speaker_character_id speaker_id
  FROM audio_segments a LEFT JOIN characters c ON c.id=a.speaker_character_id
  WHERE a.project_id=? AND a.layer='original_reading' ORDER BY a.start_ms`).all(projectId) as AudioRow[];
if (!audioRows.length) throw Error("No Mark 4 source intervals are available.");
const chapterEnd=audioRows.at(-1)!.end_ms;
const coverage=db.prepare(`SELECT s.id,s.verse_ref,sc.sequence scene,s.sequence shot,ga.result_asset_path path,s.needs_lip_sync
  FROM shots s JOIN scenes sc ON sc.id=s.scene_id JOIN generation_attempts ga ON ga.shot_id=s.id
  WHERE sc.project_id=? AND ga.operation='assemble_shot' AND ga.status='accepted'
  AND ga.created_at=(SELECT MAX(ga2.created_at) FROM generation_attempts ga2 WHERE ga2.shot_id=s.id AND ga2.operation='assemble_shot' AND ga2.status='accepted')
  ORDER BY sc.sequence,s.sequence`).all(projectId) as Coverage[];
if (coverage.length !== 96 || coverage.some(c=>!existsSync(join(assets,c.path)))) throw Error("The accepted Mark 4 coverage set is incomplete.");
const probes=new Map<string,number>();
const duration=(path:string)=>{const cached=probes.get(path);if(cached)return cached;const value=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",join(assets,path)],{encoding:"utf8"}).trim())*1000;if(!Number.isFinite(value)||value<100)throw Error(`Unreadable retained media: ${path}`);probes.set(path,value);return value;};
const verseNumbers=(ref:string|null)=>ref?Array.from(ref.matchAll(/:(\d+)(?:-(\d+))?/g)).flatMap(m=>{const a=Number(m[1]),b=Number(m[2]??m[1]);return Array.from({length:b-a+1},(_,i)=>a+i);}):[];
const matches=(cover:Coverage, ref:string|null)=>{const target=verseNumbers(ref), own=verseNumbers(cover.verse_ref); return target.some(v=>own.includes(v));};
const narrated=coverage.filter(c=>!c.needs_lip_sync);
const pickCoverage=(ref:string|null, cursor:{value:number})=>{
  const pool=narrated.filter(c=>matches(c,ref));
  const choices=pool.length?pool:narrated;
  const value=choices[cursor.value++ % choices.length]!;
  return value;
};
const speakerMedia=new Map<string,SpeakerMedia>([
  // The long approved pilots contain their own covered visual sequence.
  ["95b36a21-021d-4ca3-b1d8-c1f5f1569f67",{path:"generated/chapter/mark4-v11-three-clip-pilot-review.mp4"}],
  ["f13972b1-1558-466c-abd8-68cc4a083d37",{path:"generated/chapter/mark4-v21-two-clip-pilot-review.mp4"}],
]);
for(const row of audioRows.filter(r=>r.speaker_id)){
  if(speakerMedia.has(row.id))continue;
  const binding=db.prepare("SELECT shot_id FROM shot_utterance_bindings WHERE source_audio_segment_id=?").get(row.id) as {shot_id:string}|undefined;
  if(!binding)throw Error(`Missing source-bound speaking shot for ${row.verse_ref??"reviewed storm interval"}.`);
  const lip=db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(binding.shot_id) as {result_asset_path:string}|undefined;
  if(!lip||!existsSync(join(assets,lip.result_asset_path)))throw Error(`Accepted lip-sync performance missing for ${row.verse_ref??"reviewed storm interval"}.`);
  speakerMedia.set(row.id,{path:lip.result_asset_path});
}
if(speakerMedia.size!==audioRows.filter(r=>r.speaker_id).length)throw Error("Not every verified speaker turn has approved media.");

const pieces:Piece[]=[]; const cursor={value:0}; let clock=0; let contextualRef:string|null=null;
const addCoverage=(start:number,end:number,ref:string|null,kind:"coverage"|"gap")=>{let pos=start;while(pos<end){const chosen=pickCoverage(ref,cursor),available=duration(chosen.path),take=Math.min(end-pos,available);pieces.push({start:pos,end:pos+take,path:chosen.path,sourceStart:0,kind,verse:ref});pos+=take;}};
for(const row of audioRows){
  if(row.start_ms>clock)addCoverage(clock,row.start_ms,contextualRef,"gap");
  if(row.verse_ref)contextualRef=row.verse_ref;
  if(row.speaker_id){const media=speakerMedia.get(row.id)!;if(!existsSync(join(assets,media.path)))throw Error(`Approved speaking media is missing: ${media.path}`);const desired=row.end_ms-row.start_ms;if(duration(media.path)+20<desired)throw Error(`Approved speaking media is too short for ${row.verse_ref??"speaker interval"}.`);pieces.push({start:row.start_ms,end:row.end_ms,path:media.path,sourceStart:media.visualStart??0,kind:"speaker",verse:row.verse_ref});}
  else addCoverage(row.start_ms,row.end_ms,row.verse_ref??contextualRef,"coverage");
  clock=row.end_ms;
}
if(clock<chapterEnd)addCoverage(clock,chapterEnd,contextualRef,"gap");
if(!pieces.length||pieces[0]!.start!==0||pieces.at(-1)!.end!==chapterEnd)throw Error("Visual plan does not cover the complete chapter clock.");
for(let i=1;i<pieces.length;i++)if(pieces[i-1]!.end!==pieces[i]!.start)throw Error("Visual plan has a gap or overlap.");

type AudioOverlay={row:AudioRow;path:string;startMs:number;endMs:number};
const overlays:AudioOverlay[]=[];
for(const row of audioRows.filter(r=>r.speaker_id)){
  const mapped=db.prepare(`SELECT composite.source_path,original.start_ms original_start,original.end_ms original_end,composite.start_ms composite_start,composite.end_ms composite_end
    FROM composite_audio_source_map map JOIN audio_segments original ON original.id=map.original_segment_id
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
    WHERE map.original_segment_id=?`).get(row.id) as {source_path:string;original_start:number;original_end:number;composite_start:number;composite_end:number}|undefined;
  if(!mapped||!existsSync(join(assets,mapped.source_path)))throw Error(`Cast-master audio is missing for ${row.verse_ref??"speaker interval"}.`);
  const scale=(mapped.composite_end-mapped.composite_start)/(mapped.original_end-mapped.original_start);
  overlays.push({row,path:mapped.source_path,startMs:0,endMs:Math.round((row.end_ms-row.start_ms)*scale)});
}
const tmp=mkdtempSync(join(tmpdir(),"heartword-mark4-autonomous-"));
const outRel="generated/chapter/mark4-autonomous-overnight-review.mp4",out=join(assets,outRel);
mkdirSync(join(assets,"generated","chapter"),{recursive:true});
try {
  // A concat manifest keeps this Windows invocation below the command-line
  // limit while retaining an explicit trim for every approved visual piece.
  const quoteForConcat=(path:string)=>path.replace(/'/g,"'\\\\''");
  const visualManifest=join(tmp,"visuals.ffconcat");
  writeFileSync(visualManifest,["ffconcat version 1.0",...pieces.flatMap(piece=>[
    `file '${quoteForConcat(join(assets,piece.path))}'`,
    `inpoint ${(piece.sourceStart/1000).toFixed(3)}`,
    `outpoint ${((piece.sourceStart+piece.end-piece.start)/1000).toFixed(3)}`,
  ])].join("\n"));
  const audioInputs=overlays.flatMap(overlay=>["-i",join(assets,overlay.path)]);
  const sourceInput=1;
  const muted=`[${sourceInput}:a]atrim=duration=${(chapterEnd/1000).toFixed(3)},asetpts=PTS-STARTPTS,volume=0:enable='${overlays.map(o=>`between(t,${(o.row.start_ms/1000).toFixed(3)},${(o.row.end_ms/1000).toFixed(3)})`).join("+")}'[base]`;
  const audioFilters=overlays.map((overlay,i)=>`[${sourceInput+1+i}:a]atrim=start=${(overlay.startMs/1000).toFixed(3)}:end=${(overlay.endMs/1000).toFixed(3)},asetpts=PTS-STARTPTS,adelay=${overlay.row.start_ms}|${overlay.row.start_ms}[a${i}]`);
  const audioMix=`[base]${overlays.map((_,i)=>`[a${i}]`).join("")}amix=inputs=${overlays.length+1}:duration=first:dropout_transition=0[audio]`;
  const filter=[`[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[video]`,muted,...audioFilters,audioMix].join(";");
  const args=["-v","error","-y","-f","concat","-safe","0","-i",visualManifest,"-i",join(assets,sourceBinding.audio_path),...audioInputs,"-filter_complex",filter,"-map","[video]","-map","[audio]","-t",(chapterEnd/1000).toFixed(3),"-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",out];
  writeFileSync(join(tmp,"ffmpeg-args.json"),JSON.stringify(args));
  execFileSync("ffmpeg",args,{stdio:["ignore","ignore","pipe"]});
  const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);
  if(Math.abs(actual-chapterEnd)>150)throw Error(`Render duration ${actual}ms does not match source clock ${chapterEnd}ms.`);
  const manifest={purpose:"Autonomous producer-reviewable Mark 4 cut; independent approved takes are placed only at their verified source turns, with retained narration coverage between them.",chapterEndMs:chapterEnd,sourceAudio:sourceBinding.audio_path,speakerOverlays:overlays.map(o=>({sourceSegmentId:o.row.id,verseRef:o.row.verse_ref,speaker:o.row.speaker,sourceStartMs:o.row.start_ms,sourceEndMs:o.row.end_ms,castAudio:o.path,castStartMs:o.startMs,castEndMs:o.endMs})),visualPieces:pieces};
  const manifestRel="generated/chapter/mark4-autonomous-overnight-review.json";writeFileSync(join(assets,manifestRel),JSON.stringify(manifest,null,2));
  const id=randomUUID(),now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,pieces.length,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify(pieces),JSON.stringify({mode:"continuous_original_with_source_bound_cast_overlays",source:sourceBinding.audio_path,overlays:manifest.speakerOverlays,editableManifest:manifestRel}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  console.log(JSON.stringify({renderPath:outRel,manifestPath:manifestRel,durationMs:actual,visualPieces:pieces.length,speakerTurns:overlays.length},null,2));
} finally {rmSync(tmp,{recursive:true,force:true});}
