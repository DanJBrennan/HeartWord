import {SshLtxTransport} from '../../src/providers/ltx/transport.js';
import {writeFileSync} from 'node:fs';
const t=new SshLtxTransport();try{await t.connect();const result=await t.remote('grep -n -E "audioPath|audio_path|a2v|audio_to_video|input_audio|audio_file|A2V|request.audio" "/Applications/LTX Desktop.app/Contents/Resources/backend/handlers/video_generation_handler.py" | head -85');writeFileSync('outputs/mark6-production/speaking-route-handler-lines-20261107.txt',result);console.log(result);}finally{t.reset();}
