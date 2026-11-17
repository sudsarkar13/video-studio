"""Royalty-free background music and sound effects, generated from code (numpy only).

Nothing is downloaded or sampled, so the output carries no licence or copyright restrictions and the
track can be made exactly as long as the video.

  PY=<data folder>/.venv/bin/python   (Windows: <data folder>/.venv/Scripts/python.exe)
  $PY -I sound.py music --seconds 150 --out music.wav [--mood light|warm] [--bpm 84] [--seed 7]
  $PY -I sound.py sfx --out-dir sfx/          # click.wav, whoosh.wav, pop.wav

Music design (for product demos): a soft, airy pad with a quiet bass and a sparse bell arpeggio,
low-passed so it stays out of the speech band, slow chord changes, gentle reverb, fade in and out.
It is meant to sit far under the voice (compose levels it to about -30 LUFS and ducks it further
whenever anyone speaks), so it fills silence without pulling attention from the demo.
"""

import argparse
import os
import sys
import wave

import numpy as np

SR = 48000

# Chord progressions as semitone offsets from the key's root (C4 = 60). Four chords, two bars each.
MOODS = {
    # Bright, open, optimistic: Cmaj9 - Am7 - Fmaj7 - Gsus2
    "light": {"root": 60, "bass": 0.0, "chords": [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 12], [-7, -3, 0, 4, 9], [-5, 2, 7, 9, 14]]},
    # Warmer, a little more reflective: Dm9 - Bbmaj7 - Fmaj7 - C6
    "warm": {"root": 62, "bass": 0.07, "chords": [[0, 3, 7, 10, 14], [-4, 0, 3, 7, 10], [-9, -5, 0, 3, 7], [-2, 2, 5, 7, 12]]},
}
PENTA = [0, 2, 4, 7, 9]


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def soft_band(x: np.ndarray, low: float, high: float) -> np.ndarray:
    # Smooth FFT-domain band-pass: removes the deep end (no rumble, nothing "heavy") and the top.
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    hp = (f / low) ** 4 / (1 + (f / low) ** 4)
    spec *= hp / np.sqrt(1 + (f / high) ** 4)
    return np.fft.irfft(spec, n).astype(np.float32)


def soft_lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    # Fast FFT-domain low-pass with a smooth roll-off (no per-sample Python loop).
    n = len(x)
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec *= 1 / np.sqrt(1 + (freqs / cutoff) ** 4)
    return np.fft.irfft(spec, n).astype(np.float32)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    t = np.arange(n) / SR
    env = np.minimum(1.0, t / attack) if attack > 0 else np.ones(n)
    tail = np.clip((n / SR - t) / release, 0, 1) if release > 0 else 1
    return (env * tail).astype(np.float32)


def pad_voice(freq: float, n: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float32)
    for detune in (-0.12, 0.0, 0.12):  # cents-ish chorus
        f = freq * 2 ** (detune / 12)
        ph = rng.uniform(0, 2 * np.pi)
        out += (np.sin(2 * np.pi * f * t + ph) + 0.18 * np.sin(4 * np.pi * f * t + ph)).astype(np.float32)
    return out / 3


def bell(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 9)
    env = (1 - np.exp(-t * 400)) * np.exp(-t * 3.2)
    return (tone * env).astype(np.float32)


def reverb(x: np.ndarray, seconds: float, rng: np.random.Generator, wet: float) -> np.ndarray:
    # Exponentially decaying noise impulse response, applied by overlap-add FFT convolution.
    ir_n = int(seconds * SR)
    t = np.arange(ir_n) / SR
    ir = (rng.standard_normal(ir_n) * np.exp(-t * 3.0 / seconds)).astype(np.float32)
    ir = soft_lowpass(ir, 4000)
    ir /= np.sqrt(np.sum(ir**2)) + 1e-9
    block = 1 << 17
    nfft = 1 << int(np.ceil(np.log2(block + ir_n)))
    irf = np.fft.rfft(ir, nfft)
    out = np.zeros(len(x) + ir_n, dtype=np.float32)
    for s in range(0, len(x), block):
        seg = x[s : s + block]
        y = np.fft.irfft(np.fft.rfft(seg, nfft) * irf, nfft)[: len(seg) + ir_n]
        out[s : s + len(y)] += y.astype(np.float32)
    out = out[: len(x)]
    return ((1 - wet) * x + wet * out * 0.6).astype(np.float32)


