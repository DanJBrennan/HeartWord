/** Read-only provider/SQLite audit. Never submits generation or changes production. */
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.env.HEARTWORD_DATA_DIR || 'C:/Users/danbr/HeartWordData';
const original = 'C:/Users/danbr/Downloads/Best Lip Sync Jesus.mp4';
const evidence = join(root, 'research/kling-avatar-2026-10-14');
mkdirSync(evidence, { recursive: true });
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const saved = join(evidence, 'best-lip-sync-jesus.original.mp4');
if (!existsSync(saved)) copyFileSync(original, saved, constants.COPYFILE_EXCL);
if (hash(original) !== hash(saved)) throw new Error('Baseline copy hash mismatch');
const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_format','-show_streams','-of','json', original], {encoding:'utf8'}));
const matches = [];
function scan(dir) {
  for (const item of readdirSync(dir, {withFileTypes:true})) {
    const path = join(dir,item.name);
    if (item.isDirectory()) scan(path);
    else if (item.name.endsWith('.mp4') && statSync(path).size === statSync(original).size && hash(path) === hash(original)) matches.push(path);
  }
}
scan(join(root,'assets'));
const dbPath = join(root, 'db/heartword.sqlite');
const dbBefore = hash(dbPath);
const db = new DatabaseSync(dbPath, {readOnly:true});
db.exec('PRAGMA query_only=ON');
const projects = db.prepare('SELECT * FROM projects').all();
const attempts = db.prepare("SELECT * FROM generation_attempts WHERE provider LIKE '%kling%' OR model LIKE '%avatar%'").all();
const ledger = db.prepare('SELECT project_id,COUNT(*) entries,SUM(amount_usd) recordedUsd FROM cost_ledger_entries GROUP BY project_id').all();
const costTables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND (name LIKE '%cost%' OR name LIKE '%attempt%')").all();
db.close();
if (hash(dbPath) !== dbBefore) throw new Error('Production database changed during audit');
const report = { observedAt: new Date().toISOString(), original, preserved:saved, sha256:hash(saved), bytes:statSync(saved).size, filesystemDatesAreNotGenerationDates:true, probe, identicalManagedAssets:matches, projects, attempts, ledger, costTables, productionDbSha256:dbBefore, incrementalProductionUsd:0 };
writeFileSync(join(evidence,'local-audit.json'),JSON.stringify(report,null,2));
// The official Avatar reference documents these GET endpoints. No account/list
// capabilities are inferred from successful POSTs or guessed model names.
if (process.env.KLING_API_KEY_1) {
  const pages = [];
  for (let pageNum=1; pageNum<=10; pageNum++) {
    const response = await fetch(`https://api-singapore.klingai.com/v1/videos/avatar/image2video?pageNum=${pageNum}&pageSize=500`, {headers:{Authorization:`Bearer ${process.env.KLING_API_KEY_1}`},signal:AbortSignal.timeout(20000)});
    const body = await response.json();
    pages.push({pageNum,httpStatus:response.status,body});
    if (!response.ok || body.code !== 0 || !Array.isArray(body.data) || body.data.length<500) break;
  }
  writeFileSync(join(evidence,'avatar-task-list.json'),JSON.stringify({observedAt:new Date().toISOString(),pages},null,2));
  console.log(JSON.stringify({evidence,sha256:hash(saved),matches,ledger,tasks:pages.map(p=>({page:p.pageNum,status:p.httpStatus,code:p.body.code,count:p.body.data?.length,message:p.body.message}))},null,2));
} else console.log(JSON.stringify({evidence,sha256:hash(saved),matches,ledger,api:'credential unavailable'},null,2));
