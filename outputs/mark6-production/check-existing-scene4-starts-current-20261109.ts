import {getDb,getDataDir} from '../../src/db/client.js';
import {validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const db=getDb();try{for(const id of ['b8cafac7-333a-44de-925c-447702423617','b3c5d115-9d51-4d08-b442-94b46206d4d3']){try{validateAttemptRevision(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856',id);console.log(JSON.stringify({id,currentRevision:true}));}catch(e){console.log(JSON.stringify({id,currentRevision:false,reason:String(e)}));}}}finally{db.close();}
