"""
Renders the two Blender caption tracks (Hatam + speaker name; English) as
pre-rendered PNG images, one per word-highlight state, matching the visual
pattern from Dan's own BVET project (localhost:4173, "HATAM · MARK 1:3" /
"ENGLISH REFERENCE · MARK 1:3" boxes with one word highlighted).

Blender's Sequencer has no native rich-text/karaoke feature, so each
distinct highlighted-word state is its own image, cut in as a timed Image
strip (see build_healing_sequence.py). The verse reference in each box's
header tracks whichever word is CURRENTLY playing, not a fixed span label,
per Dan's direction (2026-09-10).

Usage: python render-caption-images.py <captions.json> <outDir> <manifestOut.json>
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 720
HEADER_FONT = r"C:\Windows\Fonts\trebucbd.ttf"
BODY_FONT = r"C:\Windows\Fonts\trebuc.ttf"
BODY_FONT_BOLD = r"C:\Windows\Fonts\trebucbd.ttf"

# Rendered at 2x then downsampled with LANCZOS before saving (see
# render_box) -- plain single-pass anti-aliasing at the true 15-21px text
# size looked visibly soft next to the video footage around it (Dan,
# 2026-09-10). Supersample-then-downsample is the standard fix for crisp
# small text without changing the on-screen box size or layout.
SCALE = 2

BOX_PAD_X = 28 * SCALE
BOX_PAD_Y = 14 * SCALE
BOX_MARGIN_X = 40 * SCALE
LINE_HEIGHT = 30 * SCALE
HATAM_BOX_BOTTOM_Y = 560 * SCALE
ENGLISH_BOX_BOTTOM_Y = 660 * SCALE
MAX_LINES = 2


def wrap_words(draw, words, font, max_width):
    """Greedy word-wrap, returns list of lines, each a list of (word, x, y, w) placed left-to-right within the line -- we just need line groupings here, x positions computed at draw time."""
    lines = []
    current = []
    current_width = 0
    space_w = draw.textlength(" ", font=font)
    for w in words:
        ww = draw.textlength(w, font=font)
        added = ww if not current else space_w + ww
        if current and current_width + added > max_width:
            lines.append(current)
            current = [w]
            current_width = ww
        else:
            current.append(w)
            current_width += added
    if current:
        lines.append(current)
    return lines


def render_box(label_prefix, verse_ref, words, active_index, box_bottom_y, highlight_color):
    img = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    header_font = ImageFont.truetype(HEADER_FONT, 15 * SCALE)
    body_font = ImageFont.truetype(BODY_FONT, 21 * SCALE)

    max_text_width = WIDTH * SCALE - 2 * BOX_MARGIN_X - 2 * BOX_PAD_X
    all_lines = wrap_words(draw, words, body_font, max_text_width)

    # Find which wrapped line the ACTIVE word falls on, and show a window
    # of MAX_LINES ending at that line -- not just the last MAX_LINES of
    # the whole text. A cue can wrap into many more lines than fit the
    # box, so showing a fixed tail regardless of playback position left
    # early words un-highlightable (already scrolled off the shown lines
    # before their moment ever arrived).
    active_line_idx = 0
    counted = 0
    for li, line in enumerate(all_lines):
        if counted + len(line) > active_index:
            active_line_idx = li
            break
        counted += len(line)
    else:
        active_line_idx = max(0, len(all_lines) - 1)

    window_start = max(0, active_line_idx - (MAX_LINES - 1))
    lines = all_lines[window_start : window_start + MAX_LINES]

    box_height = BOX_PAD_Y * 2 + 22 * SCALE + len(lines) * LINE_HEIGHT
    box_top_y = box_bottom_y - box_height
    box_right_x = WIDTH * SCALE - BOX_MARGIN_X

    # semi-transparent dark background panel
    draw.rounded_rectangle(
        [BOX_MARGIN_X, box_top_y, box_right_x, box_bottom_y],
        radius=6 * SCALE,
        fill=(10, 14, 18, 215),
        outline=(60, 140, 110, 140),
        width=1 * SCALE,
    )

    # header row: "HATAM · MARK 2:3" left, "PLAYBACK CUE" right
    header_left = f"{label_prefix} · {verse_ref}"
    draw.text((BOX_MARGIN_X + BOX_PAD_X, box_top_y + BOX_PAD_Y), header_left, font=header_font, fill=(120, 200, 170, 255))
    header_right = "PLAYBACK CUE"
    hr_w = draw.textlength(header_right, font=header_font)
    draw.text((box_right_x - BOX_PAD_X - hr_w, box_top_y + BOX_PAD_Y), header_right, font=header_font, fill=(140, 150, 160, 220))

    # body: word-wrapped lines, current word highlighted
    space_w = draw.textlength(" ", font=body_font)
    text_top = box_top_y + BOX_PAD_Y + 24 * SCALE
    word_cursor = sum(len(l) for l in all_lines[:window_start])

    for li, line in enumerate(lines):
        x = BOX_MARGIN_X + BOX_PAD_X
        y = text_top + li * LINE_HEIGHT
        for w in line:
            is_active = word_cursor == active_index
            color = highlight_color if is_active else (235, 235, 235, 255)
            if is_active:
                ww = draw.textlength(w, font=body_font)
                draw.rounded_rectangle(
                    [x - 3 * SCALE, y - 2 * SCALE, x + ww + 3 * SCALE, y + LINE_HEIGHT - 6 * SCALE], radius=4 * SCALE, fill=(*highlight_color[:3], 90)
                )
            draw.text((x, y), w, font=body_font, fill=color)
            x += draw.textlength(w, font=body_font) + space_w
            word_cursor += 1

    # Downsample from the 2x supersampled canvas to the true delivery
    # resolution -- this is what actually sharpens the small text versus
    # rendering directly at 1x (LANCZOS keeps glyph edges cleaner than
    # PIL's native small-size anti-aliasing does on its own).
    return img.resize((WIDTH, HEIGHT), Image.LANCZOS)


def main():
    captions_path, out_dir, manifest_out = sys.argv[1:4]
    import os

    os.makedirs(out_dir, exist_ok=True)
    with open(captions_path, "r", encoding="utf-8") as f:
        cues = json.load(f)

    manifest = []
    for cue in cues:
        cue_id = cue["id"]
        speaker = cue.get("speaker", "").upper()
        for track_name, words_key, label_prefix, box_bottom_y, highlight_color in [
            ("hatam", "hatamWords", "HATAM", HATAM_BOX_BOTTOM_Y, (110, 230, 180, 255)),
            ("english", "englishWords", "ENGLISH REFERENCE", ENGLISH_BOX_BOTTOM_Y, (240, 170, 90, 255)),
        ]:
            word_cues = cue[words_key]
            words = [w["word"] for w in word_cues]
            for i, wc in enumerate(word_cues):
                verse_ref = f"{speaker} · MARK 2:{wc['verse']}" if speaker else f"MARK 2:{wc['verse']}"
                img = render_box(label_prefix, verse_ref, words, i, box_bottom_y, highlight_color)
                out_name = f"{cue_id}-{track_name}-{i:04d}.png"
                out_path = os.path.join(out_dir, out_name)
                img.save(out_path)
                manifest.append(
                    {
                        "track": track_name,
                        "cueId": cue_id,
                        "wordIndex": i,
                        "absPath": out_path,
                        "startMs": wc["startMs"],
                        "endMs": wc["endMs"],
                    }
                )
        print(f"{cue_id}: rendered {len(cue['hatamWords'])} Hatam + {len(cue['englishWords'])} English frames")

    with open(manifest_out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Wrote {manifest_out} ({len(manifest)} images)")


if __name__ == "__main__":
    main()
