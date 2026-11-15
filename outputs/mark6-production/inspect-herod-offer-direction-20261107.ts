import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,directionsFromRun} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb();const p=requireCurrentPlan(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856');console.log(directionsFromRun(p,'6dd65d3f-fbb0-4e61-9a81-7a44dd636b87'));db.close();
