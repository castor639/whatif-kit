# Build brief for one What-If Short

You are building ONE finished YouTube Short in the "What If X Kept Happening and Couldn't Stop?" format, inside the project folder you were given (made with `bin/new`). The bar is cinematic, smooth, exciting and true.

## Read first

- `ENGINE.md` in the project: the engine API, the audio kit and the determinism rules.
- The project's `main.js`, `timeline.js` and `moon.js`: a finished Moon Short. Copy its patterns; it is the quality bar.

Work only inside the project folder.

## Story

1. Research the real science. Find the numbers, thresholds and milestones that make each beat land, with sources. Put a model script in `tools/` that computes every number shown on screen, and paste its output and the source links into `BRIEF.md`. If a rate is made up ("say it doubles every year"), say so on screen.
2. Write the arc as an escalating time-lapse: a calm start, rising stakes, one or two reveals, and a strong end card (a big serif number, an italic line and the title). Aim for about 60 seconds, 9 to 12 captions and 1 or 2 music hits.
3. Captions: true, calm, short, specific, no em dashes, in the second person ("you") where natural.

## Pictures

Mix the points of view: first person (`povRig`), third person (a visible person via `makePerson`), wide or cosmic shots (planets, orbits), and a diagram moment. No single POV should run for more than about a third of the video. Use 0.9 s crossfades, a slow camera move on every shot, motion blur on fast motion, and bloom on light sources.

The HUD shows the key quantity rounded to significant figures ("40.5 million km", not "40,500,000 km"), a NEXT milestone with a countdown, and "each second is ..." for the time-lapse. Every frame must read on a phone: nothing washed out, nothing pitch black, nothing covering the subject.

## Sound

Set `TIMELINE.music` (arc, hits, silence, coda) and each shot's place, night flag and ambience so the sound follows the story. `bin/check`, `bin/snap` and `bin/render` build `audio/mix.wav` from it.

## Check

1. Run `bin/check <project>` until it reports 0 errors, contrast included.
2. Run `bin/snap <project> <every shot midpoint and every crossfade> <label>` and look at every still. Fix things and repeat until every frame looks good.

## Render

Run `bin/render <project> 60`. Confirm the output is 1080x1920 at 60 fps, about -14 LUFS, with true peak at or below -1.5 dBTP, and look at `.hyperframes/render-sheet.jpg`.

## Report

Send back:
- the MP4 path;
- the captions;
- the key numbers with sources;
- a suggested YouTube title, a two-sentence description, and a pinned comment listing the sources;
- any weak spots.
