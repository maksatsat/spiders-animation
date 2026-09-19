import * as THREE from 'three/webgpu';
import { Fn, uniform, color, positionLocal, normalView, positionViewDirection, clamp, pow, oneMinus, smoothstep, mx_noise_float, time } from 'three/tsl';
import { dimColor } from './filterFx.js';

// The intrabinary shock: where the pulsar's relativistic wind rams into the
// companion's much weaker wind. Modeled as a hemispherical shell wrapped
// around the pulsar, its dome bulging out toward the companion (the
// confining pressure comes from that direction) with the flat side open
// toward the pulsar's far side. Only meaningful in the rotation-powered
// state — once accretion takes over, the pulsar wind that drives it is gone.

const RADIUS = 3.0;
const REACH = 0.9; // stretches the dome further out along its axis toward the companion

export function createIntrabinaryShock() {
  const opacity = uniform(0);
  const ringSpeed = uniform(1.1); // how fast each ripple travels from the nose to the rim
  const ringDensity = 8.5; // how many ripples are visible across the dome at once
  const dim = uniform(0); // emission-filter dimming

  const geometry = new THREE.SphereGeometry(RADIUS, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  // The companion's ablated wind rams into the shock right at the nose (the
  // apex, facing the companion), so the impact reads as a ripple of bright
  // rings expanding outward from that point across the dome toward the open
  // rim — not a texture streaming across the surface, an actual traveling
  // wavefront timed to the impact point.
  const outwardGlow = Fn(() => {
    const elevation = clamp(positionLocal.y.div(RADIUS), 0, 1); // 0 at rim, 1 at the nose
    const distFromNose = oneMinus(elevation);
    const wave = distFromNose.mul(ringDensity).sub(time.mul(ringSpeed)).sin().mul(0.5).add(0.5);
    const ring = pow(wave, 5);
    const fadeNearRim = oneMinus(smoothstep(0.8, 1.0, distFromNose)); // don't let rings cut off hard at the rim
    return ring.mul(fadeNearRim);
  });

  material.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.6);
    const shimmer = mx_noise_float(positionLocal.mul(2.2).add(time.mul(0.15))).mul(0.15).add(0.85);
    const indigo = color('#4b3fb0');
    const bright = color('#8f8bff');
    const ringGlow = color('#9fd8ff');
    const glow = indigo.add(bright.mul(rim)).mul(shimmer);
    return dimColor(glow.add(ringGlow.mul(outwardGlow()).mul(rim.add(0.3))), dim);
  })();

  material.opacityNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.6);
    const base = rim.mul(0.3).add(0.05);
    return base.add(outwardGlow().mul(rim).mul(0.22)).mul(opacity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.y = REACH; // elongate the dome along its axis without losing the hemisphere shape

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();

  function update(companionDirection, targetOpacity) {
    quat.setFromUnitVectors(up, companionDirection);
    mesh.quaternion.copy(quat);
    opacity.value = targetOpacity;
  }

  return { object3D: mesh, update, uniforms: { dim } };
}
