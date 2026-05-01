from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow is required to run this script.")
    print("Install it with:")
    print("  pip install pillow")
    if os.name == "nt":
        input("Press Enter to close this window...")
    sys.exit(1)

if os.name == "nt":
    import msvcrt


DEFAULT_SIZE = 256
OUTPUT_FILENAME = "discasa-default-avatar.png"


def wait_before_exit(exit_code: int = 0) -> None:
    if os.name == "nt":
        print("")
        input("Press Enter to close this window...")
    sys.exit(exit_code)


def resolve_repo_root() -> Path:
    script_dir = Path(__file__).resolve().parent

    for candidate in (script_dir, *script_dir.parents):
        app_manifest = candidate / "discasa_app" / "package.json"
        bot_manifest = candidate / "discasa_bot" / "package.json"
        if app_manifest.exists() and bot_manifest.exists():
            return candidate

    return script_dir.parents[1]


REPO_ROOT = resolve_repo_root()
ART_DIR = REPO_ROOT / "art"
SOURCE_IMAGE = ART_DIR / "app" / "app-default-avatar-source.png"
ASSETS_DIR = REPO_ROOT / "discasa_app" / "apps" / "desktop" / "src" / "assets"
OUTPUT_IMAGE = ASSETS_DIR / OUTPUT_FILENAME


def prompt_yes_no(message: str) -> bool:
    prompt = f"{message} [Y,N]?"

    if os.name == "nt":
        print(prompt, end="", flush=True)
        while True:
            key = msvcrt.getwch()
            if not key:
                continue

            lowered = key.lower()
            if lowered == "y":
                print("Y")
                return True
            if lowered == "n":
                print("N")
                return False

    while True:
        answer = input(prompt).strip().lower()
        if answer in {"y", "yes"}:
            return True
        if answer in {"n", "no"}:
            return False


def require_source() -> None:
    if SOURCE_IMAGE.exists():
        return

    print(f"Source image not found: {SOURCE_IMAGE}")
    wait_before_exit(1)


def ensure_directories() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)


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


def generate_avatar_asset(source: Image.Image) -> None:
    avatar = resize_contain(source, DEFAULT_SIZE)
    avatar.save(OUTPUT_IMAGE, format="PNG")
    print(f"Created: {OUTPUT_IMAGE}")


def main() -> None:
    require_source()
    ensure_directories()

    print("==========================================")
    print("Discasa - Generate App Default Avatar")
    print("==========================================")
    print("")
    print(f"Repository root: {REPO_ROOT}")
    print(f"Source image: {SOURCE_IMAGE}")
    print(f"Output image: {OUTPUT_IMAGE}")
    print("")
    print("This will:")
    print("- Resize the transparent avatar artwork to 256x256")
    print("- Preserve the transparent border around the avatar")
    print("- Save the frontend asset used above the solid avatar background")
    print("")

    if not prompt_yes_no("Continue"):
        print("Cancelled.")
        return

    source = load_source()

    print("")
    print("Generating asset...")
    print("")

    generate_avatar_asset(source)

    print("")
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("")
        print("Cancelled by user.")
        wait_before_exit(1)
