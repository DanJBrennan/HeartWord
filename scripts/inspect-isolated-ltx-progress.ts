/** Read-only Desktop state for reconciliation of an uncertain local request. */
import { ltxJson } from "../src/providers/ltx/http.js";
import { sharedLtxTransport, closeLtxTunnel } from "../src/providers/ltx/transport.js";
const token=process.env.LTX_TOKEN?.trim();
if(!token)throw new Error("LTX_TOKEN is missing");
try {
  const base=await sharedLtxTransport().connect();
  if(process.argv.includes("--health")){
    const value=await ltxJson(base,"/health",token,10000);
    console.log(JSON.stringify({status:value.status,models_loaded:value.models_loaded,active_model:value.active_model,
      models_status:Array.isArray(value.models_status)?value.models_status.map((model:unknown)=>{
        const item=model as {id?:unknown;downloaded?:unknown;loaded?:unknown};
        return {id:item?.id,downloaded:item?.downloaded,loaded:item?.loaded};
      }):null,phase:value.phase,error:value.error,fields:Object.keys(value)},null,2));
  }else{
    const value=await ltxJson(base,"/api/generation/progress",token,10000);
    console.log(JSON.stringify({id:value.id,status:value.status,phase:value.phase,progress:value.progress,
      currentStep:value.currentStep,totalSteps:value.totalSteps,fields:Object.keys(value),
      result:value.result&&typeof value.result==="object"?{
        fields:Object.keys(value.result as object),
        videoPath:typeof (value.result as {video_path?:unknown}).video_path==="string"?(value.result as {video_path:string}).video_path:null
      }:null},null,2));
  }
} finally { closeLtxTunnel(); }
