/** Independent picture QC of a proposed local retime; no database mutation. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewGeneratedVideo, videoReviewPassed } from "../src/pipeline/qc/video-review.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=join(checkout,"output","mark4-donor-20261024");
const original=join(root,"assets","generated","video","cb4aff40-0cf8-47b1-a8e7-13781d00654a-ltx-e48f2cc4-9e92-450b-8b6c-d2e25fe83bf9.mp4");
const retimed=join(root,"review","shot044-clean-opening-20261027","retimed-interpolated-v2.mp4");
const keyframe=join(root,"assets","generated","keyframes","codex","cb4aff40-0cf8-47b1-a8e7-13781d00654a","8ea28194-0115-4c9e-8292-148e46f2e287.png");
const receiptPath=join(root,"review","shot044-clean-opening-20261027","retimed-interpolated-v2.qc.json");
if(![original,retimed,keyframe].every(existsSync)||existsSync(receiptPath))throw new Error("Exact local review inputs are missing or already reviewed.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const result=await reviewGeneratedVideo({videoPath:retimed,keyframePath:keyframe,
  instruction:"Approved Mark 4:13 silent reaction: Peter and clean-shaven John listen to Jesus by the lake; three approved Papuan characters only. No visible speech by any person. This is a locally retimed, optically interpolated 0–0.5 second clean opening from the retained LTX take, covering the 2.343-second editorial placement. Judge the entire resulting short clip for believable quiet listening, face integrity, temporal artifacts, and no apparent dialogue."});
const receipt={kind:"isolated_meyah_mark4_shot044_retime_qc",sourceAttemptId:"8ef63689-713a-49fc-a161-78b50c89631a",originalSha256:hash(original),retimedSha256:hash(retimed),keyframeSha256:hash(keyframe),approvedWindowMs:2343,retimedDurationMs:2375,retainedSourceWindowMs:500,retimeFactor:5.6,interpolation:"ffmpeg minterpolate fps=24 mci aobmc bidir",verdict:result.verdict,reviewPassed:videoReviewPassed(result.verdict),costUsd:result.costUsd,reviewInput:result.reviewInput??null};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({reviewPassed:receipt.reviewPassed,verdict:receipt.verdict,costUsd:receipt.costUsd,receiptPath},null,2));
