import {readFileSync} from 'node:fs';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
const p=JSON.parse(readFileSync('outputs/mark6-production/director-full-packet-r65-offline.json','utf8'));
for(const separator of [/(?<=[.!?;:\n])(?=\s)/,/(?<=[,;:\n])(?=\s)/,/(?<=[.!?,;:\n])(?=\s)/]){
 const counts=new Map<string,number>();
 const scan=(v:any):void=>{if(typeof v==='string'&&v.length>120){for(const t of v.split(separator))if(t.length>=40)counts.set(t,1+(counts.get(t)??0));}else if(v&&typeof v==='object')Object.values(v).forEach(scan);};scan(p);
 const split=(v:any):any=>{if(typeof v==='string'&&v.length>120){const parts=v.split(separator),used=parts.some(t=>t.length>=40&&(counts.get(t)??0)>1);return used?{$text:parts}:v;}return Array.isArray(v)?v.map(split):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,split(x)])):v;};
 const candidate=split(p),encoded=encodeCrewPacket(candidate);console.log(JSON.stringify({separator:String(separator),characters:encoded.length,bytes:Buffer.byteLength(encoded),repeatedSegments:[...counts.values()].filter(n=>n>1).length}));
}
