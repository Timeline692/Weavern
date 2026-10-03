"""Generate the Weavern application icons from one brand design."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "resources"
SIZE = 1024
INK = "#10212b"
PAPER = "#fff9ec"
RUBY = "#b92843"
GOLD = "#d9a855"


def find_font() -> Path:
    candidates = (
        Path("C:/Windows/Fonts/msyhbd.ttc"),
        Path("C:/Windows/Fonts/simsunb.ttf"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("A Chinese display font is required to regenerate the icons")


def main() -> None:
    RESOURCES.mkdir(exist_ok=True)
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 24, SIZE - 24, SIZE - 24), radius=210, fill=INK)
    draw.rounded_rectangle((146, 103, SIZE - 146, 122), radius=9, fill=RUBY)

    font = ImageFont.truetype(str(find_font()), 670)
    box = draw.textbbox((0, 0), "织", font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    draw.text(((SIZE - width) / 2 - box[0], (SIZE - height) / 2 - box[1] - 2), "织", font=font, fill=PAPER)
    draw.ellipse((866, 843, 912, 889), fill=GOLD)

    image.save(RESOURCES / "icon.png", optimize=True)
    image.save(
        RESOURCES / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
