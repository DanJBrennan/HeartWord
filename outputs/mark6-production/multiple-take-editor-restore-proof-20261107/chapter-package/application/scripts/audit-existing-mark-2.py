"""Local, read-only evidence for the existing Mark 2 edit; never approves coverage.

Requires Python + numpy and FFmpeg. Read database-evidence.json (a read-only
SQLite snapshot) and blender-timeline.json exported by export_timeline.py.
Pixel/audio matches are measurements, not Scripture or editorial approval.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

import numpy as np


def run(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def pcm(path, start=None, duration=None):
    args = ["ffmpeg", "-v", "error"]
    if start is not None:
        args += ["-ss", str(start)]
    args += ["-i", str(path)]
    if duration is not None:
        args += ["-t", str(duration)]
    return np.frombuffer(run(args + ["-vn", "-ac", "1", "-ar", "4000", "-f", "f32le", "-"]), dtype="<f4").copy()


def frames(path):
    return np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(path), "-an", "-vf",
                             "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,scale=32:18,fps=24",
                             "-pix_fmt", "gray", "-f", "rawvideo", "-"]), dtype=np.uint8).reshape(-1, 576).astype(np.float32)


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_entries",
                           "format=duration:stream=codec_type,duration,start_time,nb_frames,r_frame_rate",
                           "-of", "json", str(path)]))


def save(path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def match_audio(target, template):
    """Normalized correlation, with silence in either input excluded."""
    n, m = len(target), len(template)
    if not m or m > n:
        return {"score": 0, "startMs": None}
    template = template.astype(np.float64) - float(template.mean())
    energy = float(template @ template)
    if energy < m * 1e-8:
        return {"score": 0, "startMs": None, "reason": "reference is near-silent"}
    size = 1 << (n + m - 2).bit_length()
    corr = np.fft.irfft(np.fft.rfft(target, size) * np.conj(np.fft.rfft(template, size)), size)[:n-m+1]
    total = np.concatenate(([0.0], np.cumsum(target, dtype=np.float64)))
    sq = np.concatenate(([0.0], np.cumsum(target.astype(np.float64)**2)))
    variance = np.maximum(sq[m:] - sq[:-m] - (total[m:] - total[:-m])**2/m, 0)
    scores = np.divide(corr, np.sqrt(energy * variance), out=np.zeros_like(corr), where=variance > m*1e-8)
    best = int(np.argmax(scores))
    return {"score": round(float(scores[best]), 6), "startMs": best / 4}


def audit(args):
    directory, assets = Path(args.evidence), Path(args.data) / "assets"
    evidence = json.loads((directory / "database-evidence.json").read_text())
    render = evidence["renders"][0]
    render_path = assets / render["result_asset_path"]
    base = {"renderId": render["id"], "path": str(render_path),
            "renderSha256": hashlib.sha256(render_path.read_bytes()).hexdigest(),
            "media": probe(render_path), "recordedDurationMs": render["total_duration_ms"]}
    if args.mode == "picture":
        target = frames(render_path)
        script = Path("scripts/assemble-full-chapter-with-inserts.ts").read_text(encoding="utf-8")
        sequence = script.split("const timeline: Segment[] = [", 1)[1].split("\n];", 1)[0]
        items = []
        for kind, key, label in re.findall(r'^\s*(SHOT|RAW)\("([^"]+)"(?:, "([^"]+)")?', sequence, re.M):
            shot = next((s for s in evidence["shots"] if s["id"] == key), None)
            path = ("generated/assembled/" + key + ".mp4") if kind == "SHOT" else key
            items.append({"path": path, "label": label or (f"{shot['scene_sequence']}.{shot['sequence']} {shot['verse_ref']}" if shot else key),
                          "shotId": key if kind == "SHOT" else None})
        # Extra strips in the editor let us map individual cuts inside merged blocks.
        editor = json.loads((directory / "blender-timeline.json").read_text())
        for scene in editor["scenes"]:
            for strip in scene["strips"]:
                if strip["type"] != "MOVIE":
                    continue
                path = Path(strip["path"]).resolve().relative_to(assets.resolve()).as_posix()
                if not any(Path(i["path"]).as_posix() == path for i in items):
                    items.append({"path": path, "label": strip["name"], "shotId": next((s["id"] for s in evidence["shots"] if s["id"] in path), None)})
        for item in items:
            path = assets / item["path"]
            if not path.exists():
                item["missing"] = True
                continue
            item["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            item["media"] = probe(path)
            reference = frames(path)
            offsets = sorted(set([min(24, len(reference)//3), len(reference)//2, max(0, len(reference)-13)]))
            matches = []
            for offset in offsets:
                errors = np.mean((target-reference[offset])**2, axis=1)
                best = int(np.argmin(errors))
                matches.append({"sourceFrame": offset, "renderFrame": best,
                                "impliedStartFrame": best-offset, "rmse": round(float(np.sqrt(errors[best])), 3)})
            item["matches"] = matches
            print(item["label"], matches, flush=True)
        save(directory / "picture-evidence.json", {**base, "fps": 24, "items": items})
    else:
        target = pcm(render_path)
        original = [a for a in evidence["audio"] if a["layer"] == "original_reading"]
        casts = [a for a in evidence["audio"] if a["layer"] == "composite_cast_master"]
        items = []
        for source in original:
            if args.mode == "original-dialogue" and not source["speaker_character_id"]:
                continue
            cast = next(a for a in casts if a["verse_ref"] == source["verse_ref"])
            selected = cast if source["speaker_character_id"] and args.mode != "original-dialogue" else source
            start = 0 if selected is cast else source["start_ms"] / 1000
            duration = (selected["end_ms"]-selected["start_ms"]) / 1000
            path = assets / selected["source_path"]
            template = pcm(path, start, duration)
            whole = match_audio(target, template)
            chunks = []
            # Overlapping two-second samples reveal truncated/repeated speech.
            width = min(8000, len(template))
            offsets = sorted(set(list(range(0, len(template)-width+1, 8000)) + [len(template)-width]))
            for offset in offsets:
                match = match_audio(target, template[offset:offset+width])
                chunks.append({"referenceStartMs": offset / 4, "durationMs": width / 4, **match})
            items.append({"segmentId": source["id"], "verseRef": source["verse_ref"],
                          "sourceStartMs": source["start_ms"], "sourceEndMs": source["end_ms"],
                          "audioPath": selected["source_path"], "audioSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                          "layer": selected["layer"], "whole": whole, "chunks": chunks})
            print(source["verse_ref"], whole, 'matched chunks', sum(c['score'] >= .85 for c in chunks), '/', len(chunks), flush=True)
            save(directory / ("original-dialogue-evidence.json" if args.mode == "original-dialogue" else "audio-evidence.json"), {**base, "sampleRate": 4000, "items": items})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--mode", choices=["picture", "audio", "original-dialogue"], required=True)
    audit(parser.parse_args())
