import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
const d=getDb();try{const c=getKeyframeContext(d,getDataDir(),'f6ca14f8-3802-4ca6-b949-a9bc0f38332a');console.log(JSON.stringify({scene:c.scene,references:c.references.map((r,i)=>({i:i+1,...r})),sets:c.sceneReferences},null,2));}finally{d.close();}
