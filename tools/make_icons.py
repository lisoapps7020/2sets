"""Genera assets/icons/icon-192.png e icon-512.png con Pillow. Uso: python tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "icons")
SAND, TERRACOTTA, STRONG = (237, 230, 222), (137, 91, 62), (174, 106, 71)


def font(size):
    for name in ("georgiab.ttf", "georgia.ttf", "timesbd.ttf", "times.ttf"):
        p = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make(size):
    s = size / 512
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(112 * s), fill=SAND)
    d.rounded_rectangle((96 * s, 118 * s, 416 * s, 148 * s), radius=int(6 * s), fill=TERRACOTTA)
    d.rounded_rectangle((112 * s, 364 * s, 400 * s, 394 * s), radius=int(6 * s), fill=TERRACOTTA)
    d.rectangle((132 * s, 148 * s, 172 * s, 364 * s), fill=TERRACOTTA)
    d.rectangle((340 * s, 148 * s, 380 * s, 364 * s), fill=TERRACOTTA)
    f = font(int(190 * s))
    d.text((256 * s, 258 * s), "II", font=f, fill=STRONG, anchor="mm")
    im.save(os.path.join(OUT, f"icon-{size}.png"))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n in (192, 512):
        make(n)
    print("ok")
