"""Video Studio's data folder, shared with lib/paths.mjs (same rules, same overrides)."""
import os
import sys

if os.environ.get("VIDEO_STUDIO_HOME"):
    HOME_DIR = os.environ["VIDEO_STUDIO_HOME"]
elif sys.platform == "win32":
    HOME_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local"), "video-studio")
else:
    HOME_DIR = os.path.join(os.path.expanduser("~"), ".local", "share", "video-studio")

MODELS = os.path.join(HOME_DIR, "models")
