import {readFileSync,existsSync} from 'node:fs';
import {recordRestoredPathProjection} from '../src/pipeline/assembly/disaster-backup.js';
const root='C:/Users/danbr/HeartWordRecoveryDrill/20261007-verified';
if(!existsSync(root+'/restored-from.json'))throw new Error('Restore must finish before projection is recorded');
recordRestoredPathProjection(root,JSON.parse(readFileSync('C:/Users/danbr/HeartWordBackupStaging/20261007-first/backup.json','utf8')));
console.log('Saved recovery projection; source media, sidecars and history unchanged.');
