/** Isolated Mark 6 feasibility run through the existing speaking provider.
 * No chapter creation, DB writes, voice conversion, paid fallback or retries. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LtxChainedSpeaking } from '../src/pipeline/voice-lipsync/ltx-speaking.js';
import { generateA2vSection, assertLocalA2v } from '../src/providers/ltx/a2v.js';
import { SshLtxTransport, childEnvironment } from '../src/providers/ltx/transport.js';
import { ltxJson, redactLtxSecret } from '../src/providers/ltx/http.js';
import { detectSilences } from '../src/pipeline/ingestion/detect-silences.js';
import { planShortSpeaking } from '../src/pipeline/voice-lipsync/short-speaking-plan.js';

const run = process.argv.includes('--run-local-tests');
if (process.argv.slice(2).some(a => a !== '--run-local-tests')) throw new Error('Unknown argument.');
const base = resolve('outputs/mark6-preparation');
const dataDir = join(base, 'ltx-prepared-tests-v3');
const packetPath = join(dataDir, 'manifest.json');
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const packetHash = hash(packetPath), packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const source = JSON.parse(readFileSync(join(base, 'source-packet-v3/source-packet.json'), 'utf8'));
const cropPath = join(base, 'ltx-crop-review/chain-v4-crop.json');
const cropHash = hash(cropPath), cropEvidence = JSON.parse(readFileSync(cropPath, 'utf8'));
const crop = { ...cropEvidence.crop, evidenceRef: cropPath };
const ids = ['short-v37', 'chain-v4', 'pause-v50'];
if (packet.tests.length !== 3 || packet.tests.some((t: any, i: number) => t.id !== ids[i]) ||
    packet.tests.reduce((n: number, t: any) => n + t.plan.sections.length, 0) !== 5) throw new Error('Unexpected test batch.');
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const validateCanon = (t: any) => {
  const db = new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite', { readOnly: true });
  try {
    const cv = db.prepare("SELECT character_id, locked_visual_facts FROM character_versions WHERE id=? AND status='approved'").get(t.canon.id);
    if (!cv || cv.character_id !== t.canon.character_id || JSON.stringify(JSON.parse(cv.locked_visual_facts)) !== JSON.stringify(t.canon.locked_visual_facts)) throw new Error('Pinned approved canon changed.');
  } finally { db.close(); }
};
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { encoding: 'utf8', windowsHide: true, env: childEnvironment(), maxBuffer: 1024 * 1024 });
const pcmHash = (p: string) => ff(['-i', p, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-']).trim();
const authorized = () => {
  if (hash(packetPath) !== packetHash || hash(cropPath) !== cropHash || hash(source.input.audio) !== source.input.sourceHashes.audio) throw new Error('Pinned packet/crop/original audio changed.');
  for (const t of packet.tests) {
    if (hash(t.audioPath) !== t.audioSha256 || hash(t.startingFrame.path) !== t.startingFrame.sha256) throw new Error('Pinned test audio/frame changed.');
    validateCanon(t);
  }
};
authorized();
for (const t of packet.tests) {
  const quiet = detectSilences(t.audioPath, { minDurationSec: .15 }).map(q => ({ startSample: Math.round(q.startMs * t.sampleRate / 1000), endSample: Math.round(q.endMs * t.sampleRate / 1000) }));
  const plan = planShortSpeaking({ sampleRate: t.sampleRate, sampleCount: t.sourceEndSample - t.sourceStartSample, quiet });
  if (JSON.stringify(plan.sections) !== JSON.stringify(t.plan.sections)) throw new Error(`Prepared section plan differs: ${t.id}`);
}
if (cropEvidence.frameSha256 !== packet.tests[1].startingFrame.sha256 || cropEvidence.status !== 'assistant_technical_test_crop_only') throw new Error('Crop is not bound to this candidate.');
const token = process.env.LTX_TOKEN?.trim();
if (!token) throw new Error('Local encrypted session credential is required.');
const transport = new SshLtxTransport();
let preflight: any;
try {
  const url = await transport.connect();
  const health = await ltxJson(url, '/health', token, 10000);
  assertLocalA2v(health, await ltxJson(url, '/api/runtime-policy', token, 10000), await ltxJson(url, '/api/settings', token, 10000));
  const progress = await ltxJson(url, '/api/generation/progress', token, 5000);
  if (progress.status === 'running') throw new Error('Local backend busy; no submission.');
  preflight = { checkedAt: new Date().toISOString(), status: 'local_only_idle', localOnly: true, activeModel: health.active_model,
    remoteDisk: await transport.remote('df -Pk "$HOME" | tail -1'), providerCalls: 0 };
} catch (e) { throw new Error(redactLtxSecret((e as Error).message, token)); }
finally { transport.reset(); }
const runDir = join(base, 'ltx-test-run-20261101');
mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, run ? 'preflight-run.json' : 'preflight-only.json'), JSON.stringify(preflight, null, 2), { flag: 'wx' });
console.log(JSON.stringify(preflight));
if (!run) process.exit(0);
const executionPath = join(runDir, 'execution.json');
if (existsSync(executionPath) || ids.some(id => existsSync(join(dataDir, 'assets/generated/lip-sync', `ltx-mark6-20261101-${id}`)))) throw new Error('Retained run exists; reconcile, never retry automatically.');
const state: any = { status: 'running_isolated_tests', startedAt: new Date().toISOString(), packetPath, packetHash, cropHash,
  authorization: 'Dan requested Mark 6 short LTX feasibility tests and continuation; full production held. Local-only, unchanged narrator audio, no paid fallback.',
  fullProductionStarted: false, sourceApproval: 'not_inferred', newVoiceCalls: 0, externalApiCalls: 0, maxContainers: 5, containersStarted: 0, tests: [] };
const save = () => writeFileSync(executionPath, JSON.stringify(state, null, 2)); save();
try {
  for (const t of packet.tests) {
    const entry: any = { id: t.id, status: 'preparing', originalSourceStartSample: t.sourceStartSample, originalSourceEndSample: t.sourceEndSample, quote: t.quote,
      advisory: t.id === 'chain-v4' ? 'Neckline continuity advisory retained; test only.' : null, startedAt: new Date().toISOString() };
    state.tests.push(entry); save();
    let sectionIndex = 0;
    const provider = new LtxChainedSpeaking({ dataDir, crop: t.id === 'chain-v4' ? crop : undefined,
      generateSection: async input => {
        authorized();
        if (sectionIndex >= t.plan.sections.length || state.containersStarted >= 5) throw new Error('Container ceiling reached.');
        const expected = join(dataDir, 'assets', t.id, `submission-${sectionIndex}.wav`);
        if (pcmHash(expected) !== pcmHash(input.audio)) throw new Error('Submission PCM differs from reviewed section.');
        if (sectionIndex === 0 && hash(input.image) !== hash(t.startingFrame.path)) {
          // FFmpeg may rewrite PNG metadata; compare decoded RGB pixels.
          const pixels = (p: string) => ff(['-i', p, '-f', 'hash', '-hash', 'sha256', '-']).trim();
          if (pixels(input.image) !== pixels(t.startingFrame.path)) throw new Error('Starting image pixels differ.');
        }
        entry.status = 'generating'; entry.sectionIndex = sectionIndex++; state.containersStarted++; save();
        console.log(JSON.stringify({ id: t.id, section: entry.sectionIndex, status: 'local_container_starting' }));
        return generateA2vSection(input);
      } });
    entry.result = await provider.sync({ characterId: t.canon.character_id, characterVersionId: t.canon.id, storyVerseRef: `Mark 6:${t.verse}`, lockedVisualFacts: t.canon.locked_visual_facts },
      { path: t.audioPath, startMs: 0, endMs: (t.sourceEndSample - t.sourceStartSample) * 1000 / t.sampleRate }, { path: t.startingFrame.path },
      { requestId: `mark6-20261101-${t.id}`, authorizeSubmission: authorized, productionRevision: { runId: 'isolated-mark6-ltx-tests-20261101', briefHash: packetHash } });
    entry.status = 'complete_line_held_for_review'; entry.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ id: t.id, status: entry.status, media: entry.result.media }));
  }
  state.status = 'three_candidates_generated_held_for_complete_line_review'; state.finishedAt = new Date().toISOString(); save();
} catch (e) {
  state.status = 'held_reconcile_before_any_retry'; state.error = redactLtxSecret((e as Error).message, token); save();
  throw new Error(state.error);
}
