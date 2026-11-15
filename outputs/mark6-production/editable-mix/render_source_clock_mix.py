"""Rebuild approved PCM on an explicit source-to-picture map; no gain or ducking.

Production recipe artifact, used alongside HeartWord's existing editorial cut.
All paths are relative to --root so the same recipe works after package restore.
This does not accept a cut, update the database, or generate audio/media.
"""
import argparse
import hashlib
import json
import pathlib
import wave


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def asset_path(root, value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError('Expected portable relative asset path')
    p = pathlib.PurePosixPath(value)
    if p.is_absolute() or ':' in value or '..' in p.parts:
        raise ValueError('Asset path must stay inside the restored root')
    result = (root / p).resolve()
    if not result.is_relative_to(root):
        raise ValueError('Asset path escapes the restored root')
    return result


def frame(value):
    if type(value) is not int or value < 0:
        raise ValueError('PCM positions must be nonnegative integer frames')
    return value


def render(root, recipe):
    root = pathlib.Path(root).resolve()
    if recipe.get('version') != 1:
        raise ValueError('Unsupported source-clock mix recipe')
    source = asset_path(root, recipe['source']['path'])
    output = asset_path(root, recipe['outputPath'])
    if source == output or output.exists():
        raise ValueError('Retained input/output already exists; never overwrite')
    if sha256(source) != recipe['source']['sha256']:
        raise ValueError('Approved source mix hash changed')
    target_frames = frame(recipe['targetFrames'])
    if target_frames == 0:
        raise ValueError('Empty target clock')
    with wave.open(str(source), 'rb') as src:
        if (src.getnchannels(), src.getsampwidth(), src.getframerate(), src.getcomptype()) != (2, 2, 24000, 'NONE'):
            raise ValueError('Approved mix must be stereo PCM16 at24kHz')
        if src.getnframes() != recipe['source']['frames']:
            raise ValueError('Source frame count changed')
        source_cursor = target_cursor = 0
        placements = recipe['placements']
        for p in placements:
            a, b, x, y = [frame(p[k]) for k in ('sourceStartFrame', 'sourceEndFrame', 'targetStartFrame', 'targetEndFrame')]
            if a != source_cursor or b <= a or b > src.getnframes():
                raise ValueError('Source must be complete, continuous, ordered and used once')
            if x < target_cursor or y - x != b - a or y > target_frames:
                raise ValueError('Source may not overlap, stretch, truncate or exceed picture')
            source_cursor, target_cursor = b, y
        if source_cursor != src.getnframes():
            raise ValueError('Complete source including its quiet tail is required')
        output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation retains any interrupted output for diagnosis.
        with output.open('xb') as handle, wave.open(handle, 'wb') as dst:
            dst.setnchannels(2)
            dst.setsampwidth(2)
            dst.setframerate(24000)
            cursor = 0
            def silence(count):
                while count:
                    n = min(count, 24000)
                    dst.writeframesraw(bytes(n * 4))
                    count -= n
            for p in placements:
                silence(p['targetStartFrame'] - cursor)
                src.setpos(p['sourceStartFrame'])
                remaining = p['sourceEndFrame'] - p['sourceStartFrame']
                while remaining:
                    n = min(remaining, 24000)
                    pcm = src.readframes(n)
                    if len(pcm) != n * 4:
                        raise ValueError('Source PCM ended unexpectedly')
                    dst.writeframesraw(pcm)
                    remaining -= n
                cursor = p['targetEndFrame']
            silence(target_frames - cursor)
    with wave.open(str(output), 'rb') as dst, wave.open(str(source), 'rb') as src:
        if dst.getnframes() != target_frames:
            raise ValueError('Rebuilt clock does not match recipe')
        cursor = 0
        def check_silence(end):
            nonlocal cursor
            while cursor < end:
                n = min(end - cursor, 24000)
                if dst.readframes(n) != bytes(n * 4):
                    raise ValueError('Non-source interval contains unexpected samples')
                cursor += n
        for p in placements:
            check_silence(p['targetStartFrame'])
            remaining = p['sourceEndFrame'] - p['sourceStartFrame']
            while remaining:
                n = min(remaining, 24000)
                if src.readframes(n) != dst.readframes(n):
                    raise ValueError('Approved source samples changed during placement')
                remaining -= n
                cursor += n
        check_silence(target_frames)
    return {'outputPath': recipe['outputPath'], 'sha256': sha256(output),
            'sourceFramesPreserved': source_cursor, 'targetFrames': target_frames,
            'placements': len(placements), 'gainDb': 0, 'additionalDuckingDb': 0,
            'sourcePcmComparedExactly': True, 'databaseWrites': 0, 'providerCalls': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--recipe', required=True)
    args = parser.parse_args()
    recipe = json.loads(pathlib.Path(args.recipe).read_text(encoding='utf-8'))
    print(json.dumps(render(args.root, recipe)))
