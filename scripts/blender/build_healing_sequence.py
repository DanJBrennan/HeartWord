"""
Builds a real editing project for HeartWord's healing-sequence
calibration pass, in Blender's Video Sequence Editor.

Run headless: blender -b -P scripts/blender/build_healing_sequence.py

Reads the real ordered clip list (scripts/extract-healing-sequence.ts
--json output) and lays it out on a real multi-track timeline:
  - Channel 1: Video (every clip, in story order, back to back --
    each one its OWN separate, independently-selectable strip; no
    shots are pre-merged into a combined file, so any single clip can
    be selected, previewed, or swapped on its own)
  - Channel 2: Real audio directly baked into a segment that needs no
    override (dialogue lines, and any segment explicitly marked
    muteOwnAudio=false)
  - Channel 3: Continuous "audio beds" -- real narration (or other)
    audio that spans a specific timeline range independently of the
    video strips' own cut points, so a narrator's line is never cut
    mid-word just because the picture cuts to a new angle underneath it
  - Channel 4: Ambient / room tone (left EMPTY on purpose)
  - Channel 5: Music (left EMPTY on purpose)

This mirrors the `tracks` table's own kind enum already sitting unused
in HeartWord's schema.sql (narration/dialogue/music/sfx) -- the same
mental model, just realized as an actual editable timeline instead of
scaffolding.
"""
import json
import os

import bpy

DATA_JSON = r"C:\Users\danbr\AppData\Local\Temp\claude\C--Users-danbr-OneDrive-Documents-HeartWord\901bfa2e-5a77-42fc-b8fc-cfc6ad988300\scratchpad\healing-sequence.json"
OUT_BLEND = r"C:\Users\danbr\HeartWordData\assets\generated\editor\mark-2-healing-sequence.blend"
FPS = 24

VIDEO_CHANNEL = 1
DIALOGUE_CHANNEL = 2
NARRATION_BED_CHANNEL = 3
AMBIENT_CHANNEL = 4
MUSIC_CHANNEL = 5


def ms_to_frame(ms: float) -> int:
    return round(ms / 1000.0 * FPS)


def main():
    with open(DATA_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    video_segments = data["videoSegments"]
    audio_beds = data["audioBeds"]

    # Load Blender's own factory "Video Editing" app template rather than
    # starting from the bare default (Cube/Camera/Light) scene and
    # retyping one area to SEQUENCE_EDITOR at runtime -- confirmed live
    # that the retyped-area approach leaves the Sequencer's internal view
    # state (zoom/pan) uninitialized: strips were genuinely present and
    # correctly positioned (verified via headless render and via the
    # Python console), but the interactive GUI showed a blank grid.
    bpy.ops.wm.read_homefile(app_template="Video_Editing")

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720

    if scene.sequence_editor is None:
        scene.sequence_editor_create()
    se = scene.sequence_editor

    for strip in list(se.strips_all):
        se.strips.remove(strip)

    total_frames = 0
    print("label | start_frame | end_frame | hasAudio | muteOwnAudio")
    for seg in video_segments:
        start_frame = ms_to_frame(seg["startMs"])
        duration_frames = ms_to_frame(seg["durationMs"])
        end_frame = start_frame + duration_frames

        video_strip = se.strips.new_movie(
            name=seg["label"][:60],
            filepath=seg["absPath"],
            channel=VIDEO_CHANNEL,
            frame_start=start_frame,
        )
        video_strip.frame_final_end = end_frame

        if seg["hasAudio"] and not seg["muteOwnAudio"]:
            sound_strip = se.strips.new_sound(
                name=(seg["label"][:55] + "-aud"),
                filepath=seg["absPath"],
                channel=DIALOGUE_CHANNEL,
                frame_start=start_frame,
            )
            sound_strip.frame_final_end = end_frame

        print(f"{seg['label']} | {start_frame} | {end_frame} | {seg['hasAudio']} | {seg['muteOwnAudio']}")
        total_frames = max(total_frames, end_frame)

    print("\naudio beds:")
    for bed in audio_beds:
        timeline_start = ms_to_frame(bed["timelineStartMs"])
        duration_frames = ms_to_frame(bed["durationMs"])
        # frame_offset_start trims INTO the source file without moving
        # the strip's own timeline position -- this is how we start
        # playback at an arbitrary point inside the shared vocals.mp3
        # file rather than from its beginning.
        bed_strip = se.strips.new_sound(
            name=bed["label"][:60],
            filepath=bed["sourceAbsPath"],
            channel=NARRATION_BED_CHANNEL,
            frame_start=timeline_start - ms_to_frame(bed["sourceStartMs"]),
        )
        bed_strip.frame_final_start = timeline_start
        bed_strip.frame_final_end = timeline_start + duration_frames
        print(f"{bed['label']} | {timeline_start} | {timeline_start + duration_frames} | source_offset={bed['sourceStartMs']}ms")
        total_frames = max(total_frames, timeline_start + duration_frames)

    scene.frame_start = 0
    scene.frame_end = total_frames

    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"\nSaved: {OUT_BLEND}")
    print(f"Total: {total_frames} frames ({total_frames / FPS:.1f}s)")
    print("Channels: 1=Video 2=Dialogue 3=Narration-bed 4=Ambient(empty) 5=Music(empty)")


main()
