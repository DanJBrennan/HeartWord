import {DatabaseSync} from 'node:sqlite';
import {existsSync,copyFileSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const path='C:/Users/danbr/HeartWordData/db/heartword.sqlite',out='C:/Users/danbr/HeartWordData/backups/mark6-journal-recovery-'+new Date().toISOString().replace(/[:.]/g,'-');
mkdirSync(out,{recursive:true});for(const suffix of ['','-journal','-wal','-shm'])if(existsSync(path+suffix))copyFileSync(path+suffix,join(out,'heartword.sqlite'+suffix));
// Use SQLite's own normal hot-journal recovery. Never delete a journal, force
// locks, replace the live database, or restore an older production snapshot.
const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=PERSIST; PRAGMA busy_timeout=10000');
const projectId=JSON.parse(readFileSync('outputs/mark6-production/workspace.json','utf8')).projectId;
const result={diagnosticBackup:out,quickCheck:db.prepare('PRAGMA quick_check').all(),journalMode:db.prepare('PRAGMA journal_mode').all(),project:db.prepare('SELECT stage,status FROM projects WHERE id=?').get(projectId),runs:db.prepare('SELECT id,status,worker_pid FROM production_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').all(projectId),avLedger:db.prepare("SELECT id,amount_usd FROM cost_ledger_entries WHERE project_id=? AND id LIKE 'mark6-production-audio-review-%'").all(projectId),sourceReviews:db.prepare('SELECT id FROM source_alignment_reviews WHERE project_id=?').all(projectId),sourceRows:db.prepare("SELECT COUNT(*) n FROM audio_segments WHERE project_id=? AND layer='original_reading'").get(projectId),castRows:db.prepare("SELECT COUNT(*) n FROM audio_segments WHERE project_id=? AND layer='composite_cast_master'").get(projectId)};
writeFileSync('outputs/mark6-production/live-db-inspection.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));db.close();
