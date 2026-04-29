from __future__ import annotations

import os
import shutil
import subprocess
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


def wait_before_exit(exit_code: int = 0) -> None:
    if os.name == "nt":
        print("")
        input("Press Enter to close this window...")
    sys.exit(exit_code)


def resolve_project_root() -> Path:
    script_dir = Path(__file__).resolve().parent

    if script_dir.name.lower() == "art":
        return script_dir.parent

    if (script_dir / "package.json").exists():
        return script_dir

    if (script_dir.parent / "package.json").exists():
        return script_dir.parent

    return script_dir.parent


PROJECT_ROOT = resolve_project_root()
ART_DIR = PROJECT_ROOT / "art"
SOURCE_IMAGE = ART_DIR / "Discasa-icon.png"

ASSETS_DIR = PROJECT_ROOT / "apps" / "desktop" / "src" / "assets"
TAURI_ICONS_DIR = PROJECT_ROOT / "apps" / "desktop" / "src-tauri" / "icons"

SOFT_RESET_DIRS = [
    PROJECT_ROOT / "node_modules",
    PROJECT_ROOT / "apps" / "desktop" / "node_modules",
    PROJECT_ROOT / "apps" / "desktop" / "dist",
    PROJECT_ROOT / "apps" / "desktop" / "src-tauri" / "target",
    PROJECT_ROOT / "apps" / "server" / "dist",
    PROJECT_ROOT / "apps" / "server" / "node_modules",
    PROJECT_ROOT / "target",
]

SOFT_RESET_FILES = [
    PROJECT_ROOT / "package-lock.json",
]

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


def remove_dir(path: Path) -> None:
    if path.exists():
        print(f"Removing folder: {path}")
        shutil.rmtree(path, ignore_errors=False)
    else:
        print(f"Folder not found, skipping: {path}")


def remove_file(path: Path) -> None:
    if path.exists():
        print(f"Removing file: {path}")
        path.unlink()
    else:
        print(f"File not found, skipping: {path}")


def run_soft_reset() -> None:
    print("")
    print("Running soft reset...")
    print("")

    for directory in SOFT_RESET_DIRS:
        try:
            remove_dir(directory)
        except PermissionError:
            print(f"Could not remove folder: {directory}")
            print("Close Discasa and any running terminal using this project, then run the script again.")
            wait_before_exit(1)

    for file_path in SOFT_RESET_FILES:
        try:
            remove_file(file_path)
        except PermissionError:
            print(f"Could not remove file: {file_path}")
            print("Close any tool that may still be using this project, then run the script again.")
            wait_before_exit(1)

    print("")
    print("Soft reset complete.")


def run_npm_install() -> None:
    print("")
    print("Running npm install...")
    print("")

    try:
        if os.name == "nt":
            result = subprocess.run(
                ["cmd", "/c", "npm", "install"],
                cwd=PROJECT_ROOT,
                check=False,
            )
        else:
            result = subprocess.run(
                ["npm", "install"],
                cwd=PROJECT_ROOT,
                check=False,
            )
    except FileNotFoundError:
        print("npm was not found in PATH.")
        wait_before_exit(1)

    if result.returncode != 0:
        print("")
        print(f"npm install failed with exit code {result.returncode}.")
        wait_before_exit(result.returncode)

    print("")
    print("npm install finished successfully.")


def start_app() -> None:
    print("")
    print("Starting Discasa...")

    if os.name == "nt":
        subprocess.Popen(
            'start "Discasa Server" cmd /k "cd /d ""{}"" && npm run dev:server"'.format(PROJECT_ROOT),
            cwd=PROJECT_ROOT,
            shell=True,
        )
        subprocess.Popen(
            'start "Discasa Desktop" cmd /k "cd /d ""{}"" && npm --workspace @discasa/desktop exec tauri dev"'.format(PROJECT_ROOT),
            cwd=PROJECT_ROOT,
            shell=True,
        )
        return

    subprocess.Popen(["npm", "run", "dev:server"], cwd=PROJECT_ROOT)
    subprocess.Popen(["npm", "--workspace", "@discasa/desktop", "exec", "tauri", "dev"], cwd=PROJECT_ROOT)


def main() -> None:
    require_source()
    ensure_directories()

    print("==========================================")
    print("Discasa - Generate Assets")
    print("==========================================")
    print("")
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Source image: {SOURCE_IMAGE}")
    print("")
    print("This will:")
    print("- Generate frontend and Tauri icon assets")
    print("- Run a complete soft reset")
    print("- Optionally run npm install")
    print("- Optionally start the app")
    print("")

    if not prompt_yes_no("Continue"):
        print("Cancelled.")
        return

    source = load_source()

    print("")
    print("Generating assets...")
    print("")

    generate_frontend_asset()
    generate_pngs(source)
    generate_ico(source)

    print("")
    print("Asset generation complete.")
    print("")

    run_soft_reset()

    print("")
    if prompt_yes_no("Run npm install now"):
        run_npm_install()

    print("")
    if prompt_yes_no("Start the app now"):
        start_app()

    print("")
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("")
        print("Cancelled by user.")
        wait_before_exit(1)
