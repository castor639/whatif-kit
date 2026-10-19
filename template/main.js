import * as THREE from "three";
import { TIMELINE } from "./timeline.js";
import { createLook } from "./engine/look.js";
import { buildStreet, buildRooftop, buildField, buildBeach } from "./engine/places.js";
import { povRig } from "./engine/pov.js";
import { captionTrack, wordSpans, reveal, soft } from "./engine/text.js";
import { mulberry32, clamp01, smooth, lerp, monotoneCurve, sig, fmtInt, fmtDuration, fmtRate, clockLabel } from "./engine/util.js";
import { makeMoon } from "./moon.js";

// ---------- physics: radial free fall from 384,400 km ----------
const GM = 3.986004e14 + 4.9048e12;
const R0 = 3.844e8;
const RE = 6.371e6;
const RM = 1.7374e6;
const A = Math.sqrt((R0 * R0 * R0) / (8 * GM));
const fall = (() => {
  const n = 20000;
  const ts = new Float64Array(n + 1);
  const rs = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const eta = (Math.PI * 0.985 * i) / n;
    ts[i] = (A * (eta + Math.sin(eta))) / 3600;
    rs[i] = (R0 / 2) * (1 + Math.cos(eta));
  }
  return { ts, rs, n };
})();
function radiusAt(hours) {
  const { ts, rs, n } = fall;
  if (hours <= 0) return R0;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] < hours) lo = mid;
    else hi = mid;
  }
  const f = (hours - ts[lo]) / (ts[hi] - ts[lo] || 1);
  return rs[lo] + (rs[hi] - rs[lo]) * clamp01(f);
}
const speedAt = (r) => Math.sqrt(Math.max(0, 2 * GM * (1 / r - 1 / R0))) * 3.6;
const hoursAtRadius = (rT) => {
  const { ts, rs, n } = fall;
  for (let i = 0; i <= n; i++) if (rs[i] <= rT) return ts[i];
  return ts[n];
};
const CONTACT_H = hoursAtRadius(8.108e6);
const MILESTONES = [
  ["Halfway", hoursAtRadius(1.922e8)],
  ["Ten times closer", hoursAtRadius(3.844e7)],
  ["Roche limit", hoursAtRadius(1.84e7)],
  ["Impact", CONTACT_H],
];
const tideFactor = (r) => Math.pow(R0 / r, 3);

const simHours = monotoneCurve(TIMELINE.keys);
const clockOf = (t) => TIMELINE.startHour + simHours(t);

// ---------- look and places ----------
const rand = mulberry32(20261015);
const canvas = document.getElementById("world");
const look = createLook(canvas, { seed: 11 });
const places = {
  street: buildStreet(look, rand),
  rooftop: buildRooftop(look, rand),
  field: buildField(look, rand),
  beach: buildBeach(look, rand),
};
places.beach.tideLevel = (fallHours) => {
  const r = radiusAt(fallHours);
  return -0.45 + Math.min(1.6, 0.17 * tideFactor(r)) * Math.sin((2 * Math.PI * fallHours) / 12.42 + 1.2);
};
const shots = TIMELINE.shots.map((s) => ({ ...s, pov: s.place !== "end" ? povRig(places[s.place], s.look) : null }));
const shotAt = (t) => shots.reduce((cur, s) => (t >= s.start ? s : cur), shots[0]);

// ---------- the Moon in the sky ----------
const moon = makeMoon(rand);
look.sky.extras.add(moon.group);
const moonKey = new THREE.DirectionalLight(0xfff4e6, 3.0);
const moonFill = new THREE.HemisphereLight(0x8fa4c8, 0x2a2420, 0.3);
look.sky.scene.add(moonKey, moonKey.target, moonFill);
const MOON_AZ = 0.0;
const MOON_STRETCH = new THREE.Vector3(Math.cos(0.45), Math.sin(0.45), 0).normalize();
const moonDir = new THREE.Vector3();

