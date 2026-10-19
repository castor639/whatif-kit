// Places a person can stand in. Each returns a scene, a camera at eye height, and update(state)
// that lights it from the shutter-averaged sun (state from look.lightState).
import * as THREE from "three";
import { clamp01, lerp, smooth } from "./util.js";
import { SOFT_DOT } from "./look.js";

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.92, ...extra });

function rig(scene, { shadowSize = 40, fog = 0.0011 } = {}) {
  scene.fog = new THREE.FogExp2(0x8899aa, fog);
  const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x3b4a2a, 1);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  const moonFill = new THREE.DirectionalLight(0x9db4e8, 0);
  moonFill.position.set(-30, 60, -80);
  scene.add(hemi, sun, sun.target, moonFill);
  const lamps = [];
  const glowMats = [];
  const windowMats = [];
  return {
    hemi,
    sun,
    moonFill,
    lamps,
    glowMats,
    windowMats,
    fogBase: fog,
    // extraNight lets a video brighten nights (a close Moon, an aurora)
    apply(state, camPos, { extraNight = 0, extraNightColor = new THREE.Color(0x9db4e8) } = {}) {
      const { day, night, golden, sunUp } = state;
      sun.position.copy(camPos).addScaledVector(sunUp, 150);
      sun.target.position.set(camPos.x, 0, camPos.z - 20);
      sun.intensity = 2.6 * day * smooth(-0.02, 0.08, sunUp.y);
      sun.color.setRGB(1, 0.86 - golden * 0.25, 0.7 - golden * 0.35);
      hemi.intensity = 0.32 + 1.0 * day + extraNight * 0.6;
      hemi.color.setRGB(0.55 + 0.25 * day + golden * 0.3, 0.62 + 0.25 * day, 0.85 + 0.1 * day - golden * 0.2);
      hemi.groundColor.setRGB(0.18, 0.2, 0.12);
      moonFill.intensity = 0.55 * night + extraNight * 2.2 * night;
      moonFill.color.copy(extraNightColor);
      scene.fog.color.setRGB(lerp(0.05, 0.5, day) + golden * 0.4, lerp(0.07, 0.6, day) + golden * 0.12, lerp(0.14, 0.78, day) - golden * 0.2);
      scene.fog.density = this.fogBase * lerp(1.45, 0.5, day);
      const on = clamp01(night * 1.4 - 0.2) * (this.power ?? 1);
      lamps.forEach((l) => (l.intensity = 30 * on));
      glowMats.forEach((m) => m.color.setRGB(3.0 * on, 2.4 * on, 1.5 * on));
      windowMats.forEach((m, i) => m.color.setRGB((i % 3 ? 1.6 : 0.3) * on, (i % 3 ? 1.1 : 0.2) * on, (i % 3 ? 0.5 : 0.1) * on));
    },
  };
}

function adder(scene) {
  return (geo, mat, x, y, z, ry = 0, shadows = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    scene.add(m);
    return m;
  };
}

function grassPlane(size, seg, base = [0.2, 0.38, 0.14]) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute("position");
  const c = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.5 + Math.sin(x * 0.31 + z * 0.17) * 0.25;
    c.push(base[0] + n * 0.04, base[1] + n * 0.06, base[2] + n * 0.03);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

function tree(add, rand, x, y, z, s, palette) {
  add(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.6 * s, 6), flat(0x3e2c1e), x, y + 1.3 * s, z);
  const col = palette[Math.floor(rand() * palette.length)];
  add(new THREE.IcosahedronGeometry(1.5 * s, 0), flat(col), x, y + 3.2 * s, z, rand() * 3).scale.y = 1.15;
  if (s > 0.9) add(new THREE.IcosahedronGeometry(0.9 * s, 0), flat(col), x + 0.7 * s, y + 2.7 * s, z + 0.3 * s, rand() * 3);
}
export const AUTUMN = [0x8a5a22, 0x9b6a26, 0x7a4a1a, 0xa8742c, 0x5d7a2e];
export const SUMMER = [0x4f7a2e, 0x5d8a34, 0x3f6b28, 0x6b8f3a];

