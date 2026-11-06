"""Tests for tools/sprite.py. Run: npm run test:tools (needs Pillow)."""
import os
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

SPRITE = os.path.join(os.path.dirname(__file__), "sprite.py")


def run(src: Image.Image, size: int = 32) -> Image.Image:
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "src.png"), os.path.join(d, "out.png")
        src.save(a)
        subprocess.run([sys.executable, SPRITE, a, b, str(size)], check=True, capture_output=True)
        return Image.open(b).convert("RGBA")


class SpriteTest(unittest.TestCase):
    def make(self) -> Image.Image:
        # 32x32 black background with a white "+" (arms 4px wide, spanning 8..24),
        # and a dark 2x2 detail in the middle of the cross. After trimming, the bbox
        # corners are background (outside the cross) and must become transparent.
        img = Image.new("RGB", (32, 32), (0, 0, 0))
        for i in range(8, 24):
            for j in range(14, 18):
                img.putpixel((i, j), (255, 255, 255))  # horizontal arm
                img.putpixel((j, i), (255, 255, 255))  # vertical arm
        for x in range(15, 17):
            for y in range(15, 17):
                img.putpixel((x, y), (20, 20, 20))
        return img

    def test_background_connected_to_edge_becomes_transparent(self):
        out = run(self.make(), 32)
        self.assertEqual(out.getpixel((0, 0))[3], 0)

    def test_dark_pixels_enclosed_by_sprite_stay_opaque(self):
        out = run(self.make(), 32)  # cross trimmed to 16x16, scaled x2 -> detail at the center
        self.assertEqual(out.getpixel((16, 16))[3], 255)
        self.assertLess(max(out.getpixel((16, 16))[:3]), 40)

    def test_sprite_body_stays_opaque(self):
        out = run(self.make(), 32)
        self.assertEqual(out.getpixel((16, 2)), (255, 255, 255, 255))  # top of the vertical arm


if __name__ == "__main__":
    unittest.main()
