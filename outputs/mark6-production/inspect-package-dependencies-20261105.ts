import {writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {inspectChapterPackage} from '../../src/pipeline/assembly/chapter-package.js';

// Read-only early dependency inspection, not a delivery/export or completion claim.
const db = new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite', {readOnly:true});
try {
  db.exec('PRAGMA busy_timeout=5000');
  const {manifest} = inspectChapterPackage(db, 'C:/Users/danbr/HeartWordData', 'c457a815-d07d-4902-91b5-7b936b549856', {includeApplication:false});
  const result = {at:new Date().toISOString(), status:'early_dependency_inspection_not_final_export',
    files:manifest.files.length, bytes:manifest.files.reduce((n,f)=>n+f.bytes,0),
    problems:manifest.problems, editability:manifest.editability,
    providerCalls:0, databaseWrites:0, exported:false};
  writeFileSync('outputs/mark6-production/package-dependency-inspection-20261105.json', JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {db.close();}
