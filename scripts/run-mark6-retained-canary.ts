/** Operational retained-media canary only. No media generation or live DB writes. */
import { readFileSync,writeFileSync,existsSync } from "node:fs";
import { resolve,join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { parse } from "dotenv";
import { attemptAcceptanceTarget,recordAcceptanceReview,assertAcceptanceEvidence,evidenceHash,mediaHash,type AcceptanceReview } from "../src/pipeline/qc/acceptance-evidence.js";
import { GEMINI_TEXT_MODEL,generateJsonWithImagesMetered,geminiJsonRequestBody,GeminiResponseError,type GeminiMediaInput } from "../src/providers/gemini-text.js";
const root=resolve('C:/Users/danbr/Downloads/HeartWord_Mark6_Retained_Canary_2026-11-15');
const originalData='C:/Users/danbr/HeartWordData';
process.env.HEARTWORD_DATA_DIR=join(root,'data');
const configuration=parse(readFileSync('C:/Users/danbr/OneDrive/Documents/HeartWord/.env'));
const apiKey=configuration.GEMINI_API_KEY;if(!apiKey)throw Error('Review configuration unavailable; no inference submitted.');process.env.GEMINI_API_KEY=apiKey;
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const put=(p:string,value:unknown)=>writeFileSync(join(root,p),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
if(existsSync(join(root,'review-state.json')))throw Error('Retained canary state exists; no automatic repeat.');
const state:any={model:GEMINI_TEXT_MODEL,ceilingUsd:1,perRequestCeilingUsd:.25,maxRequests:4,requests:[],noAutomaticRetries:true,estimatedKnownUsd:0,unresolvedExposureUsd:0,modelIndependentOfPriorReview:true,rootReviewerBlinded:false,productionWrites:0,generationRequests:0};
const save=()=>writeFileSync(join(root,'review-state.json'),JSON.stringify(state,null,2)+'\n');save();
const db=new DatabaseSync(join(root,'data/canary.sqlite'));
const project='c457a815-d07d-4902-91b5-7b936b549856';
const counts=()=>Object.fromEntries(['clips','chapter_renders','generation_attempts'].map(table=>[table,db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n]));
state.initialCounts=counts();save();
const schema={type:'object',properties:{overall:{type:'string',enum:['clear','hold','unverified']},checks:{type:'array',items:{type:'object',properties:{id:{type:'string'},status:{type:'string',enum:['clear','hold','unverified']},evidence:{type:'string'},ranges:{type:'array',items:{type:'object',properties:{startMs:{type:'number'},endMs:{type:'number'}},required:['startMs','endMs']}}},required:['id','status','evidence','ranges']}},limitations:{type:'array',items:{type:'string'}}},required:['overall','checks','limitations']};
try{
 for(const item of read(join(root,'case-records.json')).sort((a:any,b:any)=>a.label.localeCompare(b.label))){
  if(state.requests.length>=4)throw Error('Canary request ceiling.');
  if(mediaHash(item.copyPath)!==item.sha256||mediaHash(item.sourcePath)!==item.sha256)throw Error('Retained input bytes changed.');
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',item.copyPath],{encoding:'utf8',windowsHide:true})).streams;
  const video=streams.find((s:any)=>s.codec_type==='video');const [n,d]=video.r_frame_rate.split('/').map(Number),fps=n/d,durationMs=Number(video.nb_read_frames)*1000/fps;
  const target=attemptAcceptanceTarget(db,originalData,project,item.id,durationMs);
  put(`reviews/${item.label}-target.json`,target);
  const prompt=`Independently assess retained clip ${item.label}. You have no prior verdict and no producer complaint. Some controls may be acceptable, flawed, or unobservable. Judge only supplied evidence. The video is supplied at its native ${fps}fps and ${video.width}x${video.height} geometry with its existing audio. Inspect the entire clip, not just onset or a contact sheet.
`+
   `Return an assessment for EACH listed obligation using its exact id and observed clip-local milliseconds. clear requires concrete observable support; hold means observed failure; unverified means evidence/capability is insufficient. Give specific visible/heard details and intervals, not a generic verdict.
`+
   `For speech separately compare active audio with visible articulation, pauses/rest, timing, joins and visible speaker versus intentional listeners. Do not infer full performance from a few open-mouth frames. No Hatam-native linguistic attestation is supplied; do not invent exact word ownership, endpoints or phoneme accuracy. Exact source transport also requires independent measurement, not merely hearing a clip.
`+
   `Compare named faces/hair/build and readability against the labelled approved face references. Body references govern wardrobe/state separately. A correct robe, reference label, or cast ID is insufficient evidence of facial recognition. Do not infer ancestry or nationality from appearance or lighting. A reference does not require that person to appear; distinguish an intentionally offscreen person from an unreadable visible person.
`+
   `For planned action, describe what is actually visible and whether the complete required causal action occurs. Hearing narration or seeing reactions cannot prove an unseen physical event. Check geometry and unintended text. Record uncertainty rather than completing missing observations.
`+
   `Obligations:
${JSON.stringify(target.requirements.map(r=>({id:r.id,text:r.id.startsWith('identity:')?'Recognizable visible character face/hair/build against separately labelled exact approved references.':r.id.startsWith('wardrobe:')?'Visible wardrobe/body/story state against separately labelled approved body references.':r.text})))}`;
  const media:GeminiMediaInput[]=[{mimeType:'video/mp4',data:readFileSync(item.copyPath).toString('base64'),caption:`CLIP ${item.label}: entire retained candidate; local time starts at zero`,videoMetadata:{fps}}];
  for(const ref of item.references){if(mediaHash(ref.path)!==ref.sha256)throw Error('Approved reference changed.');media.push({mimeType:'image/png',data:readFileSync(ref.path).toString('base64'),caption:`APPROVED ${ref.category==='headshot'?'FACE':'BODY/WARDROBE'} reference: ${ref.name}; version ${ref.versionId}. Not a frame from this video.`});}
  const options={maxOutputTokens:4096,thinkingLevel:'low' as const};
  const body=geminiJsonRequestBody(prompt,media,schema,options);
  const countResponse=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:countTokens`,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({contents:JSON.parse(body).contents}),signal:AbortSignal.timeout(60000)});
  if(!countResponse.ok)throw Error(`Token preflight HTTP ${countResponse.status}; no inference or automatic retry.`);
  const count:any=await countResponse.json(),tokens=Number(count.totalTokens);
  const exposure=(tokens+20000)*.75/1e6+4096*3.75/1e6;
  if(!Number.isSafeInteger(tokens)||tokens<1||exposure>.25||state.estimatedKnownUsd+state.unresolvedExposureUsd+exposure>1)throw Error('Canary token/cost ceiling before inference.');
  const request:any={label:item.label,sha256:item.sha256,promptSha256:evidenceHash(prompt),bodySha256:createHash('sha256').update(body).digest('hex'),bodyBytes:Buffer.byteLength(body),nativeInput:{width:video.width,height:video.height,fps,frames:Number(video.nb_read_frames),durationMs,audioIncluded:streams.some((s:any)=>s.codec_type==='audio')},inputTokens:tokens,exposureReservedUsd:exposure,status:'reserved',startedUtc:new Date().toISOString()};
  put(`reviews/${item.label}-request.json`,{...request,prompt,obligations:target.requirements,references:item.references,tokenPreflight:count,pricing:{inputPerMillionUsd:.75,outputPerMillionUsd:3.75,source:'https://aistudio.google.com/docs/pricing#gemini-3.6-flash',date:'2026-11-15'},options});
  state.requests.push(request);state.unresolvedExposureUsd+=exposure;save();console.log(`Submitting neutral retained-media case ${item.label}; bounded exposure $${exposure.toFixed(6)}`);
  let response:any;
  try{response=await generateJsonWithImagesMetered(prompt,media,schema,GEMINI_TEXT_MODEL,options);}
  catch(e){if(e instanceof GeminiResponseError){request.receipt=e.receipt;state.estimatedKnownUsd+=e.receipt.costUsd;state.unresolvedExposureUsd-=exposure;}request.status='failed_or_unverified';save();throw e;}
  put(`reviews/${item.label}-response.json`,response);
  if(!response.usage?.totalTokenCount){request.status='unreported_usage';save();throw Error('Review usage unreported; reserved exposure retained.');}
  state.estimatedKnownUsd+=response.costUsd;state.unresolvedExposureUsd-=exposure;request.costUsd=response.costUsd;request.usage=response.usage;request.status='receipted';save();
  const review:any=response.result;
  if(!Array.isArray(review.checks)||!['clear','hold','unverified'].includes(review.overall))throw Error('Malformed retained assessment; no retry.');
  const assessment:AcceptanceReview={kind:'media_acceptance_v1',key:target.key,contextHash:target.contextHash,mediaSha256:item.sha256,reviewer:`Fresh neutral ${GEMINI_TEXT_MODEL} canary review ${item.label}`,input:{width:video.width,height:video.height,fps,audioIncluded:request.nativeInput.audioIncluded},checks:review.checks.map((c:any)=>({id:c.id,status:c.status,evidence:c.evidence,ranges:c.ranges,requirementHash:evidenceHash(target.requirements.find(r=>r.id===c.id)?.text??'UNKNOWN REQUIREMENT')}))};
  // A model opinion cannot supply native attestation or independent transport proof.
  for(const c of assessment.checks)if(['source_boundaries','source_transport'].includes(c.id)){c.status='unverified';c.evidence+=' Independent source/native adjudication is outside this visual review.';}
  recordAcceptanceReview(db,project,assessment);put(`reviews/${item.label}-assessment.json`,assessment);
  let disposition='ADMITTED';try{assertAcceptanceEvidence(db,originalData,project,target);}catch(e){disposition=String(e);}
  request.disposition=disposition;save();
  console.log(`Case ${item.label}: reviewer ${review.overall}; ${disposition}`);
  // Do not run additional semantic canaries after a prior adjudicated defect gets an unsupported clear.
  const critical=assessment.checks.filter(c=>item.kind==='action'?c.id.startsWith('action:'):item.kind==='speech'?['speech_activity','speech_sync','speech_rest'].includes(c.id):c.id.startsWith('identity:'));
  if(critical.length&&critical.every(c=>c.status==='clear')){state.stopReason=`Case ${item.label} critical observations all clear despite a retained prior defect/identity uncertainty; stop for adjudication.`;save();break;}
 }
 state.finalCounts=counts();if(JSON.stringify(state.finalCounts)!==JSON.stringify(state.initialCounts))throw Error('Canary unexpectedly changed selections/renders/attempts.');state.completedUtc=new Date().toISOString();save();
}catch(e){state.stopReason=String(e).replaceAll(apiKey,'[redacted]');state.finalCounts=counts();save();console.log(state.stopReason);process.exitCode=1;}finally{db.close();}
