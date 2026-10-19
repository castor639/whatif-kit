// Space: a star field with a Milky Way band, procedurally painted planets, the Sun, rings,
// and a black hole with an accretion disk. Everything is seeded and built once at load.
import * as THREE from "three";
import { mulberry32, smooth, clamp01, lerp } from "./util.js";
import { SOFT_DOT } from "./look.js";

// ---------- seeded value noise ----------
function noise3(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = Float32Array.from({ length: 256 }, () => r());
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const zf = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf,
    );
  };
}
export function fbm(seed, octaves = 5) {
  const n = noise3(seed);
  return (x, y, z) => {
    let a = 0.5;
    let f = 1;
    let s = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * n(x * f, y * f, z * f);
      f *= 2.03;
      a *= 0.5;
    }
    return s / (1 - Math.pow(0.5, octaves));
  };
}

// Paint an equirectangular texture by sampling a function of the unit-sphere direction.
function paint(w, h, fn, { srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat);
    const sy = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      const [r, g, b] = fn(Math.cos(lon) * cl, sy, Math.sin(lon) * cl, lat, lon);
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, g * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- star field ----------
export function makeStarfield(seed = 3, { count = 6000, radius = 5e4, milkyWay = true, size = 2.2 } = {}) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const g = new THREE.BufferGeometry();
  const pos = [];
  const col = [];
  const bandN = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
  for (let i = 0; i < count; i++) {
    let v;
    // a third of stars crowd toward the galactic band
    for (;;) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      v = new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th));
      if (i % 3 || Math.abs(v.dot(bandN)) < 0.18 + rand() * 0.2) break;
    }
    pos.push(v.x * radius, v.y * radius, v.z * radius);
    const b = Math.pow(rand(), 4) * 3 + 0.12;
    const temp = rand();
    col.push(b * (temp > 0.8 ? 1.0 : 0.85 + temp * 0.2), b * (0.9 + temp * 0.1), b * (temp < 0.25 ? 1.0 : 1.15 - temp * 0.3));
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(stars);
  if (milkyWay) {
    const n = fbm(seed + 1, 6);
    const tex = paint(1024, 512, (x, y, z) => {
      const d = Math.abs(x * bandN.x + y * bandN.y + z * bandN.z);
      const band = Math.exp(-Math.pow(d / 0.11, 2));
      const dust = n(x * 11, y * 11, z * 11);
      const lanes = smooth(0.45, 0.62, n(x * 14 + 3, y * 14, z * 14));
      const v = band * (0.35 + dust * 0.8) * (1 - lanes * 0.7 * band);
      return [v * 0.55, v * 0.5, v * 0.62];
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
    group.add(sky);
  }
  group.userData.stars = stars;
  return group;
}

// ---------- planets ----------
const PLANET_STYLES = {
  earth(seed) {
    const n = fbm(seed, 6);
    const c = fbm(seed + 9, 5);
    return (x, y, z, lat) => {
      const h = n(x * 2.2, y * 2.2, z * 2.2) + (c(x * 8, y * 8, z * 8) - 0.5) * 0.12;
      const ice = smooth(0.78, 0.86, Math.abs(Math.sin(lat)) + (n(x * 5, y * 5, z * 5) - 0.5) * 0.1);
      if (h < 0.5) return mix3(mix3([0.03, 0.12, 0.3], [0.08, 0.3, 0.5], smooth(0.35, 0.5, h)), [0.9, 0.93, 0.97], ice);
      const dry = smooth(0.55, 0.7, h) * (1 - Math.abs(Math.sin(lat)) * 0.6);
      const land = mix3(mix3([0.18, 0.36, 0.14], [0.55, 0.47, 0.3], dry), [0.45, 0.42, 0.38], smooth(0.72, 0.85, h));
      return mix3(land, [0.92, 0.94, 0.97], ice);
    };
  },
  clouds(seed) {
    const n = fbm(seed + 21, 6);
    return (x, y, z) => {
      const v = smooth(0.48, 0.7, n(x * 3, y * 5, z * 3));
      return [v, v, v];
    };
  },
  gas(seed, { palette = [[0.85, 0.72, 0.55], [0.62, 0.42, 0.28], [0.92, 0.86, 0.76], [0.7, 0.55, 0.42]], spot = true } = {}) {
    const n = fbm(seed, 5);
    return (x, y, z, lat, lon) => {
      const warp = (n(x * 3, y * 3, z * 3) - 0.5) * 0.25;
      const b = Math.sin((y + warp) * 18) * 0.5 + 0.5;
      const L = palette.length;
      const k = ((Math.floor((y + warp + 1) * 6) % L) + L) % L;
      let col = mix3(palette[k], palette[(k + 1) % palette.length], b);
      col = mix3(col, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], n(x * 12, y * 30, z * 12) * 0.5);
      if (spot) {
        const dLat = (lat + 0.38) / 0.09;
        const dLon = (((lon - 2.0 + Math.PI) % (Math.PI * 2)) - Math.PI) / 0.2;
        const s = Math.exp(-(dLat * dLat + dLon * dLon));
        col = mix3(col, [0.75, 0.32, 0.2], s * 0.9);
      }
      return col;
    };
  },
  rock(seed, { base = [0.62, 0.36, 0.22], dark = [0.35, 0.2, 0.13] } = {}) {
    const n = fbm(seed, 6);
    const r = mulberry32(seed + 5);
    const craters = Array.from({ length: 40 }, () => {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      return [s * Math.cos(th), u, s * Math.sin(th), 0.02 + r() * 0.08];
    });
    return (x, y, z) => {
      let col = mix3(dark, base, n(x * 3, y * 3, z * 3));
      for (const [cx, cy, cz, cr] of craters) {
        const d = Math.hypot(x - cx, y - cy, z - cz) / cr;
        if (d < 1.3) col = mix3(col, d < 1 ? [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75] : [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15], d < 1 ? 1 - d * 0.3 : 1.3 - d);
      }
      return col;
    };
  },
  ice(seed, { tint = [0.55, 0.82, 0.9] } = {}) {
    const n = fbm(seed, 4);
    return (x, y, z) => {
      const v = 0.85 + Math.sin(y * 9 + n(x * 2, y * 2, z * 2) * 2) * 0.06;
      return [tint[0] * v, tint[1] * v, tint[2] * v];
    };
  },
  lava(seed) {
    const n = fbm(seed, 6);
    return (x, y, z) => {
      const v = n(x * 4, y * 4, z * 4);
      const crack = smooth(0.48, 0.5, v) * (1 - smooth(0.5, 0.53, v));
      return mix3([0.08, 0.06, 0.05], [1.0, 0.45, 0.1], crack * 1.2);
    };
  },
};

