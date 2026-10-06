/** Held v61: finish the remaining three olive-grove duplicate replacements.
 * Later occurrence only; retained audio, duration and scene geography. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
type R={at:number;frames:number;path:string;start:number;crop?:boolean;label:string};
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",fps=24,total=13831;
const inputRel="generated/chapter/mark4-autonomous-overnight-final-v60-duplicate-coverage-held.mp4";
const outputRel="generated/chapter/mark4-autonomous-overnight-final-v61-olive-duplicates-held.mp4";
const a="generated/assembled/";
const repairs:R[]=[
 {at:5580,frames:60,path:`${a}dd78acd1-a146-48de-bddb-ac0a18a44674.mp4`,start:24,label:"alternate olive listener response"},
 {at:6210,frames:191,path:`${a}cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4`,start:0,label:"wide olive teaching group replaces repeated over-shoulder pair"},
 {at:6508,frames:24,path:`${a}31139734-b0c9-4454-b04a-d8d378d20ed6.mp4`,start:132,crop:true,label:"brief alternate olive listener continuation"}
];
const data=getDataDir(),assets=join(data,"assets"),input=join(assets,inputRel),output=join(assets,outputRel);if(!existsSync(input))throw Error(`Missing v60 ${inputRel}`);for(const r of repairs)if(!existsSync(join(assets,r.path)))throw Error(`Missing ${r.path}`);let cur=0;const pieces:Array<R|{at:number;frames:number;path:string;start:number;label:string}>=[];for(const r of repairs){if(r.at<cur||r.at+r.frames>total)throw Error(`Invalid ${r.label}`);if(r.at>cur)pieces.push({at:cur,frames:r.at-cur,path:inputRel,start:cur,label:"retained"});pieces.push(r);cur=r.at+r.frames;}if(cur<total)pieces.push({at:cur,frames:total-cur,path:inputRel,start:cur,label:"retained"});const paths=[...new Set(pieces.map(p=>p.path))],idx=new Map(paths.map((p,i)=>[p,i]));const fs=pieces.map((p,i)=>{const core=`[${idx.get(p.path)!}:v]trim=start_frame=${p.start}:end_frame=${p.start+p.frames},setpts=PTS-STARTPTS,fps=${fps}`;return "crop" in p&&p.crop?`${core},scale=1408:792,crop=1280:720:64:36,setsar=1[p${i}]`:`${core},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[p${i}]`;});fs.push(`${pieces.map((_,i)=>`[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[v]`);execFileSync("ffmpeg",["-v","error","-y",...paths.flatMap(p=>["-i",join(assets,p)]),"-filter_complex",fs.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});const count=Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=nb_frames","-select_streams","v:0","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(count!==total)throw Error(`Frame-lock failed ${count}`);const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,576292,pieces.length,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,replacements:repairs}),JSON.stringify({audioBase:inputRel,sourceCastAudioCopied:true}));db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e};console.log(JSON.stringify({outputRel,count,heldForReview:true},null,2));
