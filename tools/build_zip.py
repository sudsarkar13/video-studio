"""Build the downloadable zip: dist/video-studio-<version>.zip

  python3 tools/build_zip.py

The zip unpacks to a single `video-studio/` folder (the skill) that people drop into their Claude
skills folder; README.md, THIRD_PARTY.md and LICENSE (if present) go inside it. node_modules,
caches and OS litter are left out; the installer fetches dependencies on the user's machine.
"""

import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, "skills", "video-studio")
SKIP_DIRS = {"node_modules", "__pycache__", ".git"}
SKIP_FILES = {".DS_Store", "package-lock.json"}


def main() -> None:
    with open(os.path.join(ROOT, ".claude-plugin", "plugin.json")) as fh:
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
                info = zipfile.ZipInfo.from_file(path, arc)
                if name.endswith(".sh"):
                    info.external_attr = 0o100755 << 16  # keep the installer executable
                with open(path, "rb") as fh:
                    z.writestr(info, fh.read(), zipfile.ZIP_DEFLATED)
                count += 1
        for extra in ("README.md", "THIRD_PARTY.md", "LICENSE"):
            p = os.path.join(ROOT, extra)
            if os.path.exists(p):
                z.write(p, os.path.join("video-studio", extra))
                count += 1
    size = os.path.getsize(out) / 1024
    print(f"{out}: {count} files, {size:.0f} KB")
    if not os.path.exists(os.path.join(ROOT, "LICENSE")):
        print("note: no LICENSE file yet; add one before publishing", file=sys.stderr)


if __name__ == "__main__":
    main()
