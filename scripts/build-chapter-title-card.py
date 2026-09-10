"""
Renders one chapter's title-card still image per docs/design/chapter-title-card.md.
Never invoked by an AI provider -- this is real font rendering (Pillow), since
every generation prompt in this pipeline forbids in-scene text.

Usage: python build-chapter-title-card.py <bg.png> <title text> <language label> <out.png>
"""
import sys
from PIL import Image, ImageDraw, ImageFont

TITLE_FONT = r"C:\Windows\Fonts\georgiab.ttf"
LABEL_FONT = r"C:\Windows\Fonts\trebuc.ttf"


def shadow_text(draw, pos, text, font, fill, shadow=(0, 0, 0, 160), offset=3):
    x, y = pos
    draw.text((x + offset, y + offset), text, font=font, fill=shadow)
    draw.text((x, y), text, font=font, fill=fill)


def main():
    bg_path, title, label, out_path = sys.argv[1:5]

    base = Image.open(bg_path).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, int(255 * 0.5)))
    card = Image.alpha_composite(base, overlay)
    draw = ImageDraw.Draw(card)

    title_size = round(base.height * 0.128)  # ~92px at 720p
    label_size = round(base.height * 0.044)  # ~32px at 720p

    title_font = ImageFont.truetype(TITLE_FONT, title_size)
    label_font = ImageFont.truetype(LABEL_FONT, label_size)

    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (card.width - tw) / 2 - bbox[0]
    ty = card.height / 2 - th - 10
    shadow_text(draw, (tx, ty), title, title_font, (255, 255, 255, 255))

    spaced_label = " ".join(list(label))
    bbox2 = draw.textbbox((0, 0), spaced_label, font=label_font)
    lw = bbox2[2] - bbox2[0]
    lx = (card.width - lw) / 2 - bbox2[0]
    ly = ty + th + 34
    shadow_text(draw, (lx, ly), spaced_label, label_font, (255, 255, 255, 220), offset=2)

    rule_w = 90
    draw.line(
        [(card.width / 2 - rule_w / 2, ty + th + 18), (card.width / 2 + rule_w / 2, ty + th + 18)],
        fill=(255, 255, 255, 180),
        width=2,
    )

    card.convert("RGB").save(out_path)
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