def music(seconds: float, mood: str, bpm: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    spec = MOODS[mood]
    total = int((seconds + 1.0) * SR)
    beat = 60.0 / bpm
    chord_len = beat * 8  # two bars of 4/4
    left = np.zeros(total, dtype=np.float32)
    right = np.zeros(total, dtype=np.float32)

    # Pads and bass: overlapping chords with slow attack and release.
    k = 0
    start = 0.0
    while start < seconds + 1:
        notes = spec["chords"][k % len(spec["chords"])]
        n = int((chord_len + 2.5) * SR)
        s0 = int(start * SR)
        n = min(n, total - s0)
        if n <= 0:
            break
        env = envelope(n, 1.8, 2.6)
        for j, off in enumerate(notes):
            v = pad_voice(hz(spec["root"] + off), n, rng) * env * (0.11 if j else 0.13)
            pan = 0.5 + 0.35 * np.sin(j * 1.7 + k)  # spread voices across the stereo field
            left[s0 : s0 + n] += v * (1 - pan)
            right[s0 : s0 + n] += v * pan
        if spec["bass"]:  # an octave below the root only, never sub-bass
            bass = pad_voice(hz(spec["root"] + notes[0] - 12), n, rng) * env * spec["bass"]
            left[s0 : s0 + n] += bass
            right[s0 : s0 + n] += bass
        start += chord_len
        k += 1

    # Sparse bell arpeggio: chord-tone or pentatonic notes on some eighth notes, never busy.
    t = beat * 4  # let the pad breathe for a bar first
    while t < seconds - 2:
        k = int(t // chord_len)
        notes = spec["chords"][k % len(spec["chords"])]
        if rng.random() < 0.42:
            off = rng.choice(notes[1:]) if rng.random() < 0.6 else rng.choice(PENTA)
            b = bell(hz(spec["root"] + 12 + off), 2.2) * rng.uniform(0.06, 0.09)
            s0 = int(t * SR)
            e = min(total, s0 + len(b))
            pan = rng.uniform(0.25, 0.75)
            left[s0:e] += b[: e - s0] * (1 - pan)
            right[s0:e] += b[: e - s0] * pan
        t += beat / 2

    # Keep it out of the speech band's upper half and soften everything.
    left = soft_band(left, 140, 2800)
    right = soft_band(right, 140, 2800)
    left = reverb(left, 2.8, rng, 0.45)
    right = reverb(right, 2.8, np.random.default_rng(seed + 1), 0.45)

    out = np.stack([left, right], axis=1)[: int(seconds * SR)]
    fade_in = np.minimum(1, np.arange(len(out)) / (2.0 * SR))
    fade_out = np.clip((len(out) - np.arange(len(out))) / (3.0 * SR), 0, 1)
    out *= (fade_in * fade_out)[:, None]
    peak = np.max(np.abs(out)) + 1e-9
    return (out / peak * 0.7).astype(np.float32)


def click() -> np.ndarray:
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(1)
    noise = soft_lowpass(rng.standard_normal(n).astype(np.float32), 5000)
    tone = np.sin(2 * np.pi * 1900 * t) * 0.5
    sig = (noise * 0.6 + tone) * np.exp(-t * 90)
    return sig.astype(np.float32)


def whoosh() -> np.ndarray:
    dur = 0.75
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(2)
    noise = rng.standard_normal(n).astype(np.float32)
    # Sweep a band upwards by mixing low-passed copies with a moving crossfade.
    lo = soft_lowpass(noise, 600)
    mid = soft_lowpass(noise, 2200)
    hi = soft_lowpass(noise, 6000)
    k = t / dur
    sweep = lo * (1 - k) ** 2 + mid * 2 * k * (1 - k) + hi * k**2
    env = np.sin(np.pi * np.clip(k, 0, 1)) ** 2
    return (sweep * env).astype(np.float32)


def pop() -> np.ndarray:
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = 520 + 380 * np.exp(-t * 30)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    return sig.astype(np.float32)


def write_wav(path: str, data: np.ndarray) -> None:
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    pcm = np.clip(data, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("music")
    m.add_argument("--seconds", type=float, required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--mood", choices=sorted(MOODS), default="light")
    m.add_argument("--bpm", type=float, default=84)
    m.add_argument("--seed", type=int, default=7)
    s = sub.add_parser("sfx")
    s.add_argument("--out-dir", required=True)
    a = p.parse_args()
    if a.cmd == "music":
        if a.seconds <= 0 or a.seconds > 1200:
            sys.exit("seconds must be between 0 and 1200")
        write_wav(a.out, music(a.seconds, a.mood, a.bpm, a.seed))
        print(f"music: {a.out} ({a.seconds:.1f}s, {a.mood}, {a.bpm:.0f} bpm, seed {a.seed})")
    else:
        os.makedirs(a.out_dir, exist_ok=True)
        for name, fn, vol in (("click", click, 0.5), ("whoosh", whoosh, 0.45), ("pop", pop, 0.4)):
            sig = fn()
            sig = sig / (np.max(np.abs(sig)) + 1e-9) * vol
            write_wav(os.path.join(a.out_dir, f"{name}.wav"), sig)
        print(f"sfx: click, whoosh, pop -> {a.out_dir}")


if __name__ == "__main__":
    main()