function skyline(scene, rand, { x0 = -200, z0 = -900, count = 160, glowList }) {
  const cityMat = flat(0x59606b);
  for (let i = 0; i < count; i++) {
    const core = Math.exp(-Math.pow((i - count / 2) / (count * 0.21), 2));
    const x = x0 + i * 3.6 + (rand() - 0.5) * 2;
    const h = 6 + rand() * 18 + core * (30 + rand() * 70);
    const w = 2.5 + rand() * 4;
    const z = z0 - rand() * 60;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), cityMat);
    b.position.set(x, h / 2, z);
    scene.add(b);
    if (rand() < 0.55) {
      const wm = new THREE.MeshBasicMaterial({ color: 0x000000 });
      glowList.push(wm);
      const p = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.7, 0.2), wm);
      p.position.set(x, h * 0.45, z + w / 2 + 0.15);
      scene.add(p);
    }
  }
}

function floaters(scene, rand, { count = 140, color = 0xffa24a, size = 0.12 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = Array.from({ length: count }, () => [rand() * 30 - 12, rand() * 7, -6 - rand() * 40, rand()]);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: SOFT_DOT, transparent: true, depthWrite: false, opacity: 0.85 }));
  scene.add(pts);
  return {
    points: pts,
    update(t, origin) {
      const p = geo.getAttribute("position");
      seed.forEach((s, i) => {
        const fall = (s[1] - ((t * (0.35 + s[3] * 0.3)) % 7) + 7) % 7;
        p.setXYZ(i, origin.x + s[0] + Math.sin(t * 0.8 + i) * 0.6 + t * 0.15, origin.y - 1.7 + fall, origin.z + s[2]);
      });
      p.needsUpdate = true;
    },
  };
}

const camFor = (look) => new THREE.PerspectiveCamera(look.FOV, look.W / look.H, 0.1, 3000);

// A suburban street: sidewalk, bench, road, lamps, houses, distant skyline.
export function buildStreet(look, rand, { palette = AUTUMN } = {}) {
  const scene = new THREE.Scene();
  const L = rig(scene);
  const add = adder(scene);
  scene.add(grassPlane(1200, 120));
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 1400), flat(0x3a3b40, { roughness: 0.7 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(7.2, 0.02, -650);
  road.receiveShadow = true;
  scene.add(road);
  add(new THREE.BoxGeometry(2.6, 0.12, 1400), flat(0x9a968e), 1.3, 0.06, -650);
  add(new THREE.BoxGeometry(0.25, 0.18, 1400), flat(0xb9b4aa), 2.65, 0.09, -650);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd9b54a, emissive: 0x2a2208 });
  for (let z = 4; z > -900; z -= 9) add(new THREE.BoxGeometry(0.16, 0.03, 4.2), lineMat, 7.2, 0.04, z, 0, false);
  const poleMat = flat(0x2c2e33);
  for (let i = 0; i < 18; i++) {
    const z = -22 - i * 26;
    add(new THREE.BoxGeometry(0.16, 6.2, 0.16), poleMat, 2.3, 3.1, z);
    add(new THREE.BoxGeometry(1.9, 0.12, 0.16), poleMat, 3.2, 6.15, z);
    const gm = new THREE.MeshBasicMaterial({ color: 0x000000 });
    L.glowMats.push(gm);
    add(new THREE.BoxGeometry(0.7, 0.16, 0.34), gm, 4.05, 6.05, z, 0, false);
    if (i < 4) {
      const pl = new THREE.PointLight(0xffc27a, 0, 22, 1.6);
      pl.position.set(4.05, 5.8, z);
      scene.add(pl);
      L.lamps.push(pl);
    }
  }
  tree(add, rand, -2.6, 0, -10, 1.05, palette);
  for (let i = 0; i < 80; i++) tree(add, rand, -8 - rand() * 140, 0, -10 - rand() * 440, 0.8 + rand() * 0.7, palette);
  for (let i = 0; i < 14; i++) tree(add, rand, 13.6 + rand() * 1.5, 0, -12 - i * 30 - rand() * 8, 1 + rand() * 0.4, palette);
  const benchMat = flat(0x5b3d26);
  add(new THREE.BoxGeometry(2.2, 0.1, 0.6), benchMat, -0.6, 0.62, -4.6);
  add(new THREE.BoxGeometry(2.2, 0.5, 0.08), benchMat, -0.6, 0.95, -4.88);
  add(new THREE.BoxGeometry(0.1, 0.62, 0.5), poleMat, -1.55, 0.31, -4.6);
  add(new THREE.BoxGeometry(0.1, 0.62, 0.5), poleMat, 0.35, 0.31, -4.6);
  const wallCols = [0xd8cbb4, 0xb9b2a6, 0xc7a98a, 0x9fb0b8];
  for (let i = 0; i < 16; i++) {
    const z = -14 - i * 24 - rand() * 6;
    const w = 7 + rand() * 3;
    const h = 4 + rand() * 1.5;
    const x = 22 + rand() * 2;
    add(new THREE.BoxGeometry(w, h, 8), flat(wallCols[i % 4]), x, h / 2, z);
    add(new THREE.CylinderGeometry(0.01, 6.2, 2.6, 4, 1), flat(0x5a3e33), x, h + 1.3, z, Math.PI / 4).scale.set(w / 8.6, 1, 1);
    for (let k = -1; k <= 1; k += 2) {
      const wm = new THREE.MeshBasicMaterial({ color: 0x000000 });
      L.windowMats.push(wm);
      add(new THREE.BoxGeometry(0.05, 1.2, 1.4), wm, x - w / 2 - 0.03, h * 0.55, z + k * 2, 0, false);
    }
  }
  skyline(scene, rand, { glowList: L.windowMats });
  const hillMat = flat(0x4b5a63);
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(120 + rand() * 120, 50 + rand() * 60, 6), hillMat);
    hill.position.set(-1100 + i * 260 + rand() * 80, 10, -1350 - rand() * 200);
    hill.scale.z = 0.5;
    scene.add(hill);
  }
  const leaves = floaters(scene, rand);
  const camera = camFor(look);
  const eye = new THREE.Vector3(0.3, 1.7, 0);
  return { name: "street", scene, camera, eye, yaw: -0.12, pitch: 12, rig: L, add, update(state, t) { L.apply(state, camera.position, this.night ?? {}); leaves.update(t, camera.position); } };
}

