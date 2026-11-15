// Save only the exact user-selected shared voice. No speech or credit purchase.
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{resolve}from'node:path';
import{listElevenLabsVoices}from'../../../src/providers/elevenlabs.js';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const base=resolve('outputs/mark6-preparation/canon-package-v1'),out=base+'/cruella-add-receipt.json';if(existsSync(out))throw Error('Retained mutation receipt exists; reconcile, no automatic retry');
const lookup=JSON.parse(readFileSync(base+'/cruella-library-lookup.json','utf8'));
const selected=lookup.matches.filter((v:any)=>v.voiceId==='WMKg7TxPpPWCryaXE42r');if(selected.length!==1||!selected[0].publicOwnerId)throw Error('Exact shared voice unresolved');
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('Missing credential');
const before=await listElevenLabsVoices();if(before.some(v=>v.voiceId===selected[0].voiceId))throw Error('Voice already available; no add needed');
const state:any={status:'submission_started',requestedVoiceId:selected[0].voiceId,requestedName:'Cruella',beforeVoiceIds:before.map(v=>v.voiceId),speechCalls:0,creditPurchase:false};
const save=()=>writeFileSync(out,JSON.stringify(state,null,2)+'\n');save();
const r=await fetch(`https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(selected[0].publicOwnerId)}/${encodeURIComponent(selected[0].voiceId)}`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({new_name:'Cruella'})});
const result=await r.json();state.httpStatus=r.status;
if(!r.ok){state.status='held_no_retry';state.error={status:result.detail?.status,message:String(result.detail?.message??'Unknown error').split(key).join('[redacted]')};save();throw Error('Could not save selected shared voice; see retained safe receipt');}
if(typeof result.voice_id!=='string'||!result.voice_id){state.status='held_reconcile';save();throw Error('Missing returned voice ID');}
state.returnedVoiceId=result.voice_id;state.status='added_verify_pending';save();
const after=await listElevenLabsVoices();const match=after.filter(v=>v.voiceId===result.voice_id);if(match.length!==1)throw Error('Added voice not found; reconcile before any further mutation');
state.status='saved_verified';state.voice={voiceId:match[0].voiceId,name:match[0].name,category:match[0].category};state.existingVoiceIdsPreserved=before.every(v=>after.some(a=>a.voiceId===v.voiceId));save();if(!state.existingVoiceIdsPreserved)throw Error('Account inventory unexpectedly changed');console.log(JSON.stringify({status:state.status,voice:state.voice,speechCalls:0}));
