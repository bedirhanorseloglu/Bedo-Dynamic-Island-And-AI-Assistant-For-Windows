import math
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

VERSION = sys.argv[1] if len(sys.argv) > 1 else "1.0.12"
OUT_PATH = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("release") / f"bedo-{VERSION}-showcase.gif"

W, H = 680, 360
SS = 2
SW, SH = W * SS, H * SS
FRAMES = 60


def load_font(size: int, bold: bool = False):
    candidates = (
        [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\seguisb.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    )
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


FONT_VER = load_font(12 * SS, bold=True)
FONT_TITLE = load_font(21 * SS, bold=True)
FONT_SUB = load_font(12 * SS, bold=False)
FONT_PILL = load_font(12 * SS, bold=True)
FONT_PILL_SUB = load_font(10 * SS, bold=False)


def ease_out_expo(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 1.0 if x >= 1.0 else 1.0 - pow(2.0, -10.0 * x)


def ease_in_out(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 4 * x * x * x if x < 0.5 else 1 - pow(-2 * x + 2, 3) / 2


def draw_soft_glow(canvas: Image.Image, cx: float, cy: float, rx: float, ry: float, alpha: int):
    layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(255, 255, 255, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=38 * SS))
    canvas.alpha_composite(layer)


def render_frame(idx: int) -> Image.Image:
    t = idx / FRAMES  # 0..1

    # Morph timeline:
    # 0.00..0.18: compact island + ghost OS banner visible
    # 0.18..0.42: island expands smoothly while OS banner dissolves away
    # 0.42..0.82: expanded island steady (with a natural Bedo blink around 0.60)
    # 0.82..1.00: smoothly tucks back to compact island
    if t < 0.18:
        morph = 0.0
        os_alpha = ease_in_out(t / 0.18) * 0.42
    elif t < 0.42:
        p = (t - 0.18) / 0.24
        morph = ease_out_expo(p)
        os_alpha = 0.42 * (1.0 - ease_in_out(p))
    elif t < 0.82:
        morph = 1.0
        os_alpha = 0.0
    else:
        p = (t - 0.82) / 0.18
        morph = 1.0 - ease_in_out(p)
        os_alpha = 0.0

    blink = 1.0
    if 0.58 <= t <= 0.64:
        bp = abs((t - 0.61) / 0.03)
        blink = max(0.15, bp)

    # Obsidian canvas
    img = Image.new("RGBA", (SW, SH), (8, 9, 12, 255))
    draw_soft_glow(img, SW * 0.5, SH * 0.28, 190 * SS, 85 * SS, 16)

    d = ImageDraw.Draw(img)

    # Outer card frame
    pad = 18 * SS
    d.rounded_rectangle(
        (pad, pad, SW - pad, SH - pad),
        radius=22 * SS,
        fill=(14, 15, 20, 255),
        outline=(255, 255, 255, 26),
        width=1 * SS,
    )

    # Simulated monitor viewport inside top half
    vp_left, vp_top, vp_right, vp_bottom = 56 * SS, 42 * SS, SW - 56 * SS, 226 * SS
    d.rounded_rectangle(
        (vp_left, vp_top, vp_right, vp_bottom),
        radius=16 * SS,
        fill=(9, 10, 14, 255),
        outline=(255, 255, 255, 18),
        width=1 * SS,
    )

    # Dynamic Island morphing at top center of viewport
    iw = int((96 + (248 - 96) * morph) * SS)
    ih = int((28 + (48 - 28) * morph) * SS)
    ix0 = (SW - iw) // 2
    iy0 = vp_top + 14 * SS
    ix1 = ix0 + iw
    iy1 = iy0 + ih

    # Subtle island shadow
    shadow = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((ix0, iy0 + 4 * SS, ix1, iy1 + 6 * SS), radius=ih // 2, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=8 * SS))
    img.alpha_composite(shadow)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle(
        (ix0, iy0, ix1, iy1),
        radius=ih // 2,
        fill=(3, 3, 5, 255),
        outline=(255, 255, 255, 42),
        width=1 * SS,
    )

    # Bedo Night body dome + two white glowing eyes inside the Island
    robo_cx = int(ix0 + (iw * 0.5 * (1.0 - morph) + 28 * SS * morph))
    robo_cy = (iy0 + iy1) // 2

    # Subtle Night dome silhouette
    dome_r = int((10 + 3 * morph) * SS)
    d.rounded_rectangle(
        (robo_cx - dome_r - 3 * SS, robo_cy - dome_r, robo_cx + dome_r + 3 * SS, robo_cy + dome_r),
        radius=dome_r,
        fill=(34, 35, 40, 255),
        outline=(255, 255, 255, 22),
        width=1,
    )

    eye_w = int(3.4 * SS)
    eye_h = max(2, int(7.6 * SS * blink))
    eye_gap = int(4.4 * SS)
    for sign in (-1, 1):
        ex = robo_cx + sign * eye_gap
        d.rounded_rectangle(
            (ex - eye_w // 2, robo_cy - eye_h // 2, ex + eye_w // 2, robo_cy + eye_h // 2),
            radius=eye_w // 2,
            fill=(255, 255, 255, 255),
        )

    # Expanded notification text inside Island
    if morph > 0.32:
        txt_alpha = int(255 * min(1.0, (morph - 0.32) / 0.45))
        txt_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        td = ImageDraw.Draw(txt_layer)
        tx = ix0 + 54 * SS
        td.text((tx, robo_cy - 13 * SS), f"Bedo {VERSION}", font=FONT_PILL, fill=(255, 255, 255, txt_alpha))
        td.text(
            (tx, robo_cy + 3 * SS),
            "Sadece Ada'da Bildirim  ·  Island-Only",
            font=FONT_PILL_SUB,
            fill=(185, 188, 198, txt_alpha),
        )
        img.alpha_composite(txt_layer)
        d = ImageDraw.Draw(img)

    # Dissolving duplicate bottom-right Windows popup
    if os_alpha > 0.01:
        oa = int(255 * os_alpha)
        toast_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        od = ImageDraw.Draw(toast_layer)
        tw, th = 128 * SS, 38 * SS
        tx0 = vp_right - tw - 16 * SS
        ty0 = vp_bottom - th - 14 * SS
        od.rounded_rectangle(
            (tx0, ty0, tx0 + tw, ty0 + th),
            radius=8 * SS,
            fill=(255, 255, 255, int(18 * (os_alpha / 0.42))),
            outline=(255, 255, 255, int(45 * (os_alpha / 0.42))),
            width=1 * SS,
        )
        od.rounded_rectangle(
            (tx0 + 10 * SS, ty0 + 11 * SS, tx0 + 26 * SS, ty0 + 27 * SS),
            radius=4 * SS,
            fill=(255, 255, 255, oa),
        )
        od.rounded_rectangle(
            (tx0 + 34 * SS, ty0 + 12 * SS, tx0 + 96 * SS, ty0 + 17 * SS),
            radius=3 * SS,
            fill=(255, 255, 255, oa),
        )
        od.rounded_rectangle(
            (tx0 + 34 * SS, ty0 + 22 * SS, tx0 + 76 * SS, ty0 + 26 * SS),
            radius=3 * SS,
            fill=(255, 255, 255, int(oa * 0.55)),
        )
        img.alpha_composite(toast_layer)
        d = ImageDraw.Draw(img)

    # Minimal bottom Apple-style typography
    ver_txt = f"BEDO {VERSION}"
    vb = d.textbbox((0, 0), ver_txt, font=FONT_VER)
    d.text(((SW - (vb[2] - vb[0])) // 2, 246 * SS), ver_txt, font=FONT_VER, fill=(148, 152, 164, 255))

    headline = "Daha sade, daha akıllı.  ·  Cleaner, smarter."
    hb = d.textbbox((0, 0), headline, font=FONT_TITLE)
    d.text(((SW - (hb[2] - hb[0])) // 2, 268 * SS), headline, font=FONT_TITLE, fill=(255, 255, 255, 255))

    subline = "Sadece Ada'da Bildirim   ·   Chat Studio & Hafıza   ·   Canlı Pil Süresi"
    sb = d.textbbox((0, 0), subline, font=FONT_SUB)
    d.text(((SW - (sb[2] - sb[0])) // 2, 304 * SS), subline, font=FONT_SUB, fill=(142, 146, 158, 255))

    return img.resize((W, H), Image.Resampling.LANCZOS).convert("RGB")


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    frames = [render_frame(i) for i in range(FRAMES)]
    frames[0].save(
        OUT_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=42,
        loop=0,
        optimize=True,
    )
    print(f"Saved showcase GIF: {OUT_PATH} ({OUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
