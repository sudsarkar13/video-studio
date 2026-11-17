"""Build the downloadable zip: dist/video-studio-<version>.zip

  python3 tools/build_zip.py

The zip unpacks to a single `video-studio/` folder (the skill) that people drop into their Claude
skills folder; README.md, THIRD_PARTY.md and LICENSE (if present) go inside it. node_modules,
caches and OS litter are left out; install/install.mjs fetches dependencies into the data folder.
"""

import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, "plugins", "video-studio")
SKILL = os.path.join(PLUGIN, "skills", "video-studio")
SKIP_DIRS = {"node_modules", "__pycache__", ".git"}
SKIP_FILES = {".DS_Store"}


def check_pins() -> None:
    """Fail if reference/setup.md no longer repeats every pin from scripts/lib/paths.mjs."""
    with open(os.path.join(SKILL, "scripts", "lib", "paths.mjs")) as fh:
        js = fh.read()
    with open(os.path.join(SKILL, "reference", "setup.md")) as fh:
        md = fh.read()
    pins = re.findall(r'"([0-9a-f]{64})"', js)  # model checksums
    pins += re.findall(r'PLAYWRIGHT_PIN = "(playwright-core@[^"]+)"', js)
    pins += re.findall(r'"((?:kokoro-onnx|soundfile|numpy)[=<>][^"]+)"', js)
    pins += re.findall(r'MODEL_URL = "([^"]+)"', js)
    if len(pins) < 7:
        sys.exit(f"pin check: found only {len(pins)} pins in paths.mjs; update check_pins()")
    plain = md.replace("`", "")
    missing = [p for p in pins if p not in plain]
    if missing:
        sys.exit("pin check: reference/setup.md is out of date with scripts/lib/paths.mjs: " + ", ".join(missing))
    print(f"pin check: setup.md matches paths.mjs ({len(pins)} pins)")


def main() -> None:
    check_pins()
    with open(os.path.join(PLUGIN, ".claude-plugin", "plugin.json")) as fh:
        version = json.load(fh)["version"]
    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"video-studio-{version}.zip")
    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(SKILL):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for name in sorted(files):
                if name in SKIP_FILES or name.endswith(".pyc"):
                    continue
                path = os.path.join(base, name)
                arc = os.path.join("video-studio", os.path.relpath(path, SKILL))
                z.write(path, arc)
                count += 1
        for extra in ("README.md", "THIRD_PARTY.md", "LICENSE"):
            p = os.path.join(PLUGIN, extra)
            if os.path.exists(p):
                z.write(p, os.path.join("video-studio", extra))
                count += 1
    size = os.path.getsize(out) / 1024
    print(f"{out}: {count} files, {size:.0f} KB")
    if not os.path.exists(os.path.join(PLUGIN, "LICENSE")):
        print("note: no LICENSE file yet; add one before publishing", file=sys.stderr)


if __name__ == "__main__":
    main()
