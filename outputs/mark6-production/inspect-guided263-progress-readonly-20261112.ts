import {SshLtxTransport,latestLogCommand} from '../../src/providers/ltx/transport.js';
const transport=new SshLtxTransport();
console.log(await transport.remote(`${latestLogCommand} tail -120 "$latest" | grep -E 'Pipeline load:|Text encoding |Total generation:|Inference:' | tail -6`));
