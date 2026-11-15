import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
const d=getDb();try{const c=getKeyframeContext(d,getDataDir(),'4b40e89f-a1d1-46ba-b169-3a898d9a5393');console.log(JSON.stringify({scene:c.scene,references:c.references,sets:c.sceneReferences},null,2));}finally{d.close();}