// burning fragments streaking down through the atmosphere
const STREAKS = 30;
const streakGeo = new THREE.BufferGeometry();
const streakPos = new Float32Array(STREAKS * 6);
const streakCol = new Float32Array(STREAKS * 6);
streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
streakGeo.setAttribute("color", new THREE.BufferAttribute(streakCol, 3));
look.sky.extras.add(new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
const streakData = Array.from({ length: STREAKS }, () => ({ start: 49.2 + rand() * 4.6, len: 0.7 + rand() * 0.8, az: MOON_AZ + (rand() - 0.5) * 0.9, el0: 0.3 + rand() * 0.45 }));

function placeMoon(t, r, breakT) {
  const obsDist = Math.max(r - RE - 0.5 * RM * breakT, 2.2e6);
  const boost = lerp(2.6, 1.25, smooth(0.9, 0.985, 1 - r / R0));
  const angR = Math.min(THREE.MathUtils.degToRad(14), Math.asin(Math.min(0.995, (boost * RM) / obsDist)));
  const el = THREE.MathUtils.degToRad(lerp(22, 17, smooth(0.6, 1, 1 - r / R0)));
  moonDir.set(Math.sin(MOON_AZ) * Math.cos(el), Math.sin(el), -Math.cos(MOON_AZ) * Math.cos(el));
  const MR = 1000;
  const dist = MR / Math.sin(angR);
  moon.group.position.copy(moonDir).multiplyScalar(dist);
  moon.group.scale.setScalar(MR);
  moon.group.lookAt(0, 0, 0);
  moon.group.rotateY(Math.PI * 0.08);
  moon.group.rotateX(-0.25 + t * 0.002);
  moonKey.position.copy(moon.group.position).add(new THREE.Vector3(0.6, 0.45, 1).multiplyScalar(dist));
  moonKey.target.position.copy(moon.group.position);
  moon.update(breakT, MOON_STRETCH, 0.8, 1.9, smooth(51.5, 54.2, t), true);
  return Math.min(1, Math.pow(3.778e8 / obsDist, 2) / 60);
}

function placeStreaks(t) {
  streakData.forEach((sd, i) => {
    const p = clamp01((t - sd.start) / sd.len);
    const on = p > 0 && p < 1 ? 1 : 0;
    const e0 = sd.el0 * (1 - p * 1.05);
    const e1 = sd.el0 * (1 - Math.max(0, p - 0.18) * 1.05);
    const R = 1e5;
    const az = sd.az + p * 0.06;
    streakPos.set([Math.sin(az) * Math.cos(e0) * R, Math.sin(e0) * R, -Math.cos(az) * Math.cos(e0) * R, Math.sin(az) * Math.cos(e1) * R, Math.sin(e1) * R, -Math.cos(az) * Math.cos(e1) * R], i * 6);
    streakCol.set([on * 3, 2.4 * on, 1.6 * on, 2.4 * on, 0.8 * on, 0.1 * on], i * 6);
  });
  streakGeo.getAttribute("position").needsUpdate = true;
  streakGeo.getAttribute("color").needsUpdate = true;
}

// ---------- drawing a shot ----------
function drawShot(shot, t) {
  const fallH = simHours(t);
  const r = radiusAt(fallH);
  const breakT = smooth(TIMELINE.breakStart, TIMELINE.breakEnd, t);
  const s = shot.place === "end" ? shots[shots.length - 2] : shot;
  const place = places[s.place];
  const shake = smooth(49, 54.3, t) * 0.035 + smooth(53.2, 54.4, t) * 0.08;
  s.pov(t, { shake, drift: s.place === "street" ? 0.03 : 0 });

  const moonBright = placeMoon(t, r, breakT);
  placeStreaks(t);
  const h1 = clockOf(t);
  const h0 = clockOf(Math.max(0, t - TIMELINE.shutter));
  const state = look.lightState(h0, h1);
  // keep the Moon photographed at its own brightness whatever the sky exposure is
  const mid = look.sunDir((h0 + h1) / 2);
  const skyExp = lerp(0.85, 0.16, smooth(-0.1, 0.3, mid.y)) + (1 - smooth(0.0, 0.3, Math.max(0, mid.y))) * 0.06;
  moonKey.intensity = 3.0 * (0.75 / skyExp);
  moonFill.intensity = 0.3 * (0.75 / skyExp);
  look.sky.night.uniforms.uTint.value.setRGB(1 + moonBright * 2.5, 1 + moonBright * 2.8, 1 + moonBright * 3.4);
  look.starBoost = 1 - moonBright * 0.75;

  place.night = { extraNight: moonBright * 0.9 + smooth(51, 54, t) * 0.8, extraNightColor: new THREE.Color(0xc8d6ff).lerp(new THREE.Color(0xffa060), smooth(51, 54, t)) };
  place.update(state, t, fallH);
  look.render({ scene: place.scene, camera: place.camera, h0, h1, t, flash: smooth(53.9, 54.45, t) * (1 - smooth(55.2, 56.4, t)) });
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const fadeCanvas = $("fade-layer");
const fadeCtx = fadeCanvas.getContext("2d");
const XF = 0.45;
const CUTS = shots.filter((s, i) => i > 0 && s.place !== "end").map((s) => ({ at: s.start, prev: shots[shots.indexOf(s) - 1] }));
const MILESTONE_T = MILESTONES.map(([, mh]) => {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (simHours(mid) < mh) lo = mid;
    else hi = mid;
  }
  return hi;
});
const captions = captionTrack($("caption-text"), TIMELINE.captions);
const titleWords = wordSpans($("title-text"), $("title-text").textContent);
const endBig = wordSpans($("end-big"), $("end-big").textContent);
const endSub = wordSpans($("end-sub"), $("end-sub").textContent);

function renderAt(t) {
  const shot = shotAt(t);
  const cut = CUTS.find((c) => Math.abs(t - c.at) < XF);
  if (cut) {
    drawShot(cut.prev, t);
    fadeCtx.drawImage(canvas, 0, 0);
    fadeCanvas.style.opacity = String(1 - smooth(cut.at - XF, cut.at + XF, t));
  } else {
    fadeCanvas.style.opacity = "0";
  }
  drawShot(shot, t);

  const fallH = simHours(t);
  const r = radiusAt(fallH);
  const rate = ((simHours(t + 0.25) - simHours(Math.max(0, t - 0.25))) * 3600) / (t + 0.25 - Math.max(0, t - 0.25));
  $("clock").textContent = clockLabel(clockOf(t), rate);
  $("dist").textContent = `${fmtInt(sig(r / 1000, 4))} km`;
  const v = speedAt(r);
  $("speed").textContent = v < 5 ? "Distance to the Moon" : `Falling at ${fmtInt(sig(v, 3))} km/h`;
  const next = MILESTONES.find((m) => m[1] > fallH + 1e-6);
  $("next-name").textContent = next ? next[0] : "Impact";
  $("next-eta").textContent = next ? `in ${fmtDuration(next[1] - fallH)}` : "now";
  soft($("next-block"), Math.min(...MILESTONE_T.map((tm) => smooth(0.05, 0.5, Math.abs(t - tm)))));
  $("elapsed").textContent = fmtDuration(fallH);
  $("rate").textContent = fmtRate(t < 5 ? 1 : rate);
  $("tide").textContent = `${tideFactor(r).toFixed(1)}× normal`;
  soft($("tide-box"), smooth(27.3, 28.1, t) * (1 - smooth(32.9, 33.6, t)));
  soft($("hud-wrap"), smooth(4.2, 5.6, t) * (1 - smooth(53.9, 54.2, t)));
  reveal(titleWords, t, 0.4, 5.0, 0.09, 0.9);
  captions(t);
  $("end-card").style.opacity = String(smooth(55.6, 56.6, t));
  reveal(endBig, t, 56.0, null, 0.1, 1.0);
  reveal(endSub, t, 57.2, null, 0.07, 0.9);
  soft($("end-title"), smooth(58.2, 59.2, t));
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(window.__hfThreeTime || 0);
