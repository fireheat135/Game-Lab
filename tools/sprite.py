#!/usr/bin/env python3
"""Turn a Codex-generated image (sprite on solid black) into a small transparent PNG.
Usage: python3 tools/sprite.py art/<name>-src.png public/assets/<name>.png [size=64] [threshold=40]

Only dark pixels CONNECTED TO THE IMAGE EDGE become transparent (flood fill from the border),
so dark outlines and details inside the sprite are kept. Tests: npm run test:tools"""
import sys

from PIL import Image, ImageChops, ImageDraw

src, out = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 64
th = int(sys.argv[4]) if len(sys.argv) > 4 else 40
img = Image.open(src).convert("RGBA")

r, g, b, a = img.split()
bright = ImageChops.lighter(ImageChops.lighter(r, g), b)       # per-pixel max(r, g, b)
mask = bright.point(lambda v: 255 if v < th else 0)             # 255 = dark candidate
w, h = mask.size
border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
for xy in border:                                                # mark dark regions touching the edge
    if mask.getpixel(xy) == 255:
        ImageDraw.floodfill(mask, xy, 128)
background = mask.point(lambda v: 255 if v == 128 else 0)
img.putalpha(ImageChops.subtract(a, background))                # background -> alpha 0

img = img.crop(img.getbbox())                                    # trim empty margin
side = max(img.size)                                             # pad to square, keep aspect
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
sq.resize((size, size), Image.NEAREST).save(out, optimize=True)
print(out)
