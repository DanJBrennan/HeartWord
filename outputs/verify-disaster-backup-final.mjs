import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baselinePath = 'C:/Users/danbr/HeartWordBackupStaging/20261007-first';
const finalPath = 'C:/Users/danbr/HeartWordBackupStaging/20261007-recovery-tested';
const baseline = JSON.parse(readFileSync(resolve(baselinePath, 'backup.json'), 'utf8'));
const final = JSON.parse(readFileSync(resolve(finalPath, 'backup.json'), 'utf8'));
const baselineData = new Map(baseline.files.filter(f => f.path.startsWith('data/')).map(f => [f.path, f]));
const finalData = new Map(final.files.filter(f => f.path.startsWith('data/')).map(f => [f.path, f]));
const differences = [];
for (const [path, previous] of baselineData) {
  const current = finalData.get(path);
  if (!current || previous.bytes !== current.bytes || previous.sha256 !== current.sha256 || previous.database !== current.database) differences.push({ path, previous, current });
}
for (const [path, current] of finalData) if (!baselineData.has(path)) differences.push({ path, current });
// The existing full suite rewrites this pre-existing synthetic fixture export.
// Verify that this is the only exception and only test UUID/clock fields differ.
assert.equal(differences.length, 1, JSON.stringify(differences.slice(0, 12)));
const difference = differences[0];
assert.equal(difference.path, 'data/exports/production-crew/hatam-mark-2-planning.json');
function fixtureContent(path) {
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(saved.projectId, 'p'); assert.equal(saved.status, 'incomplete');
  delete saved.runId; delete saved.exportedAt;
  for (const role of saved.roleData) delete role.createdAt;
  return saved;
}
assert.deepEqual(fixtureContent(resolve(finalPath, difference.path)), fixtureContent(resolve(baselinePath, difference.path)));
const currentFixtureHash = createHash('sha256').update(readFileSync(resolve(finalPath, difference.path))).digest('hex');
assert.equal(currentFixtureHash, difference.current.sha256);
const currentSourceVerified = [];
for (const path of ['src/pipeline/assembly/disaster-backup.ts', 'src/pipeline/assembly/chapter-package.ts', 'src/web/ChapterEndingPlanView.tsx', 'tests/assembly/disaster-backup.test.ts', 'tests/web/chapter-ending-recovery.test.ts', 'docs/production/DISASTER_RECOVERY.md', 'docs/design/disaster-recovery.md', 'docs/plans/CURRENT_GOAL.md']) {
  const file = final.files.find(f => f.path === `application/${path}`);
  assert(file, `Missing final application ${path}`);
  const currentHash = createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
  assert.equal(currentHash, file.sha256, `Final snapshot does not contain tested ${path}`);
  currentSourceVerified.push(path);
}
const drill = JSON.parse(readFileSync('outputs/disaster-backup-live-drill.json', 'utf8'));
const allDatabaseDependencies = JSON.parse(readFileSync('outputs/disaster-backup-all-database-dependencies.json', 'utf8'));
assert.equal(allDatabaseDependencies.length, 6);
assert.equal(allDatabaseDependencies.flatMap(db => db.outsideData).length, 0);
assert.equal(drill.liveDataReadAccess, false);
assert.equal(drill.verifiedAuthoritativeRows, true);
assert.equal(drill.chapterMissingAssets.length, 0);
// Bring the isolated full restore forward by this one verified derived file.
// Preserve its earlier bytes as drill history; neither immutable snapshot nor
// production data is changed. All other data files match the full restore.
const recoveredFixture = resolve(drill.restoredRoot, difference.path.slice(5));
const priorFixture = resolve(drill.restoredRoot, `logs/recovery-history/${randomUUID()}-prior-test-fixture-planning.json`);
mkdirSync(resolve(drill.restoredRoot, 'logs/recovery-history'), { recursive: true });
copyFileSync(recoveredFixture, priorFixture, constants.COPYFILE_EXCL);
copyFileSync(resolve(finalPath, difference.path), recoveredFixture);
assert.equal(createHash('sha256').update(readFileSync(recoveredFixture)).digest('hex'), difference.current.sha256);
const evidence = {
  completedAt: new Date().toISOString(), state: 'locally_verified', finalSnapshot: finalPath,
  id: final.id, startedAt: final.startedAt, snapshotCompletedAt: final.completedAt,
  files: final.files.length, bytes: final.files.reduce((n, f) => n + f.bytes, 0),
  sqliteDatabases: final.files.filter(f => f.database).length,
  consistentSnapshotsAndCopySourceHashesVerifiedBy: 'stageDisasterBackup',
  originalDrilledBackup: { path: baselinePath, id: baseline.id },
  allDataFilesByteIdenticalToDrilledBaseline: false, comparedDataFiles: finalData.size,
  byteIdenticalDataFiles: finalData.size - differences.length,
  allSixDatabasesAndAllProductionAssetsByteIdentical: true,
  onlyChangedDataFile: { path: difference.path, reason: 'Existing full-suite synthetic fixture export changes run UUID and timestamps.', previousHash: difference.previous.sha256, finalHash: difference.current.sha256, semanticContentOtherwiseIdentical: true, finalBytesRestoredAndHashVerified: true, preservedPriorDrillFile: priorFixture },
  testedCurrentApplicationCaptured: currentSourceVerified,
  isolatedDrill: drill,
  allDatabaseExternalDependencyScan: allDatabaseDependencies.map(db => ({ database: db.database, tables: db.tables, outsidePaths: db.outsideData.length })),
  browser: { normalChapterSelectorOpened: 'Hatam / Mark 3', url: 'http://localhost:4002/',
    retainedClip: drill.representativeClip.path, readyState: 4, playbackAdvancedToEndSeconds: 4.625,
    mediaError: null, ffmpegFullDecode: 'passed', paidRegeneration: false,
    limitations: ['Mark 3 has no recorded current chapter render.', 'Some legacy composite-audio UI links remain broken.'] },
  validation: { tests: 562, testFiles: 96, typecheck: 'passed', webBuild: 'passed', powershellSyntax: 'passed', pythonCompilation: 'passed', diffCheck: 'passed' },
  goalGuardian: { separateReviewStep: true, scope: 'passed', savedWorkflow: 'passed', acceptance: 'open: qualifying separate storage and remote restore required' },
  remoteRecoveryVerified: false, survivesWorkingDiskFailure: false,
  uploadPerformed: false, scheduledTaskEnabled: false, smsSent: false,
  pendingDecision: 'Configured OneDrive fails the selected 750 GiB-free condition. Dan must choose another destination/account or revise the condition.'
};
writeFileSync('outputs/disaster-backup-final-evidence.json', JSON.stringify(evidence, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ id: final.id, files: evidence.files, bytes: evidence.bytes, comparedDataFiles: finalData.size, byteIdenticalDataFiles: finalData.size - differences.length, restoredFixtureOnlyException: difference.path, allSixDatabasesAndAllProductionAssetsByteIdentical: true, currentApplicationFilesConfirmed: currentSourceVerified.length, survivesWorkingDiskFailure: false }, null, 2));
