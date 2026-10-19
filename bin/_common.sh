# shared by bin/*: resolves the project and pins the HyperFrames version.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: $(basename "$0") <project> ..." >&2; exit 1; }
PROJ=$(cd "$1" && pwd)
NAME=$(basename "$PROJ")
HF="npx --yes hyperframes@${HF_VERSION:-0.8.159}"
# long renders stall less when captured in segments with a fresh browser per segment
export HF_SEGMENTED_CAPTURE=${HF_SEGMENTED_CAPTURE:-true} HF_SEGMENT_FRAMES=${HF_SEGMENT_FRAMES:-600} HF_SEGMENT_BROWSER_RECYCLE=${HF_SEGMENT_BROWSER_RECYCLE:-1}
build_audio() {
  [ -f "$PROJ/audio/master.py" ] || return 0
  if [ ! -f "$PROJ/audio/mix.wav" ] || [ "$PROJ/timeline.js" -nt "$PROJ/audio/mix.wav" ] || [ "${1:-}" = force ]; then
    (cd "$PROJ" && python3 audio/score.py && python3 audio/ambience.py && python3 audio/master.py "${AMB_DB:--7}")
  fi
}
