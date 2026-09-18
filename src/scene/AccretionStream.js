import * as THREE from 'three/webgpu';
import { Fn, uniform, color, mix, positionLocal, time, clamp, fract, pow, sin, oneMinus, smoothstep } from 'three/tsl';
import { dimColor } from './filterFx.js';

// A coherent, bright feeder stream bridging the companion's tidal "nose" to
// the accretion disk's current edge — the visible L1-point mass-transfer
// funnel. This one mesh is re-positioned and re-oriented every frame to
// span two moving points instead of being rebuilt, which is far cheaper
// than regenerating a tube geometry.

const RADIUS_NEAR_STAR = 0.3;
const RADIUS_NEAR_DISK = 0.035;

export function createAccretionStream() {
  const opacity = uniform(0);
  const dim = uniform(0); // emission-filter dimming

  const geometry = new THREE.CylinderGeometry(RADIUS_NEAR_DISK, RADIUS_NEAR_STAR, 1, 20, 12, true);
  geometry.translate(0, 0.5, 0); // spans local y=0 (star end) to y=1 (disk end)

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  material.colorNode = Fn(() => {
    const t = clamp(positionLocal.y, 0, 1);
    const starColor = color('#ffb04a');
    const diskColor = color('#fff3d9');
    const base = mix(starColor, diskColor, t);

    // Traveling brightness bands suggesting matter flowing along the stream.
    const flow = fract(t.mul(4).sub(time.mul(1.4)));
    const band = pow(sin(flow.mul(Math.PI)), 6).mul(0.6);

    // Dims as it approaches the disk, on top of the geometric taper.
    return dimColor(base.mul(oneMinus(t.mul(0.5)).add(band)), dim);
  })();

  material.opacityNode = Fn(() => {
    const t = clamp(positionLocal.y, 0, 1);
    const startFade = smoothstep(0, 0.06, t); // soften right where it meets the star
    const endFade = pow(oneMinus(t), 0.9); // fades out gradually toward the disk
    return startFade.mul(endFade).mul(opacity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const dir = new THREE.Vector3();

  function update(startPoint, endPoint, targetOpacity) {
    mesh.position.copy(startPoint);
    dir.subVectors(endPoint, startPoint);
    const length = dir.length();
    if (length < 1e-4) {
      opacity.value = 0;
      return;
    }
    dir.normalize();
    quat.setFromUnitVectors(up, dir);
    mesh.quaternion.copy(quat);
    mesh.scale.set(1, length, 1);
    opacity.value = targetOpacity;
  }

  return { object3D: mesh, update, uniforms: { dim } };
}
