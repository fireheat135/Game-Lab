#!/usr/bin/env python3
"""Turn a Codex-generated image (sprite on solid black) into a small transparent PNG.
Usage: python3 tools/sprite.py art/<name>-src.png public/assets/<name>.png [size=64] [threshold=40]"""
import sys
from PIL import Image, ImageChops

src, out = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 64
th = int(sys.argv[4]) if len(sys.argv) > 4 else 40
img = Image.open(src).convert("RGBA")
r, g, b, a = img.split()
bright = ImageChops.lighter(ImageChops.lighter(r, g), b)  # per-pixel max(r, g, b)
img.putalpha(ImageChops.multiply(a, bright.point(lambda v: 255 if v >= th else 0)))
img = img.crop(img.getbbox())                       # trim empty margin
side = max(img.size)                                 # pad to square, keep aspect
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
sq.resize((size, size), Image.NEAREST).save(out, optimize=True)
print(out)
