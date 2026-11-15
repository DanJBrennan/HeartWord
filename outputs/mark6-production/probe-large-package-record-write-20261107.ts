import {mkdirSync,readFileSync,writeFileSync,statSync,createReadStream,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {productionRecords} from '../../src/pipeline/assembly/chapter-package.js';
import {hashPackageRecords,writePackageRecords} from '../../src/pipeline/assembly/chapter-package-records.js';
const folder='outputs/mark6-production/large-record-roundtrip-20261107',records=folder+'/records.json';if(existsSync(records))throw Error('Existing probe requires reconciliation, not overwrite');mkdirSync(folder,{recursive:true});
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});let snapshot:ReturnType<typeof productionRecords>;
try{db.exec('BEGIN');snapshot=productionRecords(db,'c457a815-d07d-4902-91b5-7b936b549856');db.exec('COMMIT');}finally{db.close();}
const before=Date.now(),expectedSha256=hashPackageRecords(snapshot.tables),counts=Object.fromEntries(Object.entries(snapshot.tables).map(([name,rows])=>[name,rows.length]));
writePackageRecords(records,snapshot.tables);const digest=createHash('sha256');for await(const bytes of createReadStream(records))digest.update(bytes);const actualSha256=digest.digest('hex');if(actualSha256!==expectedSha256)throw Error('Actual canonical file bytes changed');
const result={at:new Date().toISOString(),status:'real_current_records_written_for_separate_read_probe',records,bytes:statSync(records).size,expectedSha256,actualSha256,counts,seconds:(Date.now()-before)/1000,peakMemory:process.resourceUsage().maxRSS,providerCalls:0,databaseWrites:0,fullPackageExported:false,independentProjectRestoreCompleted:false};writeFileSync(folder+'/write-proof.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({bytes:result.bytes,sha256:actualSha256,seconds:result.seconds,tables:Object.keys(counts).length}));
