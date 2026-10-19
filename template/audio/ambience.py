"""Place-based ambience for any duration, keyed on timeline.js shots.

Each shot: {"start": t, "place": "street|field|beach|rooftop|city|indoor|ocean|space|cockpit|storm|crowd|end",
            "night": bool (optional), "amb": {"wind": 0..2, "rain": 0..2, ...} (optional overrides)}
Writes audio/ambience_raw.wav.
"""
import json
import re

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
TL = json.loads(re.search(r"=\s*(\{.*\});", open("timeline.js").read(), re.S).group(1))
DUR = float(TL["duration"])
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
shots = TL["shots"]


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x)


def lp(x, f, o=2):
    return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)


def sm(a, b, x):
    y = np.clip((x - a) / (b - a), 0, 1)
    return y * y * (3 - 2 * y)


ctrl = np.arange(0, DUR, 0.01)
BEDS = ["wind", "birds", "crickets", "waves", "hum", "traffic", "rain", "drone", "engine", "crowd", "room"]
PLACE = {
    "street": {"wind": 0.6, "birds": 1, "crickets": 1, "traffic": 0.4},
    "field": {"wind": 0.8, "birds": 1, "crickets": 1},
    "beach": {"wind": 0.7, "waves": 1},
    "rooftop": {"wind": 1.0, "hum": 1, "traffic": 1},
    "city": {"hum": 1, "traffic": 1.2, "wind": 0.3},
    "indoor": {"room": 1, "hum": 0.4},
    "ocean": {"waves": 1.3, "wind": 1.0},
    "space": {"drone": 1},
    "cockpit": {"engine": 1, "drone": 0.4},
    "storm": {"rain": 1.4, "wind": 1.4},
    "crowd": {"crowd": 1, "wind": 0.3},
    "end": {},
}
gains = {b: np.zeros_like(ctrl) for b in BEDS}
for i, s in enumerate(shots):
    end = shots[i + 1]["start"] if i + 1 < len(shots) else DUR
    w = sm(s["start"] - 0.15, s["start"] + 0.15, ctrl) * (1 - sm(end - 0.15, end + 0.15, ctrl))
    base = dict(PLACE.get(s.get("place", "end"), {}))
    base.update(s.get("amb", {}))
    night = s.get("night", False)
    if night:
        base["birds"] = 0
    else:
        base["crickets"] = 0
    for b in BEDS:
        gains[b] = np.maximum(gains[b], w * base.get(b, 0))
G = {b: np.interp(t, ctrl, gains[b]) for b in BEDS}
L = np.zeros(N)
R = np.zeros(N)


def both(sig, g, pan=0.0):
    global L, R
    L += sig * g * np.sqrt(0.5 * (1 - pan))
    R += sig * g * np.sqrt(0.5 * (1 + pan))


gust = 0.55 + 0.25 * np.sin(2 * np.pi * 0.11 * t + 0.7) + 0.2 * np.sin(2 * np.pi * 0.047 * t + 2.1)
for seed, pan in ((1, -0.6), (2, 0.6)):
    n = np.random.default_rng(seed).standard_normal(N)
    both((bp(n, 180, 900) * 0.6 + bp(n, 900, 2400) * 0.15) * gust * 0.05, G["wind"], pan)
both(lp(np.random.default_rng(3).standard_normal(N), 160, 4) * 0.08, G["hum"])
both(bp(np.random.default_rng(4).standard_normal(N), 300, 1200) * 0.012 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t)), G["traffic"])
both(hp(np.random.default_rng(5).standard_normal(N), 1200) * 0.03 + bp(np.random.default_rng(6).standard_normal(N), 300, 900) * 0.02, G["rain"])
both((np.sin(2 * np.pi * 55 * t) * 0.5 + np.sin(2 * np.pi * 82.5 * t + 1) * 0.3 + lp(np.random.default_rng(7).standard_normal(N), 120) * 2) * 0.03 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.05 * t)), G["drone"])
both((lp(np.random.default_rng(8).standard_normal(N), 220, 4) * 2 + np.sin(2 * np.pi * 96 * t) * 0.2) * 0.05, G["engine"])
both(bp(np.random.default_rng(9).standard_normal(N), 250, 3000) * 0.02 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.31 * t)), G["crowd"])
both(lp(np.random.default_rng(10).standard_normal(N), 400) * 0.03, G["room"])

# waves: swells every ~5.5 s
pos = 0.0
while pos < DUR:
    length = 5.0 + rng.uniform(-0.6, 1.2)
    n = int(length * SR)
    tt = np.arange(n) / SR
    env = sm(0, 1.6, tt) * np.exp(-np.maximum(tt - 1.6, 0) * 1.1)
    noise = rng.standard_normal(n)
    wave = lp(noise, 700) * env * 0.9 + hp(noise, 2500) * env**2 * 0.35
    i = int(pos * SR)
    j = min(N, i + n)
    pan = rng.uniform(-0.4, 0.4)
    g = G["waves"][i:j] * 0.16
    L[i:j] += wave[: j - i] * g * np.sqrt(0.5 * (1 - pan))
    R[i:j] += wave[: j - i] * g * np.sqrt(0.5 * (1 + pan))
    pos += length * 0.62


def chirp(f0, f1, dur, amp):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = f0 + (f1 - f0) * (tt / dur) ** 0.7
    return np.sin(2 * np.pi * np.cumsum(f) / SR + 0.6 * np.sin(2 * np.pi * 38 * tt)) * np.sin(np.pi * tt / dur) ** 2 * amp


pos = 0.3
while pos < DUR:
    pan = rng.uniform(-0.8, 0.8)
    base = rng.uniform(2600, 4200)
    for k in range(rng.integers(2, 6)):
        f0 = base * rng.uniform(0.9, 1.2)
        sig = chirp(f0, f0 * rng.uniform(1.15, 1.6), rng.uniform(0.06, 0.14), 0.05)
        i = int((pos + k * 0.12) * SR)
        if i + len(sig) < N:
            g = G["birds"][i : i + len(sig)]
            L[i : i + len(sig)] += sig * g * np.sqrt(0.5 * (1 - pan))
            R[i : i + len(sig)] += sig * g * np.sqrt(0.5 * (1 + pan))
    pos += rng.uniform(0.5, 1.4)
for c in range(5):
    carrier = rng.uniform(4200, 5600)
    rate = rng.uniform(0.45, 0.7)
    pulse = (np.sin(2 * np.pi * 32 * t) > 0.2).astype(float)
    gate = ((t / rate + rng.uniform()) % 1 < 0.22).astype(float)
    both(np.sin(2 * np.pi * carrier * t) * lp(pulse * gate, 300) * 0.018, G["crickets"], rng.uniform(-0.9, 0.9))

fade = sm(0, 1.2, t) * (1 - sm(DUR - 1.2, DUR, t))
out = np.stack([L * fade, R * fade], 1)
out = out / max(np.abs(out).max(), 1e-9) * 0.6
wavfile.write("audio/ambience_raw.wav", SR, (out * 32767).astype(np.int16))
print("wrote audio/ambience_raw.wav")
