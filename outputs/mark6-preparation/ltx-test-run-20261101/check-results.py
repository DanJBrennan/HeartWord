"""Read-only media checks for the running isolated test batch; no inference."""
import argparse
import hashlib
import json
import subprocess
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'ltx-prepared-tests-v3'

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def command(*args):
    return subprocess.check_output(args, creationflags=subprocess.CREATE_NO_WINDOW)

def pcm(path):
    return command('ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-map', '0:a:0', '-f', 's16le', '-')

def probe(path):
    return json.loads(command('ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', str(path)))['streams']

parser = argparse.ArgumentParser()
parser.add_argument('--wait', action='store_true')
args = parser.parse_args()
deadline = time.monotonic() + 3 * 3600
if args.wait:
    while time.monotonic() < deadline:
        state = read_json(HERE / 'execution.json')
        if state['status'] != 'running_isolated_tests':
            break
        time.sleep(10)

state = read_json(HERE / 'execution.json')
packet = read_json(DATA / 'manifest.json')
report = {'checkedAtUnix': time.time(), 'executionStatus': state['status'],
          'status': 'technical_checks_only_complete_line_AV_review_pending',
          'fullProductionStarted': False, 'newProviderCalls': 0, 'tests': [],
          'limitations': 'PCM/frame integrity and still sheets do not establish syllable sync, natural acting, silence response or producer acceptance.'}
for test in packet['tests']:
    root = DATA / 'assets/generated/lip-sync' / ('ltx-mark6-20261101-' + test['id'])
    item = {'id': test['id'], 'status': 'not_completed', 'checks': {}}
    report['tests'].append(item)
    if not (root / 'line.json').exists():
        continue
    line = read_json(root / 'line.json')
    item['lineStatus'] = line['status']
    if line['status'] != 'complete_line_held_for_review':
        continue
    try:
        original = pcm(Path(test['audioPath']))
        full_line = pcm(root / 'full-line.wav')
        assert original == full_line, 'Full line PCM differs from reviewed source excerpt'
        assert len(full_line) == (test['sourceEndSample'] - test['sourceStartSample']) * 4
        item['checks']['fullLineExactOriginalPCM'] = True
        pieces = []
        for section in line['sections']:
            idx = section['index']
            submitted = pcm(root / f'section-{idx}.wav')
            length = (section['sourceEndSample'] - section['sourceStartSample']) * 4
            assert len(submitted) == 5 * test['sampleRate'] * 4
            assert not any(submitted[length:]), 'Nonzero padded tail'
            pieces.append(submitted[:length])
            raw = Path(section['rawPath'])
            assert digest(raw) == section['rawSha256']
            stream = next(s for s in probe(raw) if s['codec_type'] == 'video')
            assert stream['r_frame_rate'] == '24/1'
            assert int(stream['nb_read_frames']) >= section['retainedFrames']
            if idx:
                previous = line['sections'][idx - 1]
                assert section['inputImageSha256'] == previous['carryImageSha256']
                assert digest(Path(previous['carryImagePath'])) == section['inputImageSha256']
        assert b''.join(pieces) == original, 'Repeated, missing or changed section PCM'
        item['checks']['partitionExactWithZeroTails'] = True
        item['checks']['carryImageHashesMatch'] = True
        final = root / 'candidate.mp4'
        assert digest(final) == line['outputSha256']
        streams = probe(final)
        video = next(s for s in streams if s['codec_type'] == 'video')
        assert int(video['nb_read_frames']) == test['plan']['totalFrames']
        assert video['r_frame_rate'] == '24/1'
        assert video['width'] == 1280 and video['height'] == 720
        expected = root / 'technical-check-single-encode.m4a'
        if not expected.exists():
            command('ffmpeg', '-v', 'error', '-nostdin', '-n', '-i', str(root / 'full-line.wav'), '-c:a', 'aac', '-b:a', '192k', str(expected))
        assert pcm(final) == pcm(expected), 'Delivered audio differs from independent single full-line encode'
        item['checks']['singleContinuousAudioEncode'] = True
        item['checks']['frameCount24fps1280x720'] = True
        item['outputPath'] = str(final)
        item['status'] = 'technical_checks_passed_AV_acceptance_pending'
        sheets = HERE / 'review-sheets' / test['id']
        sheets.mkdir(parents=True, exist_ok=True)
        # Every delivered frame appears once. These are inspection derivatives,
        # never changed scene/canon inputs or replacements for complete-line AV.
        command('ffmpeg', '-v', 'error', '-nostdin', '-n', '-i', str(final), '-vf',
                'scale=320:180,tile=6x4', '-fps_mode', 'passthrough', str(sheets / 'frames-%02d.png'))
        item['reviewSheets'] = str(sheets)
    except Exception as error:
        item['status'] = 'technical_hold'
        item['error'] = str(error)

(HERE / 'technical-checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
