// The Moon, built from chunks so tides can pull it apart.
import * as THREE from "three";
import { clamp01, smooth } from "./engine/util.js";

export function makeMoon(rand) {
  const group = new THREE.Group();
  const chunks = [];
  const base = new THREE.IcosahedronGeometry(1, 4);
  const pos = base.getAttribute("position");
  const K = 46;
  const seeds = [];
  for (let i = 0; i < K; i++) {
    const y = 1 - (2 * (i + 0.5)) / K;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963 + rand() * 0.5;
    seeds.push(new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th)).normalize());
  }
  const maria = (v) => Math.sin(v.x * 3.1 + 1.2) * Math.cos(v.y * 2.7 - 0.4) + Math.sin(v.z * 4.3 + v.x * 1.7) * 0.6 + Math.cos(v.y * 6.1 + v.z * 2.2) * 0.25;
  const groups = Array.from({ length: K }, () => []);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    const cen = a.clone().add(b).add(c).divideScalar(3).normalize();
    const probe = cen.clone().add(new THREE.Vector3(Math.sin(cen.y * 9) * 0.12, Math.cos(cen.z * 8) * 0.12, Math.sin(cen.x * 7) * 0.12)).normalize();
    let best = 0;
    let bd = -2;
    for (let k = 0; k < K; k++) {
      const d = probe.dot(seeds[k]);
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    groups[best].push([a.clone(), b.clone(), c.clone(), cen]);
  }
  groups.forEach((tris) => {
    if (!tris.length) return;
    const center = new THREE.Vector3();
    tris.forEach((tr) => center.add(tr[3]));
    center.normalize();
    const inner = center.clone().multiplyScalar(0.25);
    const verts = [];
    const cols = [];
    const tone = 0.86 + rand() * 0.1;
    const push = (v, col) => {
      verts.push(v.x - center.x, v.y - center.y, v.z - center.z);
      cols.push(col[0], col[1], col[2]);
    };
    tris.forEach(([p, q, r, cen]) => {
      const crater = Math.sin(cen.x * 23) * Math.sin(cen.y * 19) * Math.sin(cen.z * 21) > 0.55 ? 0.82 : 1;
      const g = (maria(cen) > 0.55 ? 0.5 : 0.78) * tone * crater;
      const surf = [g, g * 0.985, g * 0.96];
      const rock = [0.2, 0.17, 0.15];
      push(p, surf);
      push(q, surf);
      push(r, surf);
      for (const [u, v] of [[p, q], [q, r], [r, p]]) {
        push(u, rock);
        push(inner, rock);
        push(v, rock);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, emissive: new THREE.Color(0xff5a1f), emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    group.add(mesh);
    chunks.push({
      mesh,
      home: center.clone(),
      drift: 0.35 + rand() * 0.9,
      lag: rand(),
      spinAxis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      spin: (rand() - 0.5) * 4,
    });
  });
  const DEBRIS = 900;
  const dGeo = new THREE.BufferGeometry();
  const dDir = [];
  for (let i = 0; i < DEBRIS; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    dDir.push([r * Math.cos(th), u, r * Math.sin(th), 0.6 + rand() * 1.8, rand()]);
  }
  dGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DEBRIS * 3), 3));
  const dMat = new THREE.PointsMaterial({ color: 0xd8cfc4, size: 4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  group.add(new THREE.Points(dGeo, dMat));
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  // b: breakup progress, stretch: unit axis in group space, spread/pull: shape of the stream
  function update(b, stretch, spread, pull, glow, flatten) {
    chunks.forEach((ch) => {
      const local = Math.pow(clamp01((b - ch.lag * 0.35) / (1 - ch.lag * 0.35)), 1.6);
      const along = ch.home.dot(stretch);
      tmp.copy(ch.home).multiplyScalar(1 + local * ch.drift * spread);
      tmp.addScaledVector(stretch, along * local * pull);
      if (flatten) tmp.z = ch.home.z * (1 + local * 0.15);
      ch.mesh.position.copy(tmp);
      q.setFromAxisAngle(ch.spinAxis, local * ch.spin);
      ch.mesh.quaternion.copy(q);
      ch.mesh.material.emissiveIntensity = glow * (0.25 + 0.4 * ch.lag);
    });
    const dp = dGeo.getAttribute("position");
    dDir.forEach((d, i) => {
      const k = Math.pow(clamp01((b - d[4] * 0.3) / 0.7), 1.3) * d[3] * 3.2;
      const s = stretch;
      const al = (d[0] * s.x + d[1] * s.y + d[2] * s.z) * k * pull * 0.5;
      dp.setXYZ(i, d[0] * (1 + k * 0.6) + s.x * al, d[1] * (1 + k * 0.6) + s.y * al, d[2] * (1 + k * 0.6) + s.z * al);
    });
    dp.needsUpdate = true;
    dMat.opacity = smooth(0.0, 0.25, b);
  }
  return { group, update };
}
