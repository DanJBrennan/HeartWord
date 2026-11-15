import {writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {getKeyframeContext} from '../../src/pipeline/media-generation/external-keyframes.js';
import {requireCurrentPlan,directionsFromRun} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb();try{const shot='5853deb0-d835-4464-9e81-bc0062d396c4',p=requireCurrentPlan(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856'),c=getKeyframeContext(db,getDataDir(),shot);writeFileSync('outputs/mark6-production/checkpoints/peter-request-current-context-20261109.json',JSON.stringify({context:c,directions:directionsFromRun(p,shot)},null,2));console.log(JSON.stringify({shot:c.shot,references:c.references,directions:directionsFromRun(p,shot)}));}finally{db.close();}
