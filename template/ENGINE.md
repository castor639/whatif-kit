# Engine guide

Every video is a self-contained HyperFrames project with its own copy of `engine/`, `audio/` and `fonts/`. Change the engine inside your project freely; nothing is shared at render time.

The template is a finished first-person Short ("What if the Moon kept falling?", 9:16, 1080x1920, 60 fps). Copy its patterns: the shot list, crossfades via `#fade-layer`, HUD updates, captions, the sky-extras pattern (`look.sky.extras`) and per-sample hooks.

## Project files

- `index.html`: the HyperFrames root, HUD and caption markup, and the pinned `three` import map.
- `main.js`: builds the scenes and drives every frame from the video time.
- `timeline.js`: `TIMELINE` with `duration`, `keys` (video seconds to simulated time), `shots`, `captions` and `music`. The audio scripts parse this file too, so keep it a plain object literal.
- `model.js` or `tools/*.py`: the physics. Every number on screen should come from here.
- `BRIEF.md`: the story, the model output and the sources.

## Modules (engine/)

- `look.js` `createLook(canvas, {width, height, fov, seed, samples, sunDir})`
  - `look.render({scene, camera, h0, h1, t, perSample, flash})`: ground shots. The sky is a long exposure over clock hours [h0, h1] (Preetham sky, stars, clouds, sun trail, plus anything in `look.sky.extras`). Light the place first with `place.update(look.lightState(h0, h1), t, ...)`.
  - `look.renderScene({scene, camera, t, samples, perSample(i, frac), flash, warm})`: any other scene (space, interiors, diagrams). With samples > 1, perSample moves things between sub-frames for real motion blur. Use 6 to 12 samples for fast motion, 1 otherwise.
  - `look.setLens(camera, worldPos, rsWorld)`: gravitational lensing around a black hole. Call it every frame before render while the black hole is on screen. It resets after each render.
  - `look.sunDir`: replace it with a real sun model when the story needs one.
  - `look.skyGain`, `look.starBoost`, `look.cloudOpacity`, `look.sky.night.uniforms.uTint`: sky tuning.
  - ACES tone mapping, bloom (threshold 1.0), grain and vignette grading, `flash` to white.
- `places.js` `buildStreet | buildRooftop | buildField | buildBeach(look, rand, opts)`
  - Each returns `{scene, camera, eye, yaw, pitch, rig, add, update(state, t, ...)}`.
  - `place.night = {extraNight, extraNightColor}` brightens nights. `place.rig.power` (0 to 1) dims lamps and windows, for blackouts.
  - Add your own places in your project's copy following the same pattern.
- `pov.js` `povRig(place, [[t, yawDeg, pitchDeg], ...])`: a first-person head with breathing and eased turns. Call `pov(t, {shake, drift})`.
- `character.js` `makePerson({jacket, pants, skin, hair, astronaut, scale})`
  - Returns `{group, pose(t, name, {phase, look, amount, lean})}`.
  - Poses: stand, lookUp (via look), walk, jump (amount = phase 0..1), float, point, brace, sit.
  - For third-person shots, place the person in a place scene and set `place.camera` yourself (over the shoulder, side, wide, low angle).
- `space.js`
  - `makeStarfield(seed, {count, radius, milkyWay, size})`
  - `makePlanet({type: earth|gas|rock|ice|lava, radius, seed, atmosphereColor, clouds, nightLights, styleOpts})` returns `{group, body, clouds, setSun(dir, nightAmt)}`. Call setSun every frame with the world direction to the sun.
  - `makeRings({inner, outer})`, `makeSun({radius, intensity})`, `makeBlackHole({rs, inner, outer})` (returns `{group, disk, update(t)}`; pair it with `look.setLens`), `makeRock({radius, seed})`.
  - Space scenes need their own lights: a DirectionalLight from the sun plus a dim AmbientLight.
- `text.js`: `wordSpans`, `reveal`, `soft`, `captionTrack(el, rows)` for word-by-word blur reveals.
- `util.js`: `mulberry32`, `smooth`, `lerp`, `monotoneCurve(keys)` (video time to sim time), `easedKeys`, `sig` (significant figures), `fmtInt`, `fmtDuration`, `fmtRate`, `clockLabel`.

## Audio (audio/)

All synthesized in Python with numpy and scipy, so there is nothing to license.

- `score.py` reads `TIMELINE.music` (`bpm`, `key`, `mode`, `arc`, `hits`, `silence`, `coda`) and works for any duration.
- `ambience.py` reads `TIMELINE.shots[].place`, plus optional `night` and `amb` overrides. Places: street, field, beach, rooftop, city, indoor, ocean, space, cockpit, storm, crowd, end.
- `master.py [ambience_db]` mixes both and masters to about -14 LUFS with ffmpeg.

`bin/check`, `bin/snap` and `bin/render` rebuild the mix whenever `timeline.js` is newer than `audio/mix.wav`.

## Determinism

No `Date.now`, no `Math.random`, and no network at render time except the pinned `three` import map. Seed everything with `mulberry32`. The root `data-duration` must equal the timeline duration, and `data-no-timeline` stays on the root.
