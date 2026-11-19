import math
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_GIF = ROOT / "build" / "installer-loading.gif"
OUT_PREVIEW = ROOT / "build" / "installer-preview.png"

# Logical size -> 2x supersampled for crisp anti-aliasing
W, H = 420, 270
SS = 2
SW, SH = W * SS, H * SS
FRAMES = 72
FPS = 30


def load_font(size: int, bold: bool = False):
    candidates = (
        [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\seguisb.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
        if bold
        else [
            r"C:\Windows\Fonts\seguisb.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    )
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


FONT_TITLE = load_font(22 * SS, bold=True)
FONT_SUB = load_font(12 * SS, bold=False)
FONT_BADGE = load_font(9 * SS, bold=True)


def draw_radial_glow(canvas: Image.Image, cx: float, cy: float, radius: float, rgb: tuple[int, int, int], max_alpha: int):
    r = int(radius)
    glow = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    steps = 18
    for i in range(steps, 0, -1):
        frac = i / steps
        a = int(max_alpha * ((1.0 - frac) ** 1.85))
        if a <= 0:
            continue
        rr = int(r * frac)
        d.ellipse((r - rr, r - rr, r + rr, r + rr), fill=(rgb[0], rgb[1], rgb[2], a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=r * 0.22))
    canvas.alpha_composite(glow, (int(cx - r), int(cy - r)))


def ease_in_out_cubic(x: float) -> float:
    return 4 * x * x * x if x < 0.5 else 1 - ((-2 * x + 2) ** 3) / 2


def render_frame(idx: int) -> Image.Image:
    t = idx / FRAMES  # [0, 1)
    tau = t * 2.0 * math.pi

    # Base obsidian dark-glass canvas
    img = Image.new("RGBA", (SW, SH), (10, 12, 19, 255))

    # Subtle vertical gradient
    grad = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(0, SH, 4):
        p = y / SH
        r = int(17 * (1 - p) + 8 * p)
        g = int(21 * (1 - p) + 10 * p)
        b = int(32 * (1 - p) + 16 * p)
        gd.rectangle((0, y, SW, y + 4), fill=(r, g, b, 255))
    img = Image.alpha_composite(img, grad)

    # Ambient Apple Intelligence aurora blobs
    draw_radial_glow(
        img,
        cx=SW * 0.50 + math.cos(tau) * 42 * SS,
        cy=SH * 0.34 + math.sin(tau) * 16 * SS,
        radius=145 * SS,
        rgb=(56, 189, 248),
        max_alpha=36,
    )
    draw_radial_glow(
        img,
        cx=SW * 0.50 - math.cos(tau) * 38 * SS,
        cy=SH * 0.38 - math.sin(tau) * 14 * SS,
        radius=125 * SS,
        rgb=(52, 211, 153),
        max_alpha=24,
    )

    # Inner crisp specular border (properly alpha-composited)
    border_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border_layer)
    bd.rectangle((1, 1, SW - 2, SH - 2), outline=(255, 255, 255, 32), width=2)
    bd.line((48 * SS, 2, SW - 48 * SS, 2), fill=(255, 255, 255, 72), width=2)
    img = Image.alpha_composite(img, border_layer)

    # Center coordinates for floating Bedo orb
    cx = SW * 0.5
    float_y = math.sin(tau) * 4.5 * SS
    cy = SH * 0.365 + float_y

    # Two concentric expanding pulse halo rings
    ring_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring_layer)
    for phase_offset, rgb in ((0.0, (125, 211, 252)), (0.5, (110, 231, 183))):
        p = (t + phase_offset) % 1.0
        radius = (38 + p * 36) * SS
        alpha = int(math.sin(p * math.pi) * 82)
        if alpha > 2:
            rd.ellipse(
                (cx - radius, cy - radius, cx + radius, cy + radius),
                outline=(rgb[0], rgb[1], rgb[2], alpha),
                width=2,
            )
    img = Image.alpha_composite(img, ring_layer)

    # Soft shadow under Bedo squircle
    shadow = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sq_half = 36 * SS
    sd.rounded_rectangle(
        (cx - sq_half, cy - sq_half + 10 * SS, cx + sq_half, cy + sq_half + 10 * SS),
        radius=22 * SS,
        fill=(0, 0, 0, 125),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=14 * SS))
    img = Image.alpha_composite(img, shadow)

    # Glass Bedo squircle
    orb = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    box = (cx - sq_half, cy - sq_half, cx + sq_half, cy + sq_half)
    od.rounded_rectangle(box, radius=22 * SS, fill=(18, 23, 35, 240), outline=(255, 255, 255, 56), width=2)
    # Subtle top glass sheen inside squircle
    od.rounded_rectangle(
        (cx - sq_half + 3 * SS, cy - sq_half + 2 * SS, cx + sq_half - 3 * SS, cy - 2 * SS),
        radius=18 * SS,
        fill=(255, 255, 255, 16),
    )
    img = Image.alpha_composite(img, orb)

    # Living Bedo Eyes (blink smoothly around t = 0.62..0.72)
    blink = 1.0
    if 0.62 <= t <= 0.72:
        bp = (t - 0.62) / 0.10
        blink = max(0.14, abs(math.cos(bp * math.pi)))

    eye_w = 8.5 * SS
    eye_h = 16.5 * SS * blink
    eye_gap = 12.0 * SS
    eye_glow = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    egd = ImageDraw.Draw(eye_glow)
    for sign in (-1, 1):
        ex = cx + sign * eye_gap
        ey = cy
        egd.rounded_rectangle(
            (ex - eye_w / 2 - 2 * SS, ey - eye_h / 2 - 2 * SS, ex + eye_w / 2 + 2 * SS, ey + eye_h / 2 + 2 * SS),
            radius=eye_w,
            fill=(125, 211, 252, 130),
        )
    eye_glow = eye_glow.filter(ImageFilter.GaussianBlur(radius=5 * SS))
    img = Image.alpha_composite(img, eye_glow)

    ed = ImageDraw.Draw(img)
    for sign in (-1, 1):
        ex = cx + sign * eye_gap
        ey = cy
        ed.rounded_rectangle(
            (ex - eye_w / 2, ey - eye_h / 2, ex + eye_w / 2, ey + eye_h / 2),
            radius=min(eye_w, eye_h) / 2,
            fill=(255, 255, 255, 255),
        )

    # Typography (properly alpha-composited)
    txt_layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt_layer)
    title = "Bedo"
    tb = td.textbbox((0, 0), title, font=FONT_TITLE)
    tw = tb[2] - tb[0]
    td.text((cx - tw / 2, SH * 0.595), title, font=FONT_TITLE, fill=(248, 250, 252, 255))

    sub = "Dinamik Adan hazırlanıyor..."
    sb = td.textbbox((0, 0), sub, font=FONT_SUB)
    sw_txt = sb[2] - sb[0]
    sub_alpha = int(165 + 48 * math.sin(tau))
    td.text((cx - sw_txt / 2, SH * 0.715), sub, font=FONT_SUB, fill=(186, 198, 218, sub_alpha))

    # Apple-style sleek indeterminate progress track (translucent dark-glass)
    bar_w = 210 * SS
    bar_h = 4.5 * SS
    bar_x = cx - bar_w / 2
    bar_y = SH * 0.845
    td.rounded_rectangle(
        (bar_x, bar_y, bar_x + bar_w, bar_y + bar_h),
        radius=bar_h / 2,
        fill=(255, 255, 255, 34),
    )
    img = Image.alpha_composite(img, txt_layer)

    # Smooth gliding luminous pill (ping-pong or continuous wrap)
    # Continuous wrap from left to right with smooth width breathing
    eased = ease_in_out_cubic(t)
    pill_w = (54 + 26 * math.sin(t * math.pi)) * SS
    start_x = bar_x - pill_w * 0.35 + eased * (bar_w - pill_w * 0.3)
    end_x = start_x + pill_w
    vis_x1 = max(bar_x, start_x)
    vis_x2 = min(bar_x + bar_w, end_x)
    if vis_x2 > vis_x1 + 2:
        # Soft glow on pill
        pg = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        pgd = ImageDraw.Draw(pg)
        pgd.rounded_rectangle(
            (vis_x1, bar_y - 2 * SS, vis_x2, bar_y + bar_h + 2 * SS),
            radius=bar_h,
            fill=(56, 189, 248, 120),
        )
        pg = pg.filter(ImageFilter.GaussianBlur(radius=4 * SS))
        img = Image.alpha_composite(img, pg)
        td = ImageDraw.Draw(img)
        td.rounded_rectangle(
            (vis_x1, bar_y, vis_x2, bar_y + bar_h),
            radius=bar_h / 2,
            fill=(240, 249, 255, 255),
        )

    # Downsample 2x -> 1x with Lanczos for razor-sharp anti-aliasing
    return img.resize((W, H), Image.Resampling.LANCZOS).convert("RGB")


def main():
    OUT_GIF.parent.mkdir(parents=True, exist_ok=True)
    frames = [render_frame(i) for i in range(FRAMES)]
    frames[12].save(OUT_PREVIEW)

    # Convert to adaptive palette for smooth gradients & crisp edges
    palette_frames = [
        f.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        for f in frames
    ]
    palette_frames[0].save(
        OUT_GIF,
        save_all=True,
        append_images=palette_frames[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
    )
    print(f"Generated {OUT_GIF} ({OUT_GIF.stat().st_size / 1024:.1f} KB, {FRAMES} frames @ {FPS}fps)")


if __name__ == "__main__":
    main()
