"""Render branded 24-bit NSIS wizard artwork at the required pixel sizes."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build"
SCALE = 4
NAVY = "#10212b"
PAPER = "#f7f5f0"
CREAM = "#fff9ec"
RUBY = "#b92843"
GOLD = "#d9a855"
MUTED = "#aebfc2"
TEAL = "#31515c"


def font_file(bold: bool = False) -> Path:
    paths = (
        (Path("C:/Windows/Fonts/msyhbd.ttc"), Path("C:/Windows/Fonts/msyh.ttc")),
        (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"), Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")),
        (Path("/System/Library/Fonts/STHeiti Medium.ttc"), Path("/System/Library/Fonts/STHeiti Light.ttc")),
    )
    for heavy, regular in paths:
        chosen = heavy if bold else regular
        if chosen.exists():
            return chosen
    raise FileNotFoundError("A Chinese UI font is required to regenerate installer artwork")


def draw_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, color: str, bold: bool = False) -> None:
    draw.text((xy[0] * SCALE, xy[1] * SCALE), value,
              font=ImageFont.truetype(str(font_file(bold)), size * SCALE), fill=color)


def letterspaced(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, color: str, spacing: int = 1) -> None:
    font = ImageFont.truetype(str(font_file(True)), size * SCALE)
    x, y = xy[0] * SCALE, xy[1] * SCALE
    for char in value:
        draw.text((x, y), char, font=font, fill=color)
        x += draw.textlength(char, font=font) + spacing * SCALE


def sidebar(name: str, uninstall: bool = False) -> None:
    width, height = 164, 314
    image = Image.new("RGB", (width * SCALE, height * SCALE), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width * SCALE, 5 * SCALE), fill=RUBY)
    letterspaced(draw, (17, 27), "WEAVERN", 9, GOLD, 1)
    draw_text(draw, (16, 69), "织识", 31, CREAM, True)
    draw.line((17 * SCALE, 119 * SCALE, 147 * SCALE, 119 * SCALE), fill=MUTED, width=1 * SCALE)
    if uninstall:
        draw_text(draw, (17, 136), "卸载向导", 14, CREAM)
        draw_text(draw, (17, 160), "感谢一路相伴。", 10, MUTED)
    else:
        draw_text(draw, (17, 136), "让知识", 15, CREAM)
        draw_text(draw, (17, 159), "各归其位。", 15, CREAM)

    # The fine orbital lines echo the report cover without competing with the controls.
    for inset in (0, 9, 18, 27):
        draw.arc(((29 + inset) * SCALE, (199 + inset) * SCALE,
                  (209 - inset) * SCALE, (380 - inset) * SCALE),
                 start=185, end=316, fill=TEAL, width=1 * SCALE)
    draw.ellipse((123 * SCALE, 237 * SCALE, 132 * SCALE, 246 * SCALE), fill=GOLD)
    draw.line((17 * SCALE, 281 * SCALE, 147 * SCALE, 281 * SCALE), fill=TEAL, width=1 * SCALE)
    letterspaced(draw, (17, 291), "LOCAL KNOWLEDGE", 7, MUTED, 0)

    image.resize((width, height), Image.Resampling.LANCZOS).save(OUTPUT / name, format="BMP")


def header() -> None:
    width, height = 150, 57
    image = Image.new("RGB", (width * SCALE, height * SCALE), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width * SCALE, 3 * SCALE), fill=RUBY)
    draw_text(draw, (11, 11), "织识", 20, NAVY, True)
    letterspaced(draw, (74, 22), "WEAVERN", 8, RUBY, 0)
    draw.line((11 * SCALE, 48 * SCALE, 139 * SCALE, 48 * SCALE), fill="#d6d5cf", width=1 * SCALE)
    draw.ellipse((132 * SCALE, 39 * SCALE, 140 * SCALE, 47 * SCALE), fill=GOLD)
    image.resize((width, height), Image.Resampling.LANCZOS).save(OUTPUT / "installerHeader.bmp", format="BMP")


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    sidebar("installerSidebar.bmp")
    sidebar("uninstallerSidebar.bmp", uninstall=True)
    header()
