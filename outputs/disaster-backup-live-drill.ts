import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {productionRecords,inspectChapterPackage} from '../src/pipeline/assembly/chapter-package.js';
import {loadCrewBrief,productionAssetPath} from '../src/pipeline/creative-direction/crew-context.js';
import {fileDigest} from '../src/pipeline/assembly/disaster-backup.js';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const backupRoot=resolve(process.argv[2]!), restoredRoot=resolve(process.argv[3]!);
const manifest=JSON.parse(readFileSync(resolve(backupRoot,'backup.json'),'utf8'));
assert.equal(process.permission?.has('fs.read',manifest.sourceRoot),false,'live data must be denied during this drill');
const baseline=new DatabaseSync(resolve(backupRoot,'data/db/heartword.sqlite'),{readOnly:true});
const restored=new DatabaseSync(resolve(restoredRoot,'db/heartword.sqlite'),{readOnly:true});
const original=productionRecords(baseline), recovered=productionRecords(restored);
const tableCounts=Object.fromEntries(Object.entries(original.tables).map(([name,rows])=>{assert.equal(recovered.tables[name]?.length,rows.length,`row count ${name}`);return[name,rows.length];}));
assert.equal(recovered.schema,original.schema);
assert.deepEqual(restored.prepare('PRAGMA integrity_check').all().map(row=>row.integrity_check),['ok']);
assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
// Decisions, approval/cost/history and exact performance remain authoritative.
for(const name of ['cost_ledger_entries','source_review_attestations','source_alignment_corrections','source_alignment_boundary_overrides','source_alignment_editorial_classifications','source_alignment_speaker_attributions','edit_commands','review_notes','character_versions','clips','stage_executions']) {
 if(original.tables[name])assert.deepEqual(recovered.tables[name],original.tables[name],name);
}
for(const before of original.tables.generation_attempts??[]){const after=recovered.tables.generation_attempts!.find(row=>row.id===before.id)!;for(const field of ['id','shot_id','provider','model','operation','prompt','status','cost_usd','created_at'])assert.equal(after[field],before[field],`attempt ${field}`);}
const projectId='0b386bfc-7919-4f40-91af-e198508a8267';
const brief=loadCrewBrief(restored,restoredRoot,projectId,'editing');
const audit=inspectChapterPackage(restored,restoredRoot,projectId,{includeApplication:false});
assert.deepEqual(audit.manifest.problems,[]);
const audioPaths=[...new Set(brief.audio.map(segment=>segment.path))];
for(const path of audioPaths){const entry=manifest.files.find((f:{path:string})=>f.path===`data/assets/${path.replaceAll('\\','/')}`);assert(entry,`retained source ${path}`);assert.equal(await fileDigest(productionAssetPath(restoredRoot,path)),entry.sha256);}
const clip=brief.shots.find(shot=>shot.clip)?.clip;
assert(clip,'representative retained clip');
assert.equal(await fileDigest(productionAssetPath(restoredRoot,clip.path)),manifest.files.find((f:{path:string})=>f.path===`data/assets/${clip.path.replaceAll('\\','/')}`).sha256);
const report={backupId:manifest.id,restoredRoot,liveDataReadAccess:false,integrity:'ok',foreignKeys:'ok',schemaIdentical:true,tableCounts,verifiedAuthoritativeRows:true,project:brief.project,sourceVerses:brief.source.text.length,referenceVerses:brief.source.reference.length,audioIntervals:brief.audio.length,canonIdentities:brief.canon.length,shots:brief.shots.length,selectedClips:brief.shots.filter(shot=>shot.clip).length,producerNotes:brief.producerNotes.length,spentUsd:brief.spentUsd,chapterMissingAssets:audit.manifest.problems,chapterEditabilityGaps:audit.manifest.editability.length,sourceFilesVerified:audioPaths.length,representativeClip:clip,noPaidRegeneration:true,remoteRecoveryVerified:false};
baseline.close();restored.close();writeFileSync('outputs/disaster-backup-live-drill.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
