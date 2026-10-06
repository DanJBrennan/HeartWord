/** Held v59: replace seven scorecard-classified near-frozen holds with actual
 * moving, same-world retained coverage. The audio from v58 is copied exactly.
 * No new generation or source-word timing change occurs here. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
type Replacement = { at: number; frames: number; path: string; start: number; crop?: boolean; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", fps = 24, total = 13831;
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v58-calibrated-ambience-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v59-moving-coverage-held.mp4";
const assembled = "generated/assembled/";
const replacements: Replacement[] = [
  { at:4731, frames:139, path:`${assembled}dd78acd1-a146-48de-bddb-ac0a18a44674.mp4`, start:0, label:"moving olive-grove listener cover" },
  { at:4870, frames:122, path:`${assembled}31139734-b0c9-4454-b04a-d8d378d20ed6.mp4`, start:20, label:"moving olive-grove listener reflection" },
  { at:5100, frames:76, path:`${assembled}cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4`, start:24, label:"moving wide private-teaching group" },
  { at:5351, frames:121, path:`${assembled}cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4`, start:70, crop:true, label:"moving olive-grove wide, alternate framing" },
  { at:6128, frames:82, path:`${assembled}dd78acd1-a146-48de-bddb-ac0a18a44674.mp4`, start:60, crop:true, label:"moving olive-grove listener, alternate framing" },
  { at:8045, frames:103, path:`${assembled}e282642c-bacb-425b-815a-93d69dc1e243.mp4`, start:0, label:"moving field illustration after shore performance" },
  { at:10302, frames:192, path:`${assembled}29cda8f3-2c78-4cbb-829a-1d67be2951ef.mp4`, start:0, label:"moving private olive-grove explanation cover" }
];
const data=getDataDir(), assets=join(data,"assets"), input=join(assets,inputRel), output=join(assets,outputRel);
if(!existsSync(input)) throw new Error(`Missing v58 held cut: ${inputRel}`);
for(const item of replacements) if(!existsSync(join(assets,item.path))) throw new Error(`Missing retained coverage: ${item.path}`);
let cursor=0; const pieces:Array<Replacement|{at:number;frames:number;path:string;start:number;label:string}> = [];
for(const item of replacements){if(item.at<cursor||item.at+item.frames>total)throw new Error(`Invalid ${item.label}`);if(item.at>cursor)pieces.push({at:cursor,frames:item.at-cursor,path:inputRel,start:cursor,label:"retained picture"});pieces.push(item);cursor=item.at+item.frames;}if(cursor<total)pieces.push({at:cursor,frames:total-cursor,path:inputRel,start:cursor,label:"retained picture"});
const paths=[...new Set(pieces.map(p=>p.path))], indices=new Map(paths.map((p,i)=>[p,i]));
const filters=pieces.map((piece,i)=>{const core=`[${indices.get(piece.path)!}:v]trim=start_frame=${piece.start}:end_frame=${piece.start+piece.frames},setpts=PTS-STARTPTS,fps=${fps}`;return "crop" in piece && piece.crop?`${core},scale=1408:792,crop=1280:720:64:36,setsar=1[p${i}]`:`${core},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[p${i}]`;});
filters.push(`${pieces.map((_,i)=>`[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[v]`);
execFileSync("ffmpeg",["-v","error","-y",...paths.flatMap(p=>["-i",join(assets,p)]),"-filter_complex",filters.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});
const count=Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=nb_frames","-select_streams","v:0","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(count!==total)throw new Error(`Expected ${total} frames, got ${count}.`);
const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,576292,pieces.length,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,replacements}),JSON.stringify({audioBase:inputRel,sourceCastAudioCopied:true}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({outputRel,count,heldForReview:true},null,2));
