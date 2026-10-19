"""Mix audio/score_raw.wav and audio/ambience_raw.wav, then master to about -14 LUFS, true peak <= -2 dBTP.
Usage: python3 audio/master.py [ambience_db=-7]. Writes audio/mix.wav."""
import re
import subprocess
import sys

amb = float(sys.argv[1]) if len(sys.argv) > 1 else -7.0


def render(gain):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", "audio/score_raw.wav", "-i", "audio/ambience_raw.wav", "-filter_complex",
                    f"[1:a]volume={amb}dB[a];[0:a][a]amix=inputs=2:normalize=0,volume={gain}dB,aresample=192000,alimiter=limit=0.7:attack=3:release=120:level=false,aresample=48000", "audio/mix.wav"], check=True)
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", "audio/mix.wav", "-af", "loudnorm=print_format=summary", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.search(r"Input Integrated:\s+(-?[\d.]+)", out).group(1)), float(re.search(r"Input True Peak:\s+(-?[\d.]+)", out).group(1))


gain = 12.0
for _ in range(6):
    lufs, tp = render(gain)
    print(f"gain {gain:.1f} dB -> {lufs} LUFS, {tp} dBTP")
    if abs(lufs + 14) < 0.3:
        break
    gain += -14 - lufs
print("final", lufs, "LUFS", tp, "dBTP")
