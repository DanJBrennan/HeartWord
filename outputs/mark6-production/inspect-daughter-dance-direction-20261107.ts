import {writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext,keyframeFilmInput} from '../../src/pipeline/media-generation/external-keyframes.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb(),data=getDataDir(),id='980ac2a9-101d-47ad-b924-3a988c0fd337',c=getKeyframeContext(db,data,id),p=requireCurrentPlan(db,data,c.project.id),f=keyframeFilmInput(p,id);writeFileSync('outputs/mark6-production/daughter-dance-current-direction-20261107.json',JSON.stringify({context:c,filmInput:f},null,2));console.log(JSON.stringify({shot:c.shot,references:c.references,filmInput:f}));db.close();
