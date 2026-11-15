import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,directionsFromRun} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb();const p=requireCurrentPlan(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856');console.log(directionsFromRun(p,process.argv[2]??'88fb7cf6-1df3-4003-ad71-85752611f4a1'));db.close();
