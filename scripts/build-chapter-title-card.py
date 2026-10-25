"""
Renders one chapter's title-card still image per docs/design/chapter-title-card.md.
Never invoked by an AI provider -- this is real font rendering (Pillow), since
every generation prompt in this pipeline forbids in-scene text.

Usage: python build-chapter-title-card.py <bg.png> <title text> <language label> <out.png>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

TITLE_FONT = os.environ.get("HEARTWORD_TITLE_FONT", r"C:\Windows\Fonts\georgiab.ttf")
LABEL_FONT = os.environ.get("HEARTWORD_LABEL_FONT", r"C:\Windows\Fonts\arial.ttf")


def shadow_text(draw, pos, text, font, fill, shadow=(0, 0, 0), offset=3):
    x, y = pos
    draw.text((x + offset, y + offset), text, font=font, fill=shadow)
    draw.text((x, y), text, font=font, fill=fill)


def main():
    if len(sys.argv) != 5:
        raise ValueError("Expected background, verified book/chapter, language name and new output path")
    bg_path, title, label, out_path = sys.argv[1:5]
    if not title.strip() or not label.strip() or os.path.exists(out_path):
        raise ValueError("Nonempty title and language plus a new output path are required")
    if not os.path.isfile(TITLE_FONT) or not os.path.isfile(LABEL_FONT):
        raise ValueError("Configured Mark 4 title and language-label fonts are unavailable")

    base = Image.open(bg_path).convert("RGB")
    if base.width < 300 or base.height < 300:
        raise ValueError("Clean establishing frame is too small for the chapter title")
    # Match the approved title-over-lake-r1.png treatment: undarkened lake,
    # Georgia Bold white chapter title, smaller gold Arial language label.
    # The old Mark 2/3 short white rule and letter-spaced label are absent.
    card = base
    draw = ImageDraw.Draw(card)

    title_size = round(base.height * 87 / 941)
    label_size = round(base.height * 37 / 941)

    title_font = ImageFont.truetype(TITLE_FONT, title_size)
    label_font = ImageFont.truetype(LABEL_FONT, label_size)
    # Metadata keeps the approved native spelling; only presentation uses
    # uppercase. Check the glyphs actually drawn, including uppercase forms.
    title = title.upper()
    label = label.upper()
    for text, font in ((title, title_font), (label, label_font)):
        missing = bytes(font.getmask("\ufffd"))
        for character in text:
            if not character.isspace() and character != "\ufffd" and bytes(font.getmask(character)) == missing:
                raise ValueError(f"Configured title font lacks glyph U+{ord(character):04X}")

    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if tw > card.width * 0.9:
        raise ValueError("Chapter title does not fit the approved card layout")
    tx = (card.width - tw) / 2 - bbox[0]
    ty = round(card.height * 267 / 941) - bbox[1]
    shadow_text(draw, (tx, ty), title, title_font, (255, 255, 255))

    bbox2 = draw.textbbox((0, 0), label, font=label_font)
    lw = bbox2[2] - bbox2[0]
    if lw > card.width * 0.9:
        raise ValueError("Language name does not fit the approved card layout")
    lx = (card.width - lw) / 2 - bbox2[0]
    ly = round(card.height * 385 / 941) - bbox2[1]
    shadow_text(draw, (lx, ly), label, label_font, (217, 179, 106), offset=2)

    card.convert("RGB").save(out_path)
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
