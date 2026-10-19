// A person's head: stands at the place's eye height, breathes, sways, and turns to look at things.
// look keys are [t, yawDeg, pitchDeg] offsets from the place's resting view (positive yaw = left,
// positive pitch = up). Turns ease in and out the way a head does.
import * as THREE from "three";
import { easedKeys } from "./util.js";

export function povRig(place, lookKeys = [[0, 0, 0]]) {
  const yawOf = easedKeys(lookKeys.map((k) => [k[0], k[1]]));
  const pitchOf = easedKeys(lookKeys.map((k) => [k[0], k[2]]));
  const d2r = THREE.MathUtils.degToRad;
  return (t, { shake = 0, drift = 0 } = {}) => {
    const cam = place.camera;
    const breathe = Math.sin(t * 1.25) * 0.012;
    const sway = Math.sin(t * 0.21) * 0.006 + Math.sin(t * 0.53 + 1.7) * 0.003;
    const nod = Math.sin(t * 0.17 + 1) * 0.004;
    const sx = Math.sin(t * 37.1) * Math.sin(t * 13.3) * shake;
    const sy = Math.sin(t * 29.7 + 1.3) * Math.cos(t * 17.9) * shake;
    cam.position.copy(place.eye);
    cam.position.y += breathe;
    cam.position.z -= drift * t;
    cam.position.x += sx * 2;
    cam.rotation.set(d2r(place.pitch + pitchOf(t)) + nod + sy, place.yaw + d2r(yawOf(t)) + sway + sx, Math.sin(t * 0.31) * 0.004, "YXZ");
    cam.updateMatrixWorld();
  };
}
