// The look: a scattering sky photographed as a long exposure, then tone mapped, bloomed and graded.
// Each frame averages several sub-moments of the sky over a shutter window, so the Sun, stars,
// clouds and anything else in the sky pass smear into trails the way a time-lapse camera sees them.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mulberry32, smooth, lerp } from "./util.js";

const BASE_EXP = 0.75;

// Default sun path in world space: rises behind-left, sets ahead-right (camera faces -z).
export function stylizedSun(h) {
  const f = (((h - 6) % 24) + 24) % 24;
  const azDeg = f <= 12 ? lerp(-150, 62, f / 12) : lerp(62, 210, (f - 12) / 12);
  const el = Math.sin(((h - 6) / 24) * Math.PI * 2) * THREE.MathUtils.degToRad(52);
  const az = THREE.MathUtils.degToRad(azDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

function softDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.75)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const SOFT_DOT = softDot();

function cloudTexture(seed) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  const r = mulberry32(seed);
  for (let i = 0; i < 70; i++) {
    const x = 30 + r() * 196;
    const y = 50 + (r() - 0.5) * 50 * Math.sin((x / 256) * Math.PI);
    const rad = 12 + r() * 30 * Math.sin((x / 256) * Math.PI);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, "rgba(255,255,255,0.20)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLook(canvas, opts = {}) {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const FOV = opts.fov ?? 72;
  const rand = mulberry32(opts.seed ?? 7);
  const look = { THREE, W, H, FOV, samples: opts.samples ?? 24, sunDir: opts.sunDir ?? stylizedSun };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = BASE_EXP;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  look.renderer = renderer;

  // ---------- sky ----------
  const skyScene = new THREE.Scene();
  const skyCam = new THREE.PerspectiveCamera(FOV, W / H, 10, 3e6);
  const sky = new Sky();
  sky.scale.setScalar(1e6);
  skyScene.add(sky);
  // the disc is drawn as a continuous trail below instead, so a fast Sun streaks rather than beads
  sky.material.fragmentShader = sky.material.fragmentShader.replace(/float sundisk = smoothstep\([^;]*\);/, "float sundisk = 0.0;");
  sky.material.needsUpdate = true;
  const su = sky.material.uniforms;
  su.turbidity.value = opts.turbidity ?? 4;
  su.rayleigh.value = opts.rayleigh ?? 1.5;
  su.mieCoefficient.value = 0.0024;
  su.mieDirectionalG.value = 0.8;

  const nightMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uAmt; uniform vec3 uTint; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(vec3(0.030,0.045,0.11), vec3(0.006,0.010,0.035), pow(h,0.6));
        gl_FragColor = vec4(c * uTint * uAmt, 1.0); }`,
  });
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(9e5, 48, 24), nightMat));

  const starGroup = new THREE.Group();
  const pole = (opts.pole ?? new THREE.Vector3(0.35, Math.sin(THREE.MathUtils.degToRad(40)), -0.75)).clone().normalize();
  {
    const g = new THREE.BufferGeometry();
    const pos = [];
    const col = [];
    for (let i = 0; i < 2600; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.push(r * Math.cos(th) * 8e5, u * 8e5, r * Math.sin(th) * 8e5);
      const b = Math.pow(rand(), 3) * 2.2 + 0.15;
      const warm = rand();
      col.push(b * (0.9 + warm * 0.2), b, b * (1.1 - warm * 0.25));
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    starGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  skyScene.add(starGroup);
  const starMat = starGroup.children[0].material;

  const clouds = [];
  const cloudCover = opts.clouds ?? 22;
  for (let i = 0; i < cloudCover; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTexture(100 + i), transparent: true, depthWrite: false, opacity: 0.75 });
    const s = new THREE.Sprite(mat);
    skyScene.add(s);
    clouds.push({ s, mat, az: (rand() - 0.5) * 2 * Math.PI, el: 0.05 + Math.pow(rand(), 1.6) * 0.5, w: 2.4e5 + rand() * 2.6e5, speed: 0.05 + rand() * 0.05 });
  }

  // anything a video wants photographed with the sky (moons, auroras, meteors) goes here
  const extras = new THREE.Group();
  skyScene.add(extras);
  skyScene.add(new THREE.HemisphereLight(0x8fa4c8, 0x2a2420, 0.25));
  const skyKey = new THREE.DirectionalLight(0xfff4e6, 3.0);
  skyScene.add(skyKey, skyKey.target);

  look.sky = { scene: skyScene, cam: skyCam, uniforms: su, stars: starGroup, extras, key: skyKey, night: nightMat };
  look.dayAmt = (sunY) => smooth(-0.12, 0.12, sunY);
  look.cloudOpacity = 0.75;
  look.starBoost = 1;

  look.setSky = (h) => {
    const d = look.sunDir(h);
    su.sunPosition.value.copy(d).multiplyScalar(4e5);
    const day = look.dayAmt(d.y);
    nightMat.uniforms.uAmt.value = 1 - smooth(-0.2, 0.05, d.y);
    starMat.opacity = (1 - smooth(-0.18, 0.02, d.y)) * look.starBoost;
    starGroup.quaternion.setFromAxisAngle(pole, (h / 23.934) * Math.PI * 2);
    const warm = 1 - smooth(0.0, 0.35, d.y);
    clouds.forEach((c) => {
      const az = c.az + h * c.speed;
      const R = 1.4e6;
      c.s.position.set(Math.sin(az) * Math.cos(c.el) * R, Math.sin(c.el) * R, -Math.cos(az) * Math.cos(c.el) * R);
      c.s.scale.set(c.w, c.w * 0.32, 1);
      const lit = 0.18 + 0.82 * day;
      c.mat.color.setRGB(lit * (1 + warm * 0.35), lit * (0.85 + 0.15 * (1 - warm)), lit * (0.8 + 0.2 * (1 - warm)));
      c.mat.opacity = look.cloudOpacity;
    });
    skyKey.position.copy(d).multiplyScalar(4e5);
    return d;
  };

  // ---------- sun trail: the Sun's path over the shutter, drawn as overlapping soft discs ----------
  const TRAIL = 96;
  const trailScene = new THREE.Scene();
  const trail = [];
  for (let i = 0; i < TRAIL; i++) {
    const m = new THREE.SpriteMaterial({ map: SOFT_DOT, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sp = new THREE.Sprite(m);
    trailScene.add(sp);
    trail.push(sp);
  }
  look.sunTrail = (h0, h1) => {
    const R = 5e5;
    const a = look.sunDir(h0);
    const b = look.sunDir(h1);
    const arcDeg = THREE.MathUtils.radToDeg(a.angleTo(b)) || 0;
    const sizeDeg = 1.1;
    const n = arcDeg < 0.3 ? 1 : TRAIL;
    const per = n === 1 ? 4.5 : 4.5 * Math.min(1, arcDeg / (n - 1) / (sizeDeg * 0.35));
    trail.forEach((sp, i) => {
      if (i >= n) {
        sp.visible = false;
        return;
      }
      const d = n === 1 ? b : look.sunDir(lerp(h0, h1, i / (n - 1)));
      sp.visible = d.y > -0.03;
      sp.position.copy(d).multiplyScalar(R);
      const sz = R * Math.tan(THREE.MathUtils.degToRad(sizeDeg)) * 2;
      sp.scale.set(sz, sz, 1);
      const low = 1 - smooth(0.0, 0.25, d.y);
      sp.material.color.setRGB(per, per * (0.92 - low * 0.25), per * (0.8 - low * 0.45));
      sp.material.opacity = smooth(-0.03, 0.02, d.y);
    });
  };

  // ---------- accumulation ----------
  const rtSub = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const rtAcc = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMat = new THREE.MeshBasicMaterial({ map: rtSub.texture, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  look.skyTexture = rtAcc.texture;

  // ---------- post ----------
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), opts.bloom ?? 0.45, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 }, uWarm: { value: 0 }, uFlash: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRE: { value: 0 }, uShadow: { value: 0 }, uAspect: { value: W / H } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed; uniform float uWarm; uniform float uFlash;
      uniform vec2 uCenter; uniform float uRE; uniform float uShadow; uniform float uAspect; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed) * 43758.5453); }
      void main(){
        // point-mass gravitational lens: sample where each bent ray came from
        vec2 uv = vUv;
        float shadow = 1.0;
        if (uRE > 0.0) {
          vec2 d = vUv - uCenter; d.x *= uAspect;
          float r = length(d);
          vec2 src = d * (1.0 - (uRE * uRE) / max(r * r, 1e-6));
          src.x /= uAspect;
          uv = uCenter + src;
          shadow = smoothstep(uShadow, uShadow * 1.06, r);
        }
        vec3 c = texture2D(tDiffuse, uv).rgb * shadow;
        c = mix(c, c * vec3(1.04, 1.0, 0.95), 0.6 + uWarm * 0.4);
        c = c * 0.94 + 0.025;
        float d = distance(vUv, vec2(0.5, 0.48));
        c *= 1.0 - smoothstep(0.35, 0.95, d) * 0.45;
        c += (hash(vUv * vec2(1080.0, 1920.0)) - 0.5) * 0.022;
        c = mix(c, vec3(1.0, 0.97, 0.92), uFlash);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
  look.bloom = bloom;
  look.grade = grade;
  const gu = grade.uniforms;

  // Shutter-averaged light state for ground lighting, from the same sub-moments as the sky.
  look.lightState = (h0, h1) => {
    const n = 8;
    let day = 0;
    const sun = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const d = look.sunDir(lerp(h0, h1, i / (n - 1)));
      day += look.dayAmt(d.y) / n;
      sun.addScaledVector(d, 1 / n);
    }
    const sunUp = sun.clone().normalize();
    const golden = smooth(0.35, 0.0, Math.max(0, sunUp.y)) * day;
    return { day, night: 1 - day, golden, sunUp };
  };

  // Render one first-person frame.
  // ground: { scene, camera }   hours: [h0, h1] shutter window in clock hours
  // perSample(h): optional hook to move sky extras for each sub-moment
  // Point the lens at a world position. rsWorld: horizon radius in world units.
  look.setLens = (camera, worldPos, rsWorld) => {
    if (!worldPos) {
      gu.uRE.value = 0;
      return;
    }
    const p = worldPos.clone().project(camera);
    const dist = camera.position.distanceTo(worldPos);
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const toUv = 1 / (2 * dist * Math.tan(fovY / 2));
    const on = p.z < 1;
    gu.uCenter.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    gu.uShadow.value = on ? 2.6 * rsWorld * toUv : 0;
    gu.uRE.value = on ? 3.4 * rsWorld * toUv : 0;
  };

  // Render any scene (space, interiors, diagrams) through the same post chain. With samples > 1,
  // perSample(i, frac) moves things between sub-frames and the result is a motion-blurred average.
  const sceneQuad = new THREE.Scene();
  const sceneQuadMat = new THREE.MeshBasicMaterial({ map: rtAcc.texture, toneMapped: false, depthTest: false, depthWrite: false });
  sceneQuad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneQuadMat));
  const rtSceneSub = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const subQuadMat = new THREE.MeshBasicMaterial({ map: rtSceneSub.texture, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
  const subQuad = new THREE.Scene();
  subQuad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), subQuadMat));
  look.renderScene = ({ scene, camera, t, samples = 1, perSample, flash = 0, warm = 0 }) => {
    grade.uniforms.uSeed.value = Math.floor((t ?? 0) * 60) * 1.618;
    grade.uniforms.uWarm.value = warm;
    grade.uniforms.uFlash.value = flash;
    if (samples <= 1) {
      if (perSample) perSample(0, 1);
      renderPass.scene = scene;
      renderPass.camera = camera;
    } else {
      renderer.setRenderTarget(rtAcc);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      subQuadMat.opacity = 1 / samples;
      for (let i = 0; i < samples; i++) {
        perSample(i, i / (samples - 1));
        renderer.setRenderTarget(rtSceneSub);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(rtAcc);
        renderer.render(subQuad, quadCam);
      }
      renderPass.scene = sceneQuad;
      renderPass.camera = quadCam;
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    composer.render(0);
    gu.uRE.value = 0;
  };

  look.render = ({ scene, camera, h0, h1, t, perSample, flash = 0 }) => {
    const span = Math.abs(h1 - h0);
    const samples = span > 0.05 ? look.samples : 1;
    skyCam.quaternion.copy(camera.quaternion);
    if (skyCam.fov !== camera.fov || skyCam.aspect !== camera.aspect) {
      skyCam.fov = camera.fov;
      skyCam.aspect = camera.aspect;
      skyCam.updateProjectionMatrix();
    }
    skyCam.updateMatrixWorld();

    const mid = look.sunDir(lerp(h0, h1, 0.5));
    const skyExp = lerp(0.85, 0.16, smooth(-0.1, 0.3, mid.y)) + (1 - smooth(0.0, 0.3, Math.max(0, mid.y))) * 0.06;
    quadMat.color.setScalar((skyExp * (look.skyGain ?? 1)) / BASE_EXP);
    quadMat.opacity = 1 / samples;

    renderer.setRenderTarget(rtAcc);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    for (let i = 0; i < samples; i++) {
      const hi = samples === 1 ? h1 : lerp(h0, h1, i / (samples - 1));
      look.setSky(hi);
      if (perSample) perSample(hi, i, samples);
      renderer.setRenderTarget(rtSub);
      renderer.clear();
      renderer.render(skyScene, skyCam);
      renderer.setRenderTarget(rtAcc);
      renderer.render(quadScene, quadCam);
    }

    look.sunTrail(h0, h1);
    renderer.setRenderTarget(rtAcc);
    renderer.render(trailScene, skyCam);

    scene.background = rtAcc.texture;
    renderPass.scene = scene;
    renderPass.camera = camera;
    grade.uniforms.uSeed.value = Math.floor((t ?? 0) * 60) * 1.618;
    grade.uniforms.uWarm.value = smooth(0.3, 0.0, Math.max(0, mid.y)) * look.dayAmt(mid.y);
    grade.uniforms.uFlash.value = flash;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    composer.render(0);
    gu.uRE.value = 0;
  };

  return look;
}