// A rooftop above the city: parapet, vents, a water tank, towers all around and a huge sky.
export function buildRooftop(look, rand) {
  const scene = new THREE.Scene();
  const L = rig(scene, { fog: 0.0009 });
  const add = adder(scene);
  const ROOF = 32;
  scene.add(grassPlane(3000, 60, [0.16, 0.22, 0.14]));
  add(new THREE.BoxGeometry(30, ROOF, 24), flat(0x8f8a82), 0, ROOF / 2, -6);
  add(new THREE.BoxGeometry(30, 0.2, 24), flat(0x6d6a66, { roughness: 1 }), 0, ROOF + 0.1, -6);
  const para = flat(0x9d968c);
  add(new THREE.BoxGeometry(30, 1.1, 0.35), para, 0, ROOF + 0.55, -17.8);
  add(new THREE.BoxGeometry(0.35, 1.1, 24), para, -14.8, ROOF + 0.55, -6);
  add(new THREE.BoxGeometry(0.35, 1.1, 24), para, 14.8, ROOF + 0.55, -6);
  const metal = flat(0x7c8084, { roughness: 0.6, metalness: 0.3 });
  add(new THREE.BoxGeometry(2.2, 1.4, 1.6), metal, -6, ROOF + 0.9, -9);
  add(new THREE.BoxGeometry(1.4, 1.0, 1.4), metal, 5.5, ROOF + 0.7, -12);
  add(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 10), flat(0x6b4a35), 9, ROOF + 4.4, -4);
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) add(new THREE.BoxGeometry(0.15, 2.8, 0.15), metal, 9 + dx, ROOF + 1.4, -4 + dz);
  add(new THREE.CylinderGeometry(0.05, 0.05, 7, 5), metal, -11, ROOF + 3.6, -14);
  const blink = new THREE.MeshBasicMaterial({ color: 0x000000 });
  add(new THREE.SphereGeometry(0.12, 8, 6), blink, -11, ROOF + 7.2, -14, 0, false);
  L.glowMats.push(blink);
  const towerCols = [0x6a6f78, 0x7d7a74, 0x5d6470, 0x8a8478, 0x4f5662];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 520;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r - 6;
    if (z > 30 && Math.abs(x) < 80) continue;
    // keep the view out over the city: nearby blocks sit below the roof, towers stand off to the sides
    const ahead = z < 0 && Math.abs(x) < 0.55 * Math.abs(z) + 40;
    const h = ahead || r < 160 ? 8 + rand() * 20 : 20 + rand() * 40 + (r > 300 ? rand() * 60 : 0);
    const w = 10 + rand() * 18;
    add(new THREE.BoxGeometry(w, h, w), flat(towerCols[i % 5]), x, h / 2, z, rand(), r < 200);
    const rows = Math.floor(h / 4);
    for (let k = 1; k < rows; k += 2) {
      const wm = new THREE.MeshBasicMaterial({ color: 0x000000 });
      L.windowMats.push(wm);
      const face = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.9, 0.2), wm);
      face.position.set(x, k * 4, z + w / 2 + 0.15);
      face.rotation.y = 0;
      scene.add(face);
    }
  }
  skyline(scene, rand, { x0: -400, z0: -1500, count: 220, glowList: L.windowMats });
  const camera = camFor(look);
  const eye = new THREE.Vector3(0, ROOF + 1.7, -14.5);
  return { name: "rooftop", scene, camera, eye, yaw: 0.05, pitch: 14, rig: L, add, roof: ROOF, update(state, t) { L.apply(state, camera.position, this.night ?? {}); } };
}

