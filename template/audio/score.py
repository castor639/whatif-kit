"""Synthesized ambient score for any duration, shaped by timeline.js "music".

music = {
  "bpm": 72,
  "key": 57,                          # MIDI root (57 = A3)
  "mode": "minor" | "major",
  "arc": [[t, intensity 0..1], ...],  # how full and driving the music is over time
  "hits": [t, ...],                   # impacts: a boom with a hard cut just before
  "silence": [[t0, t1], ...],         # deliberate gaps
  "coda": t                           # closing chord on the end card
}
Writes audio/score_raw.wav.
"""
import json
import re

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
TL = json.loads(re.search(r"=\s*(\{.*\});", open("timeline.js").read(), re.S).group(1))
DUR = float(TL["duration"])
M = TL.get("music", {})
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(int(M.get("seed", 7)))
L = np.zeros(N)
R = np.zeros(N)

BEAT = 60.0 / M.get("bpm", 72)
ROOT = M.get("key", 57)
MINOR = M.get("mode", "minor") == "minor"
arc_k = np.array(M.get("arc", [[0, 0.3], [DUR, 0.8]]), dtype=float)
intensity = lambda x: float(np.interp(x, arc_k[:, 0], arc_k[:, 1]))


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, o=2):
    return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i < 0:
        return
    seg = sig[: N - i]
    L[i : i + len(seg)] += seg * gain * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(seg)] += seg * gain * np.sqrt(0.5 * (1 + pan))


def pad(freq, length, bright):
    n = int(length * SR)
    tt = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.12, 0.0, 0.11):
        f = freq * 2 ** (det / 12)
        s += 2 * ((tt * f + rng.uniform()) % 1.0) - 1
    s = lp(s / 3, bright)
    e = np.ones(n)
    a = int(min(length * 0.35, 2.5) * SR)
    e[:a] = np.linspace(0, 1, a) ** 2
    rel = int(length * 0.6 * SR)
    if n > rel:
        e[rel:] *= np.exp(-np.linspace(0, 6, n - rel))
    return s * e


def piano(freq, length=4.0, vel=1.0):
    n = int(length * SR)
    tt = np.arange(n) / SR
    s = sum(amp * np.sin(2 * np.pi * freq * k * tt * (1 + 0.0004 * k * k)) * np.exp(-tt * (1.2 + 0.9 * k)) for k, amp in ((1, 1.0), (2, 0.45), (3, 0.22), (4, 0.12), (5, 0.06)))
    return s * (1 - np.exp(-tt * 400)) * vel * 0.35


def thump(length=0.9, f0=70, f1=38):
    n = int(length * SR)
    tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 18)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6.5)


# progressions in scale degrees (semitones from root): i VI III VII / I V vi IV
PROG = [[0, 12, 15, 19, 26], [-4, 12, 15, 19, 24], [3, 10, 15, 19, 22], [-2, 10, 14, 17, 21]] if MINOR else [[0, 12, 16, 19, 26], [7, 11, 14, 19, 26], [9, 12, 16, 21, 24], [5, 12, 17, 21, 24]]
CH = 8 * BEAT

# pads
pos, ci = 0.0, 0
while pos < DUR:
    k = intensity(pos)
    chord = PROG[ci % 4]
    length = min(CH + 2.5, DUR - pos + 0.05)
    for j, iv in enumerate(chord):
        add(pad(hz(ROOT - 12 + iv), length, 700 + 1800 * k), pos, (0.06 if j else 0.085) * (0.6 + 0.6 * k), pan=(j - 2) * 0.25)
    pos += CH
    ci += 1

