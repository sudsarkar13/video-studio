"""Open-source narration for product demo videos (Kokoro-82M, Apache-2.0, runs offline on CPU).

The model and its Python environment live in the Video Studio data folder (see vs_paths.py)
(see SKILL.md, "One-time setup"). Run with that environment's Python:

  PY=<data folder>/.venv/bin/python   (Windows: <data folder>/.venv/Scripts/python.exe)

  # Audition: one clip per voice, same line, so voices can be compared side by side
  $PY -I tts.py samples --out <dir> [--voices af_heart,am_michael,...] [--text "..."]

  # Narration: one WAV per scene from the storyboard, plus timings.json (scene -> seconds)
  $PY -I tts.py narrate --storyboard storyboard.json --voice am_michael --out <dir> [--speed 1.0]

The storyboard's narration lengths set each scene's duration, so narrate runs BEFORE capture.
"""

import argparse
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # our own folder, for vs_paths
from vs_paths import MODELS as HOME
MODEL = os.path.join(HOME, "kokoro-v1.0.onnx")
VOICES = os.path.join(HOME, "voices-v1.0.bin")

# Shortlist for auditioning: American (a), British (b) and the Hindi-trained voices (h) speaking English.
DEFAULT_SAMPLES = [
    "af_heart", "af_bella", "af_nicole", "bf_emma", "bf_isabella", "hf_alpha",
    "am_michael", "am_fenrir", "am_puck", "bm_george", "bm_fable", "hm_omega",
]
SAMPLE_TEXT = (
    "Here is a quick look at how it works. Start with an idea, let the AI do the heavy lifting, "
    "and review every change before you keep it. Everything you need, in a few clicks."
)


def load() -> Kokoro:
    for f in (MODEL, VOICES):
        if not os.path.exists(f):
            sys.exit(f"Missing {f}. Run the one-time setup in SKILL.md first.")
    return Kokoro(MODEL, VOICES)


def lang_for(voice: str) -> str:
    # Kokoro picks pronunciation from the language code; British voices read better with en-gb.
    return "en-gb" if voice.startswith("b") else "en-us"


def say(k: Kokoro, text: str, voice: str, speed: float, path: str) -> float:
    audio, rate = k.create(text, voice=voice, speed=speed, lang=lang_for(voice))
    sf.write(path, audio, rate)
    return len(audio) / rate


def samples(args) -> None:
    k = load()
    os.makedirs(args.out, exist_ok=True)
    voices = args.voices.split(",") if args.voices else DEFAULT_SAMPLES
    known = set(k.get_voices())
    for v in voices:
        if v not in known:
            print(f"skip {v}: not a Kokoro voice")
            continue
        secs = say(k, args.text, v, args.speed, os.path.join(args.out, f"{v}.wav"))
        print(f"{v}: {secs:.1f}s")


def narrate(args) -> None:
    k = load()
    os.makedirs(args.out, exist_ok=True)
    with open(args.storyboard) as fh:
        board = json.load(fh)
    timings = {}
    for scene in board["scenes"]:
        text = (scene.get("narration") or "").strip()
        if not text:
            continue
        secs = say(k, text, args.voice, args.speed, os.path.join(args.out, f"{scene['id']}.wav"))
        timings[scene["id"]] = round(secs, 2)
        print(f"{scene['id']}: {secs:.1f}s")
    with open(os.path.join(args.out, "timings.json"), "w") as fh:
        json.dump({"voice": args.voice, "speed": args.speed, "scenes": timings}, fh, indent=2)
    print(f"total narration: {sum(timings.values()):.1f}s")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("samples")
    s.add_argument("--out", required=True)
    s.add_argument("--voices")
    s.add_argument("--text", default=SAMPLE_TEXT)
    s.add_argument("--speed", type=float, default=1.0)
    n = sub.add_parser("narrate")
    n.add_argument("--storyboard", required=True)
    n.add_argument("--voice", required=True)
    n.add_argument("--out", required=True)
    n.add_argument("--speed", type=float, default=1.0)
    args = p.parse_args()
    samples(args) if args.cmd == "samples" else narrate(args)


if __name__ == "__main__":
    main()
