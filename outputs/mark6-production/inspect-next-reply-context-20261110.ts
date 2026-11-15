import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,directionsFromRun} from '../../src/pipeline/creative-direction/crew-store.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
const db=getDb(),data=getDataDir();try{const plan=requireCurrentPlan(db,data,'c457a815-d07d-4902-91b5-7b936b549856');for(const id of ['a55cfba9-873b-44b5-935c-942ecf7a4b39','fed709fe-0e36-450a-a5f0-89befa80cfdb']){const c=getKeyframeContext(db,data,id);console.log(JSON.stringify({shot:c.shot,references:c.references,direction:directionsFromRun(plan,id)}));}}finally{db.close();}
