import{writeFileSync,existsSync}from'node:fs';import{resolve}from'node:path';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const out=resolve('outputs/mark6-preparation/canon-package-v1/cruella-library-lookup.json');if(existsSync(out))throw Error('Retained lookup exists');
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('No credential');
const url=new URL('https://api.elevenlabs.io/v1/shared-voices');url.searchParams.set('search','Cruella');url.searchParams.set('page_size','100');
const response=await fetch(url,{headers:{'xi-api-key':key}}),raw=await response.json();
const result={readOnly:true,status:response.status,hasMore:raw.has_more??false,matches:(raw.voices??[]).map((v:any)=>({voiceId:v.voice_id,name:v.name,publicOwnerId:v.public_owner_id,category:v.category})),error:raw.detail?{status:raw.detail.status,message:String(raw.detail.message??'').split(key).join('[redacted]')}:null,speechCalls:0};
writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
