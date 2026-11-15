"""Review derivatives only. No provider calls, selections, or database writes."""
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone

TOP = Path('outputs/mark6-production').resolve()
FOLDER = TOP / 'complete-herod-assertion-source-window-20261108'
WORKER = TOP / 'speaking-execution/herod-assertion-section1-direction-recovery-20261108'
ASSETS = Path('C:/Users/danbr/HeartWordData/assets')
LINE = ASSETS / 'generated/lip-sync/ltx-551e8038-3bb5-46f9-97f1-a232b12e1124-explicit-speaking-v3'

def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))

def sha(p):
    with Path(p).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def run(exe, args):
    return subprocess.check_output([exe, *map(str, args)], creationflags=subprocess.CREATE_NO_WINDOW)

def ff(args):
    return run('ffmpeg', ['-v', 'error', '-nostdin', '-n', *args])

def streams(p):
    return json.loads(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', p]))['streams']

def packets(p, selector):
    return json.loads(run('ffprobe', ['-v', 'error', '-select_streams', selector, '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=pts,duration,data_hash', '-of', 'json', p]))['packets']

def pcm(p, start=None, end=None):
    args = ['-i', p]
    if start is not None:
        args += ['-af', f'atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS']
    return ff([*args, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 's16le', '-'])

def checked_geometry(p, frames, samples):
    ss = streams(p)
    v = next(s for s in ss if s['codec_type'] == 'video')
    a = next(s for s in ss if s['codec_type'] == 'audio')
    assert v['width'] == 1280 and v['height'] == 720 and v['r_frame_rate'] == '24/1'
    assert int(v['nb_read_frames']) == frames
    assert a['sample_rate'] == '24000' and a['channels'] == 2 and a['time_base'] == '1/24000'
    assert int(a['duration_ts']) == samples
    return {'frames': frames, 'fps': 24, 'audioSamples': samples, 'sampleRate': 24000, 'channels': 2}

assert not (FOLDER / 'review-preparation-proof.json').exists(), 'Inspect existing result; do not overwrite'
native = read(TOP / 'native-generation/execution.json')
assert all(e['status'] == 'returned_unreviewed' for e in native['entries']), 'Wait for native settlement'
result = read(WORKER / 'result.json')
m = read(LINE / 'line.json')
assert len(m['sections']) == 4 and [s['retainedFrames'] for s in m['sections']] == [35, 77, 91, 54]
assert m['source']['sourceSha256'] == '439d735e8a822e99372a875198526d4ee7b1c42b863356106d693f06cdafef8c'
assert m['plan']['sampleCount'] == 513600 and m['plan']['totalFrames'] == 257
assert m['productionRevision']['runId'] == '67631c67-22d8-4c51-8d1e-e567dafeaaed'
assert m['productionRevision']['briefHash'] == '07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'
for i, s in enumerate(m['sections']):
    assert sha(s['rawPath']) == s['rawSha256']
    if i < 3:
        assert sha(s['carryImagePath']) == s['carryImageSha256']
    prompt = m.get('sectionPrompts', {}).get(str(i), m['prompt'])
    assert hashlib.sha256(prompt.encode()).hexdigest() == s['nativePromptSha256']
    if i:
        assert s['inputImageSha256'] == m['sections'][i-1]['carryImageSha256']

audio = read(FOLDER / 'audio-preparation-proof.json')
boundary_audio = read(FOLDER / 'reports-to-assertion-audio-proof.json')
master = Path(audio['sourceMaster'])
assert sha(master) == audio['sourceMasterSha256'] == boundary_audio['sourceMasterSha256']
for p in (audio, boundary_audio):
    assert sha(p['audio']) == p['audioSha256'] and sha(p['reference']) == p['referenceSha256']
    start, end = p.get('sourceSampleRange')
    exact = pcm(p['audio'])
    assert exact == pcm(master, start, end)
    assert hashlib.sha256(exact).hexdigest() == p['pcmSha256']

candidate = ASSETS / result['result']['media']['path']
whole = FOLDER / 'complete-herod-assertion-approved-mix.mp4'
assert not whole.exists(), 'Inspect partial output explicitly before any retry'
ff(['-i', candidate, '-i', audio['reference'], '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movie_timescale', '24000', '-movflags', '+faststart', whole])
geometry = checked_geometry(whole, 257, 256800)
assert packets(whole, 'v:0') == packets(candidate, 'v:0')
assert packets(whole, 'a:0') == packets(audio['reference'], 'a:0')

prefix = TOP / 'source-prefix-through-reports-20261108/mark6-source-opening-through-reports.mp4'
assert sha(prefix) == '140405533bf9aee65fe81d2012fdd6ec378f08e431db855637f1322933a1d9f5'
boundary = FOLDER / 'reports-to-assertion-actual-join.mp4'
filters = '[0:v]trim=start_frame=5469:end_frame=5505,setpts=N/(24*TB)[a];[1:v]trim=end_frame=36,setpts=N/(24*TB)[b];[a][b]concat=n=2:v=1:a=0[v]'
ff(['-i', prefix, '-i', whole, '-i', boundary_audio['reference'], '-filter_complex', filters, '-map', '[v]', '-map', '2:a:0', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-enc_time_base:v', '1:24', '-c:a', 'copy', '-movie_timescale', '24000', '-movflags', '+faststart', boundary])
checked_geometry(boundary, 72, 72000)
assert packets(boundary, 'a:0') == packets(boundary_audio['reference'], 'a:0')

last = m['sections'][3]
contacts = []
for kind, path in [('picture', last['picturePath']), ('raw', last['rawPath'])]:
    target = FOLDER / f'section-3-all54-{kind}.png'
    ff(['-i', path, '-vf', 'trim=end_frame=54,scale=320:-1,tile=6x9', '-frames:v', '1', target])
    contacts.append({'kind': kind, 'path': str(target), 'sha256': sha(target), 'order': 'all54 retained frames, row-major zero-based0..53'})
ff(['-i', last['picturePath'], '-vf', "select='eq(n,53)'", '-frames:v', '1', FOLDER / 'section-3-last-retained53.png'])
joins = FOLDER / 'actual-internal-join-edges.png'
ff(['-i', whole, '-vf', "select='between(n,32,37)+between(n,109,114)+between(n,200,205)',scale=320:180,tile=6x3", '-frames:v', '1', joins])
proof = {'at': datetime.now(timezone.utc).isoformat(), 'scope': 'complete10.7s q07 and separate3s reports-to-assertion join; review derivatives only', 'attemptId': result['attemptId'], 'productionRevision': m['productionRevision'], 'candidate': str(candidate), 'candidateSha256': sha(candidate), 'whole': str(whole), 'wholeSha256': sha(whole), **geometry, 'videoPacketsIdenticalToCandidate': True, 'aacPacketsIdenticalToContinuousApprovedReference': True, 'exactApprovedMasterPcmVerified': True, 'sourceMs': [229368.5,240068.5], 'sourceSampleRange': audio['sourceSampleRange'], 'internalJoinFrames': [35,112,203], 'boundary': str(boundary), 'boundarySha256': sha(boundary), 'boundaryFrames': 72, 'boundarySamples':72000, 'boundaryLocalCutFrame':36, 'boundarySourceMs':[227868.5,230868.5], 'boundaryAacPacketsEqualContinuousReference':True, 'contacts':contacts, 'joinEdges':str(joins), 'joinEdgesSha256':sha(joins), 'sections':m['sections'], 'providerCalls':0, 'databaseWrites':0, 'fullLineApproved':False, 'heardReviewPending':True, 'finalEditorMustUseOriginalCandidateAndGlobalMaster':True}
(FOLDER / 'review-preparation-proof.json').write_text(json.dumps(proof, indent=2), encoding='utf8', newline='\n')
print(json.dumps({k:proof[k] for k in ['whole','wholeSha256','boundary','boundarySha256','attemptId','heardReviewPending']}))
