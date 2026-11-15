import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{const plan=requireCurrentPlan(db,data,project);console.log(JSON.stringify({at:new Date().toISOString(),projectId:project,productionRunId:plan.id,currentBriefHash:crewBriefHash(loadCrewBrief(db,data,project,'planning'),'planning'),providerCalls:0,mutations:0}));}finally{db.close();}
