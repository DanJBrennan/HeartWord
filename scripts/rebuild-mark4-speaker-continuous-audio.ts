/** Build a non-overlapping source/cast master so cover shots retain the attributed speaker's voice. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
type Turn={id:string;start_ms:number;end_ms:number;verse_ref:string|null;speaker:string;path:string;composite_ms:number};
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",dataDir=getDataDir(),assets=join(dataDir,"assets"),db=getDb();
// Defaults preserve the historical v13 rebuild.  A review pass can provide a
// verified picture candidate and distinct held output without touching either
// input or silently overwriting the approved render.
const picture=process.env.MARK4_PICTURE ?? "generated/chapter/mark4-autonomous-overnight-final-v11-speaking-restored.mp4",
  outRel=process.env.MARK4_OUTPUT ?? "generated/chapter/mark4-autonomous-overnight-final-v13-parable-voice-repaired.mp4",
  out=join(assets,outRel),sourceEnd=515.792,intro=11.5,total=551.292;
const source=db.prepare("SELECT audio_path FROM project_source_bindings WHERE project_id=?").get(projectId) as {audio_path:string}|undefined;
const bed=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Quiet looping chapter underscoring' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
const finale=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Mark 4 post-source dawn-horizon ending' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
if(!source||!bed||!finale)throw Error("Required source or score assets are unavailable.");
const turns=db.prepare(`SELECT a.id,a.start_ms,a.end_ms,a.verse_ref,c.name speaker,co.source_path,co.start_ms composite_start,co.end_ms composite_end
  FROM audio_segments a JOIN characters c ON c.id=a.speaker_character_id JOIN composite_audio_source_map m ON m.original_segment_id=a.id
  JOIN audio_segments co ON co.id=m.composite_segment_id WHERE a.project_id=? AND a.layer='original_reading' AND a.speaker_character_id IS NOT NULL ORDER BY a.start_ms`).all(projectId).map((r:any)=>({...r,path:r.source_path,composite_ms:r.composite_end-r.composite_start})) as Turn[];
for(const path of [picture,source.audio_path,bed.path,finale.path,...turns.map(t=>t.path)])if(!existsSync(join(assets,path)))throw Error(`Missing continuous-audio input: ${path}`);
let cursor=0,label=0;const filters:string[]=[];const pieces:string[]=[];
for(const [i,turn] of turns.entries()){
  const start=turn.start_ms/1000,end=turn.end_ms/1000,duration=end-start;
  if(start>cursor){filters.push(`[1:a]atrim=start=${cursor.toFixed(3)}:end=${start.toFixed(3)},asetpts=PTS-STARTPTS[o${label}]`);pieces.push(`[o${label++}]`);}
  const compositeSeconds=turn.composite_ms/1000,tempo=(compositeSeconds/duration).toFixed(6),input=2+i;
  filters.push(`[${input}:a]atrim=start=0:end=${compositeSeconds.toFixed(3)},asetpts=PTS-STARTPTS,atempo=${tempo},atrim=duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS[c${label}]`);pieces.push(`[c${label++}]`);cursor=end;
}
if(cursor<sourceEnd){filters.push(`[1:a]atrim=start=${cursor.toFixed(3)}:end=${sourceEnd.toFixed(3)},asetpts=PTS-STARTPTS[o${label}]`);pieces.push(`[o${label++}]`);}
filters.push(`${pieces.join("")}concat=n=${pieces.length}:v=0:a=1[chapter]`);
const bedInput=2+turns.length,finaleInput=bedInput+1,outroStart=intro+sourceEnd;
filters.push(`anullsrc=r=44100:cl=stereo:d=${intro}[introSilence]`,`anullsrc=r=44100:cl=stereo:d=24[outroSilence]`,`[introSilence][chapter][outroSilence]concat=n=3:v=0:a=1[rawProgram]`,`[rawProgram]volume=10dB[program]`,`[${bedInput}:a]atrim=duration=${total},asetpts=PTS-STARTPTS,volume='if(lt(t,10.5),0.55,if(lt(t,12),0.55-(t-10.5)*0.3433333,0.035))'[bed]`,`[${finaleInput}:a]atrim=duration=24,asetpts=PTS-STARTPTS,volume=0.8,adelay=${Math.round(outroStart*1000)}:all=1[finale]`,`[program][bed][finale]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=false[mix]`,`[mix]loudnorm=I=-16:TP=-1.5:LRA=11[audio]`);
const args=["-v","error","-y","-i",join(assets,picture),"-i",join(assets,source.audio_path),...turns.flatMap(t=>["-i",join(assets,t.path)]),"-stream_loop","-1","-i",join(assets,bed.path),"-i",join(assets,finale.path),"-filter_complex",filters.join(";"),"-map","0:v:0","-map","[audio]","-t",String(total),"-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",out];
execFileSync("ffmpeg",args,{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);if(Math.abs(actual-Math.round(total*1000))>150)throw Error("Continuous-speaker-audio candidate has wrong duration.");
const id=randomUUID();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"approved_pre_source_lake_title_hold",startMs:0,endMs:4000},{kind:"approved_opening_location_coverage",startMs:4000,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({pictureBase:picture,audioMode:"contiguous original narrator spans plus contiguous source-bound cast spans",castTurns:turns.map(t=>({verseRef:t.verse_ref,speaker:t.speaker,startMs:t.start_ms,endMs:t.end_ms,path:t.path})),narrationPriority:true}));db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
console.log(JSON.stringify({outRel,durationMs:actual,castTurns:turns.length},null,2));