// An open field: meadow, fence, a lake, a few trees and mountains. The most sky of any place.
export function buildField(look, rand, { palette = SUMMER } = {}) {
  const scene = new THREE.Scene();
  const L = rig(scene, { fog: 0.0008 });
  const add = adder(scene);
  const g = grassPlane(3000, 160, [0.22, 0.4, 0.16]);
  const gp = g.geometry.getAttribute("position");
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const roll = Math.sin(x * 0.012) * 3 + Math.cos(z * 0.009 + 1) * 4;
    gp.setY(i, Math.max(0, roll) * smooth(40, 200, Math.hypot(x, z)));
  }
  g.geometry.computeVertexNormals();
  scene.add(g);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: 0x3b5d78, roughness: 0.15, metalness: 0.4 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(60, 0.08, -320);
  lake.scale.set(1.8, 0.6, 1);
  lake.receiveShadow = true;
  scene.add(lake);
  const wood = flat(0x6b4a2e);
  for (let i = 0; i < 12; i++) {
    const x = -14 + i * 3;
    add(new THREE.BoxGeometry(0.16, 1.2, 0.16), wood, x, 0.6, -7 - i * 0.4);
    if (i < 11) {
      const rail = add(new THREE.BoxGeometry(3.05, 0.1, 0.08), wood, x + 1.5, 0.95, -7.2 - i * 0.4);
      rail.rotation.y = Math.atan2(0.4, 3);
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = (rand() - 0.5) * 2.6;
    const r = 25 + rand() * 260;
    tree(add, rand, Math.sin(a) * r, 0, -Math.cos(a) * r, 0.9 + rand() * 0.8, palette);
  }
  const mtn = flat(0x5a6670);
  const snow = flat(0xe8eef4);
  for (let i = 0; i < 12; i++) {
    const x = -1600 + i * 300 + rand() * 120;
    const h = 220 + rand() * 260;
    const m = new THREE.Mesh(new THREE.ConeGeometry(260 + rand() * 160, h, 6), mtn);
    m.position.set(x, h / 2 - 20, -1700 - rand() * 300);
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(70, h * 0.22, 6), snow);
    cap.position.set(x, h - 20 - h * 0.11 + 2, m.position.z);
    scene.add(cap);
  }
  const flies = floaters(scene, rand, { count: 90, color: 0xfff1a0, size: 0.08 });
  const camera = camFor(look);
  const eye = new THREE.Vector3(0, 1.7, 0);
  return { name: "field", scene, camera, eye, yaw: 0.0, pitch: 16, rig: L, add, lake, update(state, t) { L.apply(state, camera.position, this.night ?? {}); flies.points.material.opacity = 0.9 * state.night; flies.update(t, camera.position); } };
}

