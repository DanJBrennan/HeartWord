"""Read an existing Blender edit without saving or rendering it.

blender --background --disable-autoexec edit.blend --python this.py -- --out timeline.json
Frame ranges are half-open; retain frames as the authority (not rounded milliseconds).
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import warnings

import bpy

warnings.filterwarnings("ignore", category=DeprecationWarning)


def export_timeline():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = Path(bpy.data.filepath)
    if not source.is_file():
        raise ValueError("Open the existing .blend file before exporting its timeline.")
    scenes = []
    for scene in bpy.data.scenes:
        editor = scene.sequence_editor
        strips = []
        if editor:
            for strip in editor.strips_all:
                item = {"name": strip.name, "type": strip.type}
                for key in ("channel", "mute", "frame_start", "frame_final_start", "frame_final_end",
                            "frame_duration", "frame_offset_start", "frame_offset_end",
                            "animation_offset_start", "animation_offset_end", "speed_factor",
                            "volume", "pan", "pitch", "blend_type", "blend_alpha", "use_reverse_frames"):
                    if hasattr(strip, key):
                        item[key] = getattr(strip, key)
                if hasattr(strip, "filepath"):
                    item["path"] = bpy.path.abspath(strip.filepath)
                if strip.type == "SOUND" and strip.sound:
                    item["path"] = bpy.path.abspath(strip.sound.filepath)
                    item["sound_offset_seconds"] = strip.sound_offset
                if strip.type == "IMAGE":
                    item["directory"] = bpy.path.abspath(strip.directory)
                    item["elements"] = [element.filename for element in strip.elements]
                strips.append(item)
        scenes.append({"name": scene.name, "fps": scene.render.fps,
                       "fpsBase": scene.render.fps_base, "frameStart": scene.frame_start,
                       "frameEndInclusive": scene.frame_end,
                       "channels": [{"name": c.name, "index": i, "mute": c.mute}
                                    for i, c in enumerate(editor.channels)] if editor else [],
                       "strips": sorted(strips, key=lambda s: (s["frame_final_start"], s["channel"]))})
    payload = {"schemaVersion": 1, "blenderVersion": bpy.app.version_string,
               "source": str(source), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
               "activeScene": bpy.context.scene.name, "scenes": scenes}
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Exported {sum(len(s['strips']) for s in scenes)} strips to {output}; original edit unchanged.")


export_timeline()
