/** Held v60: remove the five actual non-adjacent duplicate images identified
 * by v59. Later uses only are replaced with different retained listener or
 * same-world coverage; audio and timing remain locked. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
type R={at:number;frames:number;path:string;start:number;crop?:boolean;label:string};
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",fps=24,total=13831;
const inputRel="generated/chapter/mark4-autonomous-overnight-final-v59-moving-coverage-held.mp4";
const outputRel="generated/chapter/mark4-autonomous-overnight-final-v60-duplicate-coverage-held.mp4";
const assembled="generated/assembled/";
const repairs:R[]=[
 {at:5580,frames:60,path:`${assembled}dd78acd1-a146-48de-bddb-ac0a18a44674.mp4`,start:18,label:"distinct olive listener replaces repeated seated group"},
 {at:6305,frames:96,path:`${assembled}31139734-b0c9-4454-b04a-d8d378d20ed6.mp4`,start:72,label:"distinct olive listener replaces repeated two-men view"},
 {at:6508,frames:24,path:`${assembled}dd78acd1-a146-48de-bddb-ac0a18a44674.mp4`,start:130,crop:true,label:"alternate olive listener replaces brief repeat"},
 {at:7264,frames:178,path:`${assembled}c84b12da-2581-4e08-8bcc-513e41b6b79b.mp4`,start:0,label:"distinct lakeshore listener replaces repeated shore pair"},
 {at:12616,frames:120,path:`${assembled}0a8f900e-14c3-4490-b27b-f78ef2429292.mp4`,start:0,label:"distinct calm-boat reaction replaces returned row tableau"}
];
const data=getDataDir(),assets=join(data,"assets"),input=join(assets,inputRel),output=join(assets,outputRel);if(!existsSync(input))throw new Error(`Missing v59: ${inputRel}`);for(const r of repairs)if(!existsSync(join(assets,r.path)))throw new Error(`Missing ${r.path}`);
let cursor=0;const pieces:Array<R|{at:number;frames:number;path:string;start:number;label:string}>=[];for(const r of repairs){if(r.at<cursor||r.at+r.frames>total)throw new Error(`Invalid ${r.label}`);if(r.at>cursor)pieces.push({at:cursor,frames:r.at-cursor,path:inputRel,start:cursor,label:"retained picture"});pieces.push(r);cursor=r.at+r.frames;}if(cursor<total)pieces.push({at:cursor,frames:total-cursor,path:inputRel,start:cursor,label:"retained picture"});
const paths=[...new Set(pieces.map(p=>p.path))],idx=new Map(paths.map((p,i)=>[p,i]));const filters=pieces.map((p,i)=>{const core=`[${idx.get(p.path)!}:v]trim=start_frame=${p.start}:end_frame=${p.start+p.frames},setpts=PTS-STARTPTS,fps=${fps}`;return "crop" in p&&p.crop?`${core},scale=1408:792,crop=1280:720:64:36,setsar=1[p${i}]`:`${core},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[p${i}]`;});filters.push(`${pieces.map((_,i)=>`[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[v]`);
execFileSync("ffmpeg",["-v","error","-y",...paths.flatMap(p=>["-i",join(assets,p)]),"-filter_complex",filters.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});
const count=Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=nb_frames","-select_streams","v:0","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(count!==total)throw new Error(`Frame-lock failed: ${count}`);const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,576292,pieces.length,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,replacements:repairs}),JSON.stringify({audioBase:inputRel,sourceCastAudioCopied:true}));db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e};console.log(JSON.stringify({outputRel,count,heldForReview:true},null,2));
