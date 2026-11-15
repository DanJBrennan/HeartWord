// Read-only renderer diagnostic; do not print raw device/log data.
import {SshLtxTransport} from '../../src/providers/ltx/transport.js';
const t=new SshLtxTransport();
try{
 const text=await t.remote('ioreg -r -c AGXAccelerator -d 1');
 const utilization=[...text.matchAll(/"((?:Device|Renderer|Tiler) Utilization %)"\s*[=:]\s*(\d+)/g)].map(m=>({metric:m[1],percent:Number(m[2])}));
 console.log(JSON.stringify({status:'read_only_gpu_observation',at:new Date().toISOString(),utilization}));
}finally{t.reset();}