# piano arpeggio, denser as intensity grows
pos, step_i = 0.8, 0
while pos < DUR - 1:
    k = intensity(pos)
    chord = PROG[int(pos // CH) % 4]
    pattern = [chord[2] + 12, chord[3] + 12, chord[4] + 12, chord[3] + 12, chord[1] + 12, chord[4]]
    add(piano(hz(ROOT - 12 + pattern[step_i % 6]), 4.5, 0.5 + 0.25 * np.sin(step_i * 1.7) ** 2), pos, 0.85, pan=0.3 * np.sin(step_i))
    pos += 2 * BEAT if k < 0.35 else (BEAT if k < 0.7 else BEAT / 2)
    step_i += 1

# heartbeat pulse once things get going
pos = 0.0
while pos < DUR:
    k = intensity(pos)
    if k >= 0.4:
        add(thump(), pos, 0.15 + 0.45 * (k - 0.4) / 0.6)
        add(thump(0.6, 60, 40), pos + BEAT * 0.32, (0.15 + 0.45 * (k - 0.4) / 0.6) * 0.45)
    pos += BEAT if k < 0.8 else BEAT / 2

music = (L.copy(), R.copy())

# risers into hits, then booms
fx_L = np.zeros(N)
fx_R = np.zeros(N)
for h in M.get("hits", []):
    rs = max(0, h - 6)
    n = int((h - rs) * SR)
    tt = np.arange(n) / SR
    x = tt / max(h - rs, 1e-3)
    riser = lp(hp(rng.standard_normal(n), 600), 6000) * x**2.2 * 0.1 + np.sin(2 * np.pi * np.cumsum(110 * 2 ** (x * 2.5)) / SR) * x**3 * 0.06
    i = int(rs * SR)
    fx_L[i : i + n] += riser
    fx_R[i : i + n] += riser
    n2 = int(4.5 * SR)
    tt = np.arange(n2) / SR
    boom = np.sin(2 * np.pi * np.cumsum(28 + 60 * np.exp(-tt * 3)) / SR) * np.exp(-tt * 1.1) * 1.6 + lp(rng.standard_normal(n2), 180, 4) * np.exp(-tt * 0.9) * 2.0 + hp(rng.standard_normal(n2), 1500) * np.exp(-tt * 9) * 0.3
    j = int((h + 0.05) * SR)
    m = min(n2, N - j)
    if m > 0:
        fx_L[j : j + m] += boom[:m]
        fx_R[j : j + m] += boom[:m]


def reverb(a, b, amt):
    n = int(2.8 * SR)
    it = np.arange(n) / SR
    ir1 = lp(rng.standard_normal(n) * np.exp(-it * 2.4), 5000)
    ir2 = lp(rng.standard_normal(n) * np.exp(-it * 2.4), 5000)
    return a + fftconvolve(a, ir1)[:N] * amt, b + fftconvolve(b, ir2)[:N] * amt


mL, mR = reverb(*music, 0.018)
gate = np.ones(N)
for h in M.get("hits", []):
    a, b = int((h - 0.08) * SR), int(h * SR)
    gate[a:b] *= np.linspace(1, 0, b - a)
    c = int((h + 4.0) * SR)
    gate[b:c] = 0
    d = min(N, c + int(2.0 * SR))
    gate[c:d] *= np.linspace(0, 1, d - c)
for s0, s1 in M.get("silence", []):
    a, b = int(s0 * SR), int(s1 * SR)
    gate[a:b] = 0
fade_in = int(1.5 * SR)
gate[:fade_in] *= np.linspace(0, 1, fade_in)
coda = M.get("coda")
if coda is not None:
    gate[int(coda * SR) :] *= np.exp(-np.linspace(0, 3, N - int(coda * SR)))
L = mL * gate
R = mR * gate

# closing chord
if coda is not None:
    cL = np.zeros(N)
    cR = np.zeros(N)
    for j, iv in enumerate(PROG[0]):
        sig = piano(hz(ROOT + iv), 6.0, 0.6)
        i = int((coda + 0.3 + j * 0.06) * SR)
        m = min(len(sig), N - i)
        if m > 0:
            cL[i : i + m] += sig[:m] * 0.8
            cR[i : i + m] += sig[:m] * 0.8
    cL, cR = reverb(cL, cR, 0.02)
    L += cL
    R += cR
fxL, fxR = reverb(fx_L, fx_R, 0.015)
L += fxL
R += fxR
end = int(1.2 * SR)
L[-end:] *= np.linspace(1, 0, end)
R[-end:] *= np.linspace(1, 0, end)
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
wavfile.write("audio/score_raw.wav", SR, (np.stack([L, R], 1) / peak * 0.7 * 32767).astype(np.int16))
print("wrote audio/score_raw.wav", DUR, "s")
