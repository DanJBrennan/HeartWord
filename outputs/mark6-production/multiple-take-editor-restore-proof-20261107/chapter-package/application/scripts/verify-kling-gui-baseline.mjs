/** Local evidence only. Reproduce the decoded-frame match and audio comparison. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.HEARTWORD_DATA_DIR || 'C:/Users/danbr/HeartWordData';
const dir=join(root,'research/kling-avatar-2026-10-14');
const hash=p=>createHash('sha256').update(readFileSync(join(dir,p))).digest('hex');
const decoded=p=>execFileSync('ffmpeg',['-v','error','-i',join(dir,p),'-map','0:v:0','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
const pcm=p=>{const b=execFileSync('ffmpeg',['-v','error','-i',join(dir,p),'-vn','-ac','1','-ar','8000','-f','f32le','-']);return new Float32Array(b.buffer,b.byteOffset,b.length/4);};
const a=pcm('gui-original-test-audio.mp3'),b=pcm('best-lip-sync-jesus.original.mp4');
function correlation(lag){let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i+=2){const j=i+lag;if(j<0||j>=b.length)continue;ab+=a[i]*b[j];aa+=a[i]*a[i];bb+=b[j]*b[j];}return ab/Math.sqrt(aa*bb);}
let best={lag:0,correlation:-1};for(let lag=-2400;lag<=2400;lag+=8){const c=correlation(lag);if(c>best.correlation)best={lag,correlation:c};}
for(let lag=best.lag-8;lag<=best.lag+8;lag++){const c=correlation(lag);if(c>best.correlation)best={lag,correlation:c};}
const db=new DatabaseSync(join(root,'db/heartword.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
const imageHash=hash('gui-source-image.png');
const comparisonPath=join(dir,'comparison-run.json');
const comparisonRun=existsSync(comparisonPath)?JSON.parse(readFileSync(comparisonPath,'utf8')):null;
const canonMatches=db.prepare('SELECT a.*,v.status version_status FROM character_assets a JOIN character_versions v ON v.id=a.character_version_id WHERE lower(a.content_hash)=?').all(imageHash);
const unknownCrewCosts=db.prepare('SELECT r.project_id,COUNT(*) count FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE e.cost_usd IS NULL GROUP BY r.project_id').all();
db.close();
const record={
  evidenceVersion:1,observedAt:new Date().toISOString(),original:'C:/Users/danbr/Downloads/Best Lip Sync Jesus.mp4',
  originalSha256:hash('best-lip-sync-jesus.original.mp4'),guiDownloadSha256:hash('gui-first-take.mp4'),
  originalDecodedVideoHash:decoded('best-lip-sync-jesus.original.mp4'),guiDecodedVideoHash:decoded('gui-first-take.mp4'),
  gui:{taskId:'317949919322306',workId:'317949919328340',editUrl:'https://kling.ai/app/ai-human/317949919322306?ra=2&editType=edit&ac=5&klingVersion=1.6',
    displayTitle:'kling_20260806_Build Avatar_Smiling wa_2324_0',displayGenerationDate:'8/5/2026, 9:07:18 PM',displayDateTimezone:null,
    productLabel:'Avatar',displayQuality:'720p',observedActualOutput:'960x960; 304 frames; 30 fps',
    savedPrompt:'Smiling warmly at the camera, the character exudes a calm and confident demeanor, standing still with a gentle expression.',
    originalSubmission:null,mode:null,modelVersion:null,routeVersionIsNotModelProof:'klingVersion=1.6',
    promptOrigin:null,fieldOmissions:null,hiddenParameters:null,
    currentGui:{productLink:'Avatar 2.0',newFormPrompt:'empty before selecting original task',newFormQuality:'720p · 1',editedOriginalPrompt:'saved prompt restored',editedOriginalEstimatedCredits:40,notHistoricalSubmissionEvidence:true}},
  inputs:{image:{file:'gui-source-image.png',sha256:imageHash,canonMatches},audio:{file:'gui-original-test-audio.mp3',guiFilename:'original-test-audio.mp3',sha256:hash('gui-original-test-audio.mp3'),guiDurationSeconds:10.077458333333333,passageBinding:null,filmAttribution:'Dan confirms this was a one-off proof of concept that never belonged to a film; no film source/cast approval is asserted.'}},
  audioComparison:{sampleRate:8000,lagMs:best.lag/8,correlation:best.correlation,limitation:'Waveform similarity only; no Hatam phrase, mouth timing or approval inference. Container timestamps are preserved.'},
  unknownCrewCosts,comparison:{status:comparisonRun?.status ?? 'not_started',newGenerations:0,actualNewBilledUsd:null,newRequestCeilingUsd:2.464,newDirectChargeLimitUsd:5,reason:'Standalone POC comparison: both verified std/prompt requests rejected with HTTP429/code1102 account balance not enough; no task returned and read-only external-ID queries find neither task. No automatic retry. Historical GUI and assistant costs remain unreported.'},
  assistantUsage:{kind:'Codex research/implementation session',directDollarCost:null,accounting:'Included/account usage not reported as a per-film dollar charge; no free-usage claim',newImageGenerations:0}
};
if(record.originalDecodedVideoHash!==record.guiDecodedVideoHash)throw new Error('Winning take decoded-frame mismatch');
writeFileSync(join(dir,'gui-baseline.json'),JSON.stringify(record,null,2));
writeFileSync(join(dir,'review.html'),`<!doctype html><meta charset="utf-8"><title>HeartWord — retained Kling baseline</title>
<style>body{font:17px system-ui;background:#14191d;color:#eef2ee;margin:32px;max-width:1200px}section{display:flex;gap:24px}article{flex:1}video{width:100%;max-height:520px}code{overflow-wrap:anywhere}a{color:#b5dfcf}p{line-height:1.5}.held{padding:16px;border:1px solid #d2b772}</style>
<h1>Retained Kling baseline</h1><p>GUI task <b>317949919322306</b> · displays August 5, 2026, 9:07:18 PM (timezone unspecified).</p>
<section><article><h2>Dan's original</h2><video controls preload="metadata" src="best-lip-sync-jesus.original.mp4"></video></article><article><h2>Recovered GUI take</h2><video controls preload="metadata" src="gui-first-take.mp4"></video></article></section>
<p>All 304 decoded video frames match. Containers and audio clocks differ and are preserved. This is identification evidence; it is not a new controlled performance experiment.</p>
<p><b>Saved prompt:</b> Smiling warmly at the camera, the character exudes a calm and confident demeanor, standing still with a gentle expression.</p>
<p>Original SHA-256: <code>${record.originalSha256}</code></p>
<p class="held"><b>Comparison held: API balance insufficient.</b> Dan confirms this was a standalone proof of concept, never part of a film. Two verified prompt/std requests within a $5 new-direct-charge envelope were rejected (HTTP 429/code 1102); neither returned a task. No automatic retry or film charge assignment. Original model/mode and prompt origin remain unknown; historical GUI, assistant and actual billed costs remain unreported.</p>
<p><a href="gui-baseline.json">Complete baseline record</a> · <a href="comparison-run.json">Comparison requests and rejections</a> · <a href="comparison-rejection-reconciliation.json">Read-only task/account reconciliation</a> · <a href="gui-source-image.png">Recovered source image</a> · <a href="gui-original-test-audio.mp3">Exact uploaded audio</a> · <a href="local-audit.json">Read-only local production/cost audit</a></p>`);
console.log(JSON.stringify({task:record.gui.taskId,framesMatch:true,sourceImageCanonMatches:canonMatches.length,audioComparison:record.audioComparison,unknownCrewCosts},null,2));
