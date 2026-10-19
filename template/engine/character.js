// A low-poly person for third-person shots, in the same faceted style as the places.
// pose(t, name, opts) drives breathing, looking, walking, jumping, floating and pointing.
import * as THREE from "three";
import { smooth, clamp01, lerp } from "./util.js";

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

function limb(len, r0, r1, mat, bulk = 1) {
  r0 *= bulk;
  r1 *= bulk;
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

// palette: { jacket, pants, skin, hair, shoes } or astronaut: true
export function makePerson({ jacket = 0x3d5a80, pants = 0x2b2d42, skin = 0xd9a77f, hair = 0x2a1d14, shoes = 0x1b1b1b, astronaut = false, scale = 1 } = {}) {
  const suit = flat(0xe8e6e1);
  const top = astronaut ? suit : flat(jacket);
  const bottom = astronaut ? suit : flat(pants);
  const skinM = flat(skin);
  const bulk = astronaut ? 1.7 : 1;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2), bottom);
  pelvis.castShadow = true;
  hips.add(pelvis);
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * (astronaut ? 1.35 : 1), 0.17 * (astronaut ? 1.3 : 1), 0.56, 8), top);
  torso.position.y = 0.3;
  torso.scale.z = 0.7;
  torso.castShadow = true;
  spine.add(torso);
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  spine.add(neck);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), astronaut ? suit : skinM);
  head.position.y = 0.14;
  head.scale.set(0.95, 1.1, 1);
  head.castShadow = true;
  neck.add(head);
  if (astronaut) {
    head.visible = false;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.45 }));
    helmet.position.y = 0.16;
    neck.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.245, 24, 16, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.28, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color: 0xc8962e, roughness: 0.12, metalness: 1.0, emissive: 0x3a2608, emissiveIntensity: 0.5 }));
    visor.position.y = 0.16;
    visor.rotation.y = Math.PI / 2 - Math.PI * 0.5;
    neck.add(visor);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 20), flat(0x9aa0a8));
    ringM.rotation.x = Math.PI / 2;
    ringM.position.y = -0.02;
    neck.add(ringM);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.26), suit);
    pack.position.set(0, 0.32, -0.27);
    spine.add(pack);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.04), flat(0x445066));
    panel.position.set(0, 0.36, 0.24);
    spine.add(panel);
  } else {
    const hairM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.135, 1), flat(hair));
    hairM.position.set(0, 0.19, -0.02);
    hairM.scale.set(1, 0.65, 1.05);
    neck.add(hairM);
  }
  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * s, 0.55, 0);
    spine.add(shoulder);
    const upper = limb(0.3, 0.06, 0.055, top, bulk);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    upper.add(elbow);
    const lower = limb(0.28, 0.05, 0.045, top, bulk);
    elbow.add(lower);
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 * (astronaut ? 1.7 : 1), 0), astronaut ? flat(0xd8d4cc) : skinM);
    hand.position.y = -0.31;
    lower.add(hand);
    return { shoulder: upper, elbow: lower, s };
  });
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(0.1 * s, -0.06, 0);
    hips.add(hip);
    const upper = limb(0.44, 0.085, 0.07, bottom, bulk);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    upper.add(knee);
    const lower = limb(0.42, 0.065, 0.055, bottom, bulk);
    knee.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1 * (astronaut ? 1.6 : 1), 0.07 * (astronaut ? 1.6 : 1), 0.22 * (astronaut ? 1.3 : 1)), flat(astronaut ? 0xcfcac2 : shoes));
    foot.position.set(0, -0.45, 0.05);
    lower.add(foot);
    return { hip: upper, knee: lower, s };
  });
  root.scale.setScalar(scale);

  const set = (o, x = 0, y = 0, z = 0) => o.rotation.set(x, y, z);

  // name: stand | lookUp | walk | jump | float | point | brace | sit
  function pose(t, name = "stand", { phase = 0, look = 0, amount = 1, lean = 0 } = {}) {
    const br = Math.sin(t * 1.3 + phase) * 0.02;
    hips.position.set(0, 0.95, 0);
    hips.rotation.set(0, 0, 0);
    set(spine, br + lean, 0, 0);
    set(neck, -look * 0.9, 0, 0);
    arms.forEach((a) => {
      set(a.shoulder, 0.05, 0, a.s * 0.08);
      set(a.elbow, -0.15);
    });
    legs.forEach((l) => {
      set(l.hip);
      set(l.knee);
    });
    if (name === "walk") {
      const w = (t * 6 + phase) % (Math.PI * 2);
      legs.forEach((l) => {
        set(l.hip, Math.sin(w + (l.s > 0 ? 0 : Math.PI)) * 0.5 * amount);
        set(l.knee, Math.max(0, -Math.sin(w + (l.s > 0 ? 0 : Math.PI) - 0.6)) * 0.8 * amount);
      });
      arms.forEach((a) => set(a.shoulder, -Math.sin(w + (a.s > 0 ? 0 : Math.PI)) * 0.4 * amount, 0, a.s * 0.08));
      hips.position.y = 0.95 + Math.abs(Math.cos(w)) * 0.03;
    } else if (name === "jump") {
      // phase in [0,1]: crouch, launch, airborne, land
      const p = clamp01(amount);
      const crouch = smooth(0, 0.18, p) * (1 - smooth(0.18, 0.3, p)) + smooth(0.85, 0.95, p) * (1 - smooth(0.95, 1, p));
      const air = Math.sin(clamp01((p - 0.25) / 0.6) * Math.PI);
      hips.position.y = 0.95 - crouch * 0.28 + air * 0.55;
      legs.forEach((l) => {
        set(l.hip, -crouch * 1.0 - air * 0.25);
        set(l.knee, crouch * 1.8 + air * 0.4);
      });
      arms.forEach((a) => set(a.shoulder, lerp(0.6 * crouch, -2.6, air), 0, a.s * (0.1 + air * 0.25)));
    } else if (name === "float") {
      hips.rotation.set(Math.sin(t * 0.3 + phase) * 0.25, Math.sin(t * 0.21) * 0.4, Math.sin(t * 0.17) * 0.3);
      arms.forEach((a, i) => set(a.shoulder, -0.4 + Math.sin(t * 0.5 + i) * 0.4, 0, a.s * (0.6 + Math.sin(t * 0.4 + i) * 0.3)));
      legs.forEach((l, i) => {
        set(l.hip, Math.sin(t * 0.45 + i * 2) * 0.35);
        set(l.knee, 0.3 + Math.sin(t * 0.6 + i) * 0.25);
      });
    } else if (name === "point") {
      const right = arms[1];
      set(right.shoulder, -1.4 - look * 0.6, 0, 0.15);
      set(right.elbow, -0.05);
    } else if (name === "brace") {
      set(spine, 0.35 + br, 0, 0);
      arms.forEach((a) => set(a.shoulder, -1.2, 0, a.s * 0.5));
      legs.forEach((l) => {
        set(l.hip, l.s * 0.3 - 0.2);
        set(l.knee, 0.4);
      });
    } else if (name === "sit") {
      hips.position.y = 0.52;
      legs.forEach((l) => {
        set(l.hip, -1.5);
        set(l.knee, 1.5);
      });
    }
  }
  pose(0);
  return { group: root, pose, head, astronaut };
}