function atmosphere(radius, color, strength = 1.0) {
  const group = new THREE.Group();
  const uniforms = { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uSun: { value: new THREE.Vector3(1, 0, 0) } };
  const vs = `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const limb = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.015, 96, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: vs,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - clamp(dot(v, vN), 0.0, 1.0), 3.0);
          float lit = smoothstep(-0.25, 0.45, dot(vN, normalize(uSun)));
          gl_FragColor = vec4(uColor * f * lit * 1.4 * uStrength, 1.0); }`,
    }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.07, 96, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: vs,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(clamp(dot(v, -vN), 0.0, 1.0), 4.0);
          float lit = smoothstep(-0.3, 0.5, dot(-vN, normalize(uSun)) * -1.0 + 0.2);
          gl_FragColor = vec4(uColor * f * lit * 0.9 * uStrength, 1.0); }`,
    }),
  );
  group.add(limb, halo);
  group.userData.uniforms = uniforms;
  return group;
}

// type: earth | gas | rock | ice | lava. Returns { group, body, setSun(dirWorld) }.
export function makePlanet({ type = "rock", radius = 1, seed = 1, atmosphereColor = null, clouds = type === "earth", nightLights = type === "earth", res = 1024, styleOpts = {} } = {}) {
  const group = new THREE.Group();
  const map = paint(res, res / 2, PLANET_STYLES[type](seed, styleOpts));
  const matOpts = { map, roughness: type === "gas" || type === "ice" ? 0.9 : 1.0, metalness: 0 };
  if (type === "lava") Object.assign(matOpts, { emissiveMap: map, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.2 });
  if (nightLights) {
    const n = fbm(seed + 77, 5);
    const land = fbm(seed, 6);
    const lights = paint(res, res / 2, (x, y, z, lat) => {
      const h = land(x * 2.2, y * 2.2, z * 2.2);
      const v = h > 0.52 && Math.abs(lat) < 1.1 ? smooth(0.62, 0.75, n(x * 22, y * 22, z * 22)) : 0;
      return [v * 1.0, v * 0.75, v * 0.4];
    });
    Object.assign(matOpts, { emissiveMap: lights, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 });
  }
  const sunU = { value: new THREE.Vector3(1, 0, 0) };
  const bodyMat = new THREE.MeshStandardMaterial(matOpts);
  if (nightLights) {
    bodyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSunDir = sunU;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uSunDir; varying float vSunDot;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSunDot = dot(normalize(mat3(modelMatrix) * objectNormal), normalize(uSunDir));");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vSunDot;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= smoothstep(0.12, -0.18, vSunDot);");
    };
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), bodyMat);
  group.add(body);
  let cloudMesh = null;
  if (clouds) {
    const cm = paint(res, res / 2, PLANET_STYLES.clouds(seed), { srgb: false });
    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 96, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: cm, transparent: true, depthWrite: false, roughness: 1 }));
    group.add(cloudMesh);
  }
  const atmo = atmosphereColor ? atmosphere(radius, atmosphereColor) : null;
  if (atmo) group.add(atmo);
  return {
    group,
    body,
    clouds: cloudMesh,
    atmosphere: atmo,
    // night-side city lights fade in where the sun is down
    setSun(dir, nightLightAmt = 1) {
      if (atmo) atmo.userData.uniforms.uSun.value.copy(dir);
      sunU.value.copy(dir);
      if (nightLights) body.material.emissiveIntensity = 1.3 * nightLightAmt;
    },
  };
}

export function makeRings({ inner = 1.4, outer = 2.4, seed = 4, color = [0.85, 0.78, 0.66], opacity = 0.9 } = {}) {
  const n = fbm(seed, 4);
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 4;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(1024, 4);
  for (let x = 0; x < 1024; x++) {
    const f = x / 1023;
    const a = clamp01(n(f * 40, 0.3, 0.7) * 1.4 - 0.25) * smooth(0, 0.05, f) * (1 - smooth(0.92, 1, f)) * (f > 0.62 && f < 0.66 ? 0.15 : 1);
    for (let y = 0; y < 4; y++) {
      const i = (y * 1024 + x) * 4;
      img.data[i] = color[0] * 255;
      img.data[i + 1] = color[1] * 255;
      img.data[i + 2] = color[2] * 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.RingGeometry(inner, outer, 256, 1);
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// ---------- the Sun ----------
export function makeSun({ radius = 1, seed = 8, color = 0xfff1d6, intensity = 4 } = {}) {
  const group = new THREE.Group();
  const n = fbm(seed, 5);
  const map = paint(512, 256, (x, y, z) => {
    const g = n(x * 30, y * 30, z * 30);
    const v = 0.85 + g * 0.3;
    return [v, v * 0.82, v * 0.55];
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true }));
  group.add(body);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT_DOT, color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(intensity * 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  corona.scale.setScalar(radius * 6);
  group.add(corona);
  const light = new THREE.PointLight(color, 3, 0, 0);
  group.add(light);
  return { group, body, corona, light };
}

// ---------- black hole ----------
// Horizon radius rs in scene units. The disk is beamed brighter on the side moving toward the
// camera. Pair it with look.lens (a screen-space point-mass lens) for the bent background.
export function makeBlackHole({ rs = 1, inner = 3, outer = 11, seed = 12 } = {}) {
  const group = new THREE.Group();
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(rs, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  group.add(horizon);
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(rs * inner, rs * outer, 256, 8),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uIn: { value: rs * inner }, uOut: { value: rs * outer }, uGain: { value: 1.6 }, uSeed: { value: seed } },
      vertexShader: `varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform float uIn; uniform float uOut; uniform float uGain; uniform float uSeed; varying vec2 vP; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + uSeed) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float r = length(vP); float a = atan(vP.y, vP.x);
          float x = (r - uIn) / (uOut - uIn);
          float spin = uTime * 0.6 / pow(max(r / uIn, 1.0), 1.5);
          float streak = n(vec2((a + spin) * 6.0, r * 2.2)) * 0.6 + n(vec2((a + spin) * 22.0, r * 7.0)) * 0.4;
          float glow = pow(1.0 - clamp(x, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.04, x);
          vec3 hot = vec3(1.0, 0.95, 0.85), warm = vec3(1.0, 0.6, 0.22), cool = vec3(0.7, 0.18, 0.05);
          vec3 col = mix(hot, mix(warm, cool, smoothstep(0.3, 1.0, x)), smoothstep(0.0, 0.35, x));
          vec3 tang = normalize(vec3(-sin(a), 0.0, cos(a)));
          float toward = dot(tang, normalize(cameraPosition - vW));
          float beam = pow(1.0 + 0.75 * toward, 2.5);
          gl_FragColor = vec4(col * glow * (0.55 + streak) * beam * uGain, 1.0);
        }`,
    }),
  );
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT_DOT, color: new THREE.Color(1.6, 1.2, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.scale.setScalar(rs * 2.9);
  group.add(ring);
  return {
    group,
    disk,
    rs,
    update(t) {
      disk.material.uniforms.uTime.value = t;
    },
  };
}

// Glowing asteroid or debris rock.
export function makeRock({ radius = 1, seed = 5, detail = 2, color = 0x6b625a } = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const n = fbm(seed, 4);
  const p = geo.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    v.multiplyScalar(0.78 + n(d.x * 2.5 + 3, d.y * 2.5, d.z * 2.5) * 0.45);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 }));
}
