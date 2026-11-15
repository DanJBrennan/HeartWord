// Read-only account voice lookup. No synthesis, conversion or voice creation.
import {writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {listElevenLabsVoices} from '../../../src/providers/elevenlabs.js';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const out=resolve('outputs/mark6-preparation/canon-package-v1/selected-voice-lookup.json');
if(existsSync(out))throw Error('Retained lookup exists; inspect rather than overwrite');
const voices=await listElevenLabsVoices();
const normalize=(s:string)=>s.normalize('NFC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').toLowerCase();
const wanted=[{key:'herod',requestedName:'Rajan',explicitId:'g9CNrQBSjyCqnbIFtN9N'},{key:'herodias',requestedName:'Cruella',explicitId:'WMKg7TxPpPWCryaXE42r'},{key:'herodias-daughter',requestedName:"Herodias's Daughter",explicitId:null},{key:'john-the-baptist',requestedName:'John the Baptist',explicitId:null}];
const selections=wanted.map(w=>{const found=voices.filter(v=>w.explicitId?v.voiceId===w.explicitId:normalize(v.name)===normalize(w.requestedName));return{...w,matches:found.map(v=>({voiceId:v.voiceId,name:v.name,category:v.category})),resolved:found.length===1};});
writeFileSync(out,JSON.stringify({status:selections.every(s=>s.resolved)?'all_four_resolved':'needs_exact_identity_resolution',lookup:'read_only_account_voice_listing',readAt:new Date().toISOString(),selections,speechRequests:0,voiceCreationRequests:0,fullProductionHold:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selections}));
