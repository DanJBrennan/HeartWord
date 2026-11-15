import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
const db=getDb();try{const plan=requireCurrentPlan(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856'),ids=['c1aabd95-a003-468f-b87e-90da0d205288'];const dirs=JSON.parse(plan.result_json!).contributions.production_director.directions;for(const id of ids){const c=getKeyframeContext(db,getDataDir(),id);console.log(JSON.stringify({id,director:dirs.find((x:any)=>x.shotId===id),references:c.references.map(x=>({name:x.name,version:x.version_id,category:x.category,path:x.path}))}));}}finally{db.close();}
