import * as THREE from 'three/webgpu';
import { Fn, uniform, color, positionLocal, normalView, positionViewDirection, clamp, pow, oneMinus, mx_noise_float, time } from 'three/tsl';
import { dimColor } from './filterFx.js';

// The propeller shock: a gamma-ray-emitting cloud filling the cavity
// between the neutron star and the (further-truncated) inner disk edge in
// the low X-ray mode — the pulsar's rotational energy is still being
// dumped into the infalling material at the magnetospheric boundary
// (the "propeller" regime), it's just not strong enough to blow the disk
// all the way back to the light cylinder the way the rotation-powered wind
// does, so the space in between still glows in gamma-rays. A plain sphere,
// rescaled every frame to reach whatever the current inner disk radius is.

export function createPropellerShock() {
  const opacity = uniform(0);
  const dim = uniform(0); // emission-filter dimming

  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  material.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.4);
    const drift = mx_noise_float(positionLocal.mul(2.4).add(time.mul(0.12))).mul(0.25).add(0.75);
    const deep = color('#4a1f7a');
    const bright = color('#c084ff');
    return dimColor(deep.add(bright.mul(rim)).mul(drift), dim);
  })();

  material.opacityNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.4);
    return rim.mul(0.3).add(0.1).mul(opacity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);

  function update(targetRadius, targetOpacity) {
    mesh.scale.setScalar(Math.max(targetRadius, 0.001));
    opacity.value = targetOpacity;
  }

  return { object3D: mesh, update, uniforms: { dim } };
}
