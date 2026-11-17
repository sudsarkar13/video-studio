#!/usr/bin/env bash
# Video Studio installer for macOS and Linux. Safe to run again: it only adds what is missing.
#   bash install.sh            set everything up
#   bash install.sh --check    only run the doctor
# Data goes to $VIDEO_STUDIO_HOME (default ~/.local/share/video-studio). Nothing outside it and the
# skill folder is changed; system packages (ffmpeg, a browser) are never installed for you.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${VIDEO_STUDIO_HOME:-$HOME/.local/share/video-studio}"
VENV="$DATA/.venv"
MODELS="$DATA/models"
BASE_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
KOKORO_SHA="7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"
VOICES_SHA="bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mx\033[0m %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--check" ]]; then exec node "$SKILL_DIR/scripts/doctor.mjs"; fi

command -v node >/dev/null || fail "Node.js 18 or newer is needed: https://nodejs.org (or your package manager)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "Node.js $NODE_MAJOR is too old; 18 or newer is needed."

mkdir -p "$DATA" "$MODELS"

say "Browser automation library (playwright-core) in the skill folder"
(cd "$SKILL_DIR" && npm install --no-audit --no-fund --silent)

say "Python environment for the voice and music engines: $VENV"
if [[ ! -x "$VENV/bin/python" ]]; then
	if command -v uv >/dev/null; then
		uv venv --python 3.12 "$VENV" -q
	else
		PY=""
		for c in python3.12 python3.11 python3.10 python3; do command -v "$c" >/dev/null && PY="$c" && break; done
		[[ -n "$PY" ]] || fail "Python 3.10-3.12 is needed (or install uv: https://docs.astral.sh/uv/)."
		"$PY" -m venv "$VENV"
	fi
fi
if command -v uv >/dev/null; then
	uv pip install --python "$VENV/bin/python" -q kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3"
else
	"$VENV/bin/python" -m pip install -q --upgrade pip
	"$VENV/bin/python" -m pip install -q kokoro-onnx==0.6.1 soundfile==0.14.0 "numpy>=1.26,<3"
fi

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
fetch() { # name sha
	local f="$MODELS/$1"
	if [[ -f "$f" && "$(sha256 "$f")" == "$2" ]]; then return; fi
	say "Downloading voice model file $1"
	curl -fL --retry 3 -o "$f.part" "$BASE_URL/$1"
	[[ "$(sha256 "$f.part")" == "$2" ]] || { rm -f "$f.part"; fail "$1 failed its checksum; download refused."; }
	mv "$f.part" "$f"
}
fetch kokoro-v1.0.onnx "$KOKORO_SHA"
fetch voices-v1.0.bin "$VOICES_SHA"

say "Browser"
BROWSER="$(cd "$SKILL_DIR/scripts" && node -e 'import("./lib/paths.mjs").then(m=>console.log(m.browser().name))')"
if [[ "$BROWSER" == "bundled Chromium" ]]; then
	say "No Google Chrome or Microsoft Edge found; downloading Playwright's Chromium"
	node "$SKILL_DIR/node_modules/playwright-core/cli.js" install chromium
else
	echo "   using $BROWSER"
fi

if ! command -v "${VIDEO_STUDIO_FFMPEG:-ffmpeg}" >/dev/null; then
	echo
	echo "ffmpeg is missing. Install it, then run this again:"
	if [[ "$(uname)" == "Darwin" ]]; then echo "   brew install ffmpeg"; else echo "   sudo apt install ffmpeg    (or: sudo dnf install ffmpeg / sudo pacman -S ffmpeg)"; fi
fi

echo
node "$SKILL_DIR/scripts/doctor.mjs"
