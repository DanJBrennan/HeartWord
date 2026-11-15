// Only remove scratch trees in a verified nightly run; supports Windows long paths.
import {readFileSync,lstatSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const run=resolve(process.argv[2]??'');
if(!/^D:\\HeartWordBackups\\runs\\\d{8}-\d{6}-[a-f0-9]{8}$/i.test(run))throw Error('Unexpected backup scratch directory.');
for(let p=run;;p=dirname(p)){if(lstatSync(p).isSymbolicLink())throw Error('Linked cleanup ancestor.');if(dirname(p)===p)break;}
const proof=JSON.parse(readFileSync(join(run,'verified.json'),'utf8'));
const result=JSON.parse(readFileSync(join(run,'capture-result.json'),'utf8'));
if(!proof.passed||proof.currentSnapshot!==result.snapshotId||!result.sourceStable)throw Error('Cleanup requires matching successful verification.');
function check(p){const s=lstatSync(p);if(s.isSymbolicLink())throw Error('Linked scratch child.');if(s.isDirectory())for(const n of readdirSync(p))check(join(p,n));}
for(const name of ['verified-restore','capture']){const target=resolve(run,name);if(dirname(target)!==run)throw Error('Cleanup escaped run root.');if(existsSync(target)){check(target);rmSync(target,{recursive:true,force:false});}}
