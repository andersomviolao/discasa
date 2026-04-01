from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow is required to run this script.")
    print("Install it with:")
    print("  pip install pillow")
    sys.exit(1)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ART_DIR = PROJECT_ROOT / "art"
SOURCE_IMAGE = ART_DIR / "Discasa-icon.png"

ASSETS_DIR = PROJECT_ROOT / "apps" / "desktop" / "src" / "assets"
TAURI_ICONS_DIR = PROJECT_ROOT / "apps" / "desktop" / "src-tauri" / "icons"
TAURI_TARGET_DIR = PROJECT_ROOT / "apps" / "desktop" / "src-tauri" / "target"


PNG_OUTPUTS = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "app-icon.png": 512,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def require_source() -> None:
    if not SOURCE_IMAGE.exists():
        print(f"Source image not found: {SOURCE_IMAGE}")
        sys.exit(1)


def ensure_directories() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    TAURI_ICONS_DIR.mkdir(parents=True, exist_ok=True)


def load_source() -> Image.Image:
    return Image.open(SOURCE_IMAGE).convert("RGBA")


def resize_contain(image: Image.Image, size: int) -> Image.Image:
    width, height = image.size
    scale = min(size / width, size / height)
    new_width = max(1, round(width * scale))
    new_height = max(1, round(height * scale))

    resized = image.resize((new_width, new_height), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    offset_x = (size - new_width) // 2
    offset_y = (size - new_height) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)

    return canvas


def generate_pngs(source: Image.Image) -> None:
    for filename, size in PNG_OUTPUTS.items():
        output_path = TAURI_ICONS_DIR / filename
        icon = resize_contain(source, size)
        icon.save(output_path, format="PNG")
        print(f"Created: {output_path}")


def generate_ico(source: Image.Image) -> None:
    output_path = TAURI_ICONS_DIR / "icon.ico"
    icon_256 = resize_contain(source, 256)
    icon_256.save(output_path, format="ICO", sizes=ICO_SIZES)
    print(f"Created: {output_path}")


def generate_frontend_asset() -> None:
    output_path = ASSETS_DIR / "discasa-logo.png"
    shutil.copy2(SOURCE_IMAGE, output_path)
    print(f"Created: {output_path}")


def clear_tauri_target() -> None:
    if not TAURI_TARGET_DIR.exists():
        print(f"Skipped target cleanup: {TAURI_TARGET_DIR} does not exist.")
        return

    try:
        shutil.rmtree(TAURI_TARGET_DIR)
        print(f"Deleted: {TAURI_TARGET_DIR}")
    except PermissionError:
        print("")
        print("Could not delete the Tauri target folder.")
        print("Close Discasa and any running Tauri terminal first, then run the script again.")
        sys.exit(1)


def main() -> None:
    require_source()
    ensure_directories()

    source = load_source()

    generate_frontend_asset()
    generate_pngs(source)
    generate_ico(source)
    clear_tauri_target()

    print("")
    print("Done.")
    print(f"Source: {SOURCE_IMAGE}")
    print(f"Assets: {ASSETS_DIR}")
    print(f"Tauri icons: {TAURI_ICONS_DIR}")


if __name__ == "__main__":
    main()
