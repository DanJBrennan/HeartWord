"""Verifies the healing-sequence .blend without depending on Blender's
FFmpeg video encoder (confirmed unavailable in this build -- the static
RNA schema lists 'FFMPEG' as a valid image_settings.file_format value,
but assigning it fails at runtime with a shorter enum that excludes it,
meaning this build wasn't compiled with FFmpeg output support). Renders
a handful of individual frames as PNGs at known checkpoint timestamps
(confirms the right clip's real content is really at the right
position) and a separate audio mixdown to WAV (confirms the multi-track
audio -- dialogue/narration real content, silence on the empty ambient/
music tracks -- sums correctly), instead of one combined MP4 render."""
import os

import bpy

BLEND_PATH = r"C:\Users\danbr\HeartWordData\assets\generated\editor\mark-2-healing-sequence.blend"
OUT_DIR = r"C:\Users\danbr\HeartWordData\assets\generated\editor\verify"
FPS = 24

# Checkpoint frames: just after Shot5 forgiveness ends / narration block
# starts (7523ms -> frame 181), mid-narration-block (frame 300), and
# right after it hands off to Shot7's own dialogue (26606ms -> frame 639).
CHECK_FRAMES = [5, 190, 300, 645, 900]

os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"

for f in CHECK_FRAMES:
    scene.frame_set(f)
    scene.render.filepath = os.path.join(OUT_DIR, f"frame_{f:05d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED_FRAME: {f}")

# Audio mixdown -- independent of the video encoder issue, exercises the
# actual multi-track audio mixing (dialogue/narration channel + silent
# ambient/music channels).
mixdown_path = os.path.join(OUT_DIR, "audio_mixdown.wav")
bpy.ops.sound.mixdown(filepath=mixdown_path, container="WAV", codec="PCM")
print(f"RENDERED_AUDIO: {mixdown_path}")
