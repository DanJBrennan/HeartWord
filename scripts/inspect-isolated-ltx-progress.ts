/** Read-only Desktop state for reconciliation of an uncertain local request. */
import { ltxJson } from "../src/providers/ltx/http.js";
import { sharedLtxTransport, closeLtxTunnel } from "../src/providers/ltx/transport.js";
const token=process.env.LTX_TOKEN?.trim();
if(!token)throw new Error("LTX_TOKEN is missing");
try {
  const base=await sharedLtxTransport().connect();
  const value=await ltxJson(base,"/api/generation/progress",token,10000);
  console.log(JSON.stringify({id:value.id,status:value.status,phase:value.phase,progress:value.progress,
    currentStep:value.currentStep,totalSteps:value.totalSteps,fields:Object.keys(value),
    result:value.result&&typeof value.result==="object"?{
      fields:Object.keys(value.result as object),
      videoPath:typeof (value.result as {video_path?:unknown}).video_path==="string"?(value.result as {video_path:string}).video_path:null
    }:null},null,2));
} finally { closeLtxTunnel(); }
