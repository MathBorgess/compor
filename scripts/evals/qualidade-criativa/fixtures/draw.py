"""Draw the versioned synthetic poster controls. Requires Pillow and Georgia on macOS."""
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
FONT = Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf")
BLUE = "#183c47"
OCHRE = "#9d5c17"
CREAM = "#f6ecd9"


def text(draw, words, y, size):
    draw.text((360, y), words, font=ImageFont.truetype(FONT, size), fill=BLUE, anchor="mt")


def print_pot(draw, broken):
    draw.rounded_rectangle((184, 332, 536, 678), radius=57, fill=BLUE)
    draw.rounded_rectangle((214, 281, 506, 359), radius=18, fill=OCHRE)
    draw.line((230, 347, 490, 347), fill="#c1884b", width=5)
    if broken:
        # The highlighted upper sides confront two incompatible rims fused through the jar body.
        draw.rounded_rectangle((277, 493, 555, 560), radius=15, fill=OCHRE)
        draw.polygon(((295, 496), (511, 500), (543, 650), (492, 680), (388, 638)), fill="#355e68")
        draw.arc((224, 371, 495, 629), 9, 216, fill=CREAM, width=14)
        draw.line(((246, 416), (420, 482), (423, 589), (533, 648)), fill=CREAM, width=9)
        return
    # The fourteen fruits read as dates on a paper calendar when the two rows align.
    for index in range(14):
        x = 222 + (index % 7) * 46
        y = 467 + (index // 7) * 63
        draw.ellipse((x - 10, y - 16, x + 10, y + 16), fill=CREAM)


def tidy_pot(draw):
    draw.rounded_rectangle((128, 258, 592, 718), 32, fill="#e7d8be", outline="#c7a97f", width=2)
    draw.rounded_rectangle((232, 391, 488, 615), 60, fill="#427181", outline=BLUE, width=8)
    draw.rounded_rectangle((247, 352, 473, 418), 17, fill=OCHRE)
    draw.rounded_rectangle((267, 442, 288, 553), 10, fill="#7194a0")
    for x, y in [(191, 353), (516, 460), (188, 577), (530, 612)]:
        draw.polygon([(x, y - 19), (x + 6, y - 5), (x + 19, y), (x + 6, y + 5),
                      (x, y + 19), (x - 6, y + 5), (x - 19, y), (x - 6, y - 5)], fill="#c58a4d")


def poster(filename, kind):
    image = Image.new("RGB", (720, 900), CREAM)
    draw = ImageDraw.Draw(image)
    text(draw, "Feira de compotas", 113, 53)
    if kind == "generic":
        tidy_pot(draw)
    else:
        print_pot(draw, broken=kind == "broken")
        rng = Random(824)
        for _ in range(8200):
            x, y = rng.randrange(720), rng.randrange(900)
            red, green, blue = image.getpixel((x, y))
            tint = rng.randint(-19, 14)
            draw.point((x, y), fill=tuple(max(0, min(255, value + tint)) for value in (red, green, blue)))
    text(draw, "14 de agosfo" if kind == "typo" else "14 de agosto", 756, 47)
    image.save(OUT / filename, optimize=True)


def source_references():
    size = (360, 450)
    palette = Image.new("RGB", size, "#38263d")
    draw = ImageDraw.Draw(palette)
    draw.rectangle((30, 60, 294, 380), fill="#f0e3cf")
    draw.rectangle((170, 150, 325, 295), fill="#e66435")
    draw.rectangle((42, 77, 132, 344), fill="#38263d")
    palette.save(OUT / "encadernacao-paleta.png", optimize=True)

    crop = Image.new("RGB", size, "#abc6dd")
    draw = ImageDraw.Draw(crop)
    draw.polygon([(95, 450), (205, 194), (360, 164), (360, 450)], fill="#3a674e")
    draw.polygon([(143, 450), (219, 249), (360, 224), (360, 450)], fill="#8cb586")
    draw.line([(210, 452), (259, 277), (360, 256)], fill="#284c38", width=7)
    crop.save(OUT / "encadernacao-recorte.png", optimize=True)


if __name__ == "__main__":
    poster("feira-impressa.png", "print")
    poster("feira-generica.png", "generic")
    poster("feira-data-corrompida.png", "typo")
    poster("feira-pote-fundido.png", "broken")
    source_references()
