from PIL import Image, ImageDraw, ImageFilter, ImageFont  # type: ignore[reportMissingImports]
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "newsroom-share.png"
W, H = 1200, 630
random.seed(7)

navy = (15, 30, 53)
charcoal = (26, 32, 44)
slate = (74, 127, 165)
offwhite = (246, 243, 237)
cream = (255, 252, 245)
cyan = (100, 210, 255)
amber = (255, 188, 92)
green = (74, 222, 128)

img = Image.new("RGB", (W, H), navy)
pix = img.load()
# deep editorial gradient
for y in range(H):
    for x in range(W):
        dx = x / W
        dy = y / H
        r = int(10 + 18 * dx + 8 * (1 - dy))
        g = int(20 + 34 * dx + 12 * (1 - dy))
        b = int(38 + 58 * dx + 16 * (1 - dy))
        pix[x, y] = (r, g, b)

d = ImageDraw.Draw(img, "RGBA")

# grid and scanline field
for x in range(-80, W + 80, 44):
    d.line([(x, 0), (x + 220, H)], fill=(120, 180, 220, 26), width=1)
for y in range(34, H, 44):
    d.line([(0, y), (W, y)], fill=(120, 180, 220, 18), width=1)
for y in range(0, H, 3):
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 5), width=1)

# newsroom card
card = (58, 58, 1142, 570)
d.rounded_rectangle(card, radius=42, fill=(255, 255, 255, 22), outline=(255, 255, 255, 72), width=2)
d.rounded_rectangle((82, 88, 1118, 546), radius=28, outline=(255, 255, 255, 32), width=1)

# glowing orbs
for cx, cy, color, radius in [
    (930, 110, cyan, 170),
    (1050, 480, amber, 150),
    (190, 480, slate, 190),
]:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer, "RGBA")
    for r in range(radius, 0, -4):
        alpha = int(54 * (1 - r / radius) ** 1.7)
        ld.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    d = ImageDraw.Draw(img, "RGBA")

# right-side signal panel
panel = (760, 130, 1070, 492)
d.rounded_rectangle(panel, radius=28, fill=(6, 14, 28, 150), outline=(255, 255, 255, 56), width=2)
# mini top controls
for i, color in enumerate([amber, green, cyan]):
    d.ellipse((790 + i * 26, 160, 804 + i * 26, 174), fill=(*color, 220))

# AI/energy signal graph
points = []
for i in range(15):
    x = 858 + i * 12
    y = 325 + math.sin(i * .9) * 48 + random.randint(-15, 15)
    points.append((x, y))
for a, b in zip(points, points[1:]):
    d.line([a, b], fill=(*cyan, 210), width=4)
for x, y in points:
    d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(*cyan, 230), outline=(255, 255, 255, 160), width=1)

# lightning bolt
bolt = [(1000, 226), (944, 335), (995, 335), (948, 448), (1050, 298), (994, 298)]
d.polygon(bolt, fill=(*amber, 230))
d.line(bolt + [bolt[0]], fill=(255, 255, 255, 95), width=2)

# text fonts
sans_bold = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
sans = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
mono_bold = "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"
font_kicker = ImageFont.truetype(mono_bold, 25)
font_title = ImageFont.truetype(sans_bold, 86)
font_title2 = ImageFont.truetype(sans_bold, 78)
font_body = ImageFont.truetype(sans, 28)
font_chip = ImageFont.truetype(mono_bold, 21)
font_small = ImageFont.truetype(mono_bold, 16)

# badge
d.rounded_rectangle((112, 120, 440, 164), radius=22, fill=(255, 255, 255, 225))
d.text((136, 129), "DUSTIN COLE NEWSROOM", font=font_kicker, fill=navy)

# title
d.text((112, 202), "AI + ENERGY", font=font_title, fill=cream)
d.text((112, 292), "SIGNAL BRIEF", font=font_title2, fill=cream)

# underline accent
d.rounded_rectangle((114, 392, 520, 402), radius=5, fill=(*cyan, 230))
d.rounded_rectangle((534, 392, 680, 402), radius=5, fill=(*amber, 230))

# body text
body = "A custom daily read on models, chips, power, markets, and work automation — filtered for useful signal."
# manual wrap
lines = ["A custom daily read on models, chips,", "power, markets, and work automation —", "filtered for useful signal."]
for i, line in enumerate(lines):
    d.text((114, 422 + i * 34), line, font=font_body, fill=(234, 242, 249, 225))

# chips
chips = [("AI", cyan), ("ENERGY", amber), ("WORK", green), ("SOURCED", offwhite)]
x = 112
for label, color in chips:
    tw = d.textlength(label, font=font_chip)
    d.rounded_rectangle((x, 538, x + tw + 34, 576), radius=19, fill=(*color, 38), outline=(*color, 170), width=1)
    d.text((x + 17, 546), label, font=font_chip, fill=(*color, 240) if color != offwhite else (246, 243, 237, 235))
    x += int(tw + 48)

# subtle source marks in panel, kept away from graph labels
for i, label in enumerate(["MODELS", "CHIPS", "POWER", "TOOLS"]):
    y = 207 + i * 55
    d.text((800, y), label, font=font_small, fill=(220, 235, 245, 145))
    d.rounded_rectangle((904, y + 5, 1030 - i * 20, y + 17), radius=6, fill=(255, 255, 255, 34))

# final polish
img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=3))
OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "PNG", optimize=True)
print(OUT)
