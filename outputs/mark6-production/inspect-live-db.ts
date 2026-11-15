import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
const projectId=JSON.parse(readFileSync('outputs/mark6-production/workspace.json','utf8')).projectId;
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
const result={quickCheck:db.prepare('PRAGMA quick_check').all(),journalMode:db.prepare('PRAGMA journal_mode').all(),project:db.prepare('SELECT stage,status FROM projects WHERE id=?').get(projectId),runs:db.prepare('SELECT id,status,worker_pid FROM production_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').all(projectId),avLedger:db.prepare("SELECT id,amount_usd FROM cost_ledger_entries WHERE project_id=? AND id LIKE 'mark6-production-audio-review-%'").all(projectId)};
writeFileSync('outputs/mark6-production/live-db-inspection.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));db.close();
