"""
Process and generate all production brand assets for Campus Relay.
Extracts the glowing Shield Emblem from the master banner and generates:
- docs/assets/app-icon.png & app-icon.jpg (1024x1024)
- docs/assets/campus-relay-banner.png (1920x1072)
- docs/assets/social-preview.png (1200x630 OpenGraph & 1280x720)
- frontend/public/social-preview.png (1200x630 OpenGraph)
- frontend/public/icons/icon-512.png (512x512)
- frontend/public/icons/icon-512-maskable.png (512x512 with safe padding)
- frontend/public/icons/icon-192.png (192x192)
- frontend/public/icons/apple-touch-icon.png (180x180)
- frontend/public/favicon.ico (multi-resolution 16, 32, 48, 64)
"""

import os
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageEnhance, ImageDraw

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_ASSETS = ROOT / "docs" / "assets"
FRONTEND_PUBLIC = ROOT / "frontend" / "public"
FRONTEND_ICONS = FRONTEND_PUBLIC / "icons"

BRAIN_DIR = Path(r"C:\Users\Shuvransu\.gemini\antigravity-ide\brain\71718fa7-82a1-4442-9ff9-da51fdf82d0e")
RAW_BANNER = BRAIN_DIR / "campus_relay_banner_1791647735492.jpg"

def generate_shield_master_icon(banner_img: Image.Image) -> Image.Image:
    """Extracts the central shield emblem from the master banner and produces a sleek 1024x1024 squircle icon."""
    # Exact centered shield crop capturing full crest, antenna, side relay loops and bottom V-tip
    crop = banner_img.crop((563, 78, 813, 328)).convert('RGBA')

    # Upscale crop to 1024x1024 with Lanczos antialiasing and enhancement
    master = crop.resize((1024, 1024), Image.Resampling.LANCZOS)
    master = ImageEnhance.Sharpness(master).enhance(1.4)
    master = ImageEnhance.Contrast(master).enhance(1.08)

    # Squircle mask for native app icon shape
    mask = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 1024, 1024], radius=224, fill=255)

    out = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    out.paste(master, (0, 0), mask)

    # High-tech neon rim borders along the squircle edge
    border = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border)
    b_draw.rounded_rectangle([12, 12, 1012, 1012], radius=216, outline=(0, 242, 254, 180), width=6)
    b_draw.rounded_rectangle([18, 18, 1006, 1006], radius=210, outline=(2, 132, 199, 120), width=3)
    out.alpha_composite(border)
    return out

def main():
    print(f"Loading banner from: {RAW_BANNER}")
    assert RAW_BANNER.exists(), f"Missing banner file: {RAW_BANNER}"

    DOCS_ASSETS.mkdir(parents=True, exist_ok=True)
    FRONTEND_ICONS.mkdir(parents=True, exist_ok=True)

    banner_img = Image.open(RAW_BANNER).convert("RGB")

    # 1. Generate High-Res Repository Banner (1920x1072)
    target_banner = banner_img.resize((1920, 1072), Image.Resampling.LANCZOS)
    banner_png_path = DOCS_ASSETS / "campus-relay-banner.png"
    target_banner.save(banner_png_path, format="PNG", optimize=True)
    print(f"Saved banner: {banner_png_path} ({target_banner.size})")

    # 2. Generate Social Preview / Open Graph (1200x630)
    banner_w, banner_h = banner_img.size
    og_aspect = 1200 / 630
    src_aspect = banner_w / banner_h
    if src_aspect > og_aspect:
        new_w = int(banner_h * og_aspect)
        offset = (banner_w - new_w) // 2
        og_cropped = banner_img.crop((offset, 0, offset + new_w, banner_h))
    else:
        new_h = int(banner_w / og_aspect)
        offset = (banner_h - new_h) // 2
        og_cropped = banner_img.crop((0, offset, banner_w, offset + new_h))
    
    og_img = og_cropped.resize((1200, 630), Image.Resampling.LANCZOS)
    docs_social = DOCS_ASSETS / "social-preview.png"
    frontend_social = FRONTEND_PUBLIC / "social-preview.png"
    og_img.save(docs_social, format="PNG", optimize=True)
    og_img.save(frontend_social, format="PNG", optimize=True)
    print(f"Saved social previews: {docs_social}, {frontend_social}")

    # 3. Generate Shield Master Icon (1024x1024) from Banner Emblem
    app_icon_1024 = generate_shield_master_icon(banner_img)
    docs_icon_png = DOCS_ASSETS / "app-icon.png"
    docs_icon_jpg = DOCS_ASSETS / "app-icon.jpg"
    app_icon_1024.save(docs_icon_png, format="PNG", optimize=True)
    app_icon_1024.convert("RGB").save(docs_icon_jpg, format="JPEG", quality=95, optimize=True)
    print(f"Saved master app icon: {docs_icon_png} ({app_icon_1024.size})")

    # 4. Generate PWA Icons
    # 512x512
    icon_512 = app_icon_1024.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512_path = FRONTEND_ICONS / "icon-512.png"
    icon_512.save(icon_512_path, format="PNG", optimize=True)
    print(f"Saved: {icon_512_path}")

    # 512x512 maskable (with safe margin for Android adaptive icon masks)
    bg_color = banner_img.getpixel((688, 70))[:3]
    maskable_canvas = Image.new("RGBA", (512, 512), bg_color + (255,))
    scaled_inner = app_icon_1024.resize((416, 416), Image.Resampling.LANCZOS)
    maskable_canvas.paste(scaled_inner, (48, 48), scaled_inner if scaled_inner.mode == 'RGBA' else None)
    maskable_path = FRONTEND_ICONS / "icon-512-maskable.png"
    maskable_canvas.save(maskable_path, format="PNG", optimize=True)
    print(f"Saved: {maskable_path}")

    # 192x192
    icon_192 = app_icon_1024.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192_path = FRONTEND_ICONS / "icon-192.png"
    icon_192.save(icon_192_path, format="PNG", optimize=True)
    print(f"Saved: {icon_192_path}")

    # Apple touch icon (180x180)
    apple_icon = app_icon_1024.resize((180, 180), Image.Resampling.LANCZOS)
    apple_path = FRONTEND_ICONS / "apple-touch-icon.png"
    apple_icon.save(apple_path, format="PNG", optimize=True)
    print(f"Saved: {apple_path}")

    # Favicon.ico (multi-resolution 16, 32, 48, 64)
    fav_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    favicon_path = FRONTEND_PUBLIC / "favicon.ico"
    app_icon_1024.save(favicon_path, format="ICO", sizes=fav_sizes)
    print(f"Saved: {favicon_path} ({favicon_path.stat().st_size} bytes)")

    print("\nAll brand assets successfully updated to Banner Shield Emblem!")

if __name__ == "__main__":
    main()