// A beach with a pier; tideLevel(t) lets a video raise and drop the sea.
export function buildBeach(look, rand, { tideLevel = () => -0.45 } = {}) {
  const scene = new THREE.Scene();
  const L = rig(scene, { fog: 0.0009 });
  const add = adder(scene);
  const sandY = (x, z) => 0.3 + 0.05 * z + Math.sin(x * 0.21) * 0.08 + Math.cos(z * 0.33 + x * 0.1) * 0.05;
  const sandGeo = new THREE.PlaneGeometry(500, 160, 60, 24);
  sandGeo.rotateX(-Math.PI / 2);
  const sp = sandGeo.getAttribute("position");
  for (let i = 0; i < sp.count; i++) sp.setY(i, sandY(sp.getX(i), sp.getZ(i) - 40));
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, flat(0xd8bf8c));
  sand.position.z = -40;
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 110, 110), new THREE.MeshStandardMaterial({ color: 0x2c7290, flatShading: true, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.95 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, -600);
  sea.receiveShadow = true;
  const seaBase = Float32Array.from(sea.geometry.getAttribute("position").array);
  scene.add(sea);
  const wood = flat(0x6b4a2e);
  for (let z = 6; z >= -46; z -= 4) {
    for (const x of [3.6, 5.6]) add(new THREE.BoxGeometry(0.22, 4, 0.22), wood, x, -0.6, z);
    add(new THREE.BoxGeometry(2.6, 0.16, 4), flat(0x8a6440), 4.6, 1.1, z - 2);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  L.glowMats.push(lampMat);
  add(new THREE.ConeGeometry(28, 16, 7), flat(0x55603f), -42, 2, -95);
  add(new THREE.CylinderGeometry(1.3, 1.8, 13, 8), flat(0xf2efe8), -40, 15.5, -92);
  add(new THREE.CylinderGeometry(1.42, 1.5, 2.2, 8), flat(0xb8382c), -40, 13, -92);
  add(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 8), lampMat, -40, 22.8, -92, 0, false);
  add(new THREE.ConeGeometry(1.5, 1.8, 8), flat(0xb8382c), -40, 24.5, -92);
  const hutMats = [flat(0x4f8fb5), flat(0xe0c76a), flat(0xd77a62)];
  for (let i = 0; i < 5; i++) {
    const x = 12 + i * 4.2;
    const z = -2 - i * 1.6;
    const y = sandY(x, z);
    add(new THREE.BoxGeometry(3, 3.2, 3), hutMats[i % 3], x, y + 1.6, z, -0.3);
    add(new THREE.ConeGeometry(2.6, 1.5, 4), flat(0x7b4a32), x, y + 3.9, z, Math.PI / 4 - 0.3);
  }
  for (const [x, z] of [[-6, 2], [-11, -4], [9, 4]]) {
    const y = sandY(x, z);
    add(new THREE.CylinderGeometry(0.16, 0.26, 6, 5), flat(0x7a5a3a), x, y + 3, z).rotation.z = 0.12;
    for (let k = 0; k < 6; k++) {
      const leaf = add(new THREE.ConeGeometry(0.5, 3.4, 3), flat(0x3f7a33), x + 0.36, y + 6, z, (k / 6) * Math.PI * 2);
      leaf.rotation.z = 1.2;
      leaf.rotation.order = "YZX";
    }
  }
  const camera = camFor(look);
  const eye = new THREE.Vector3(0, 1.8, -4);
  return {
    name: "beach",
    scene,
    camera,
    eye,
    yaw: -0.12,
    pitch: 8,
    rig: L,
    add,
    tideLevel,
    update(state, t, simH) {
      L.apply(state, camera.position, this.night ?? {});
      const level = this.tideLevel(simH, t);
      const p = sea.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = seaBase[i * 3];
        const y = seaBase[i * 3 + 1];
        const near = Math.exp(-Math.max(0, -y - 560) / 400);
        p.setZ(i, level + (Math.sin(x * 0.18 + t * 1.6) * 0.12 + Math.sin(y * 0.23 - t * 2.1 + x * 0.05) * 0.16) * (0.5 + near));
      }
      p.needsUpdate = true;
      sea.geometry.computeVertexNormals();
    },
  };
}
