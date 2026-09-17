import * as THREE from 'three/webgpu';
import { Fn, uniform, color, positionLocal, normalView, positionViewDirection, clamp, pow, oneMinus, mx_noise_float, time } from 'three/tsl';

// The intrabinary shock: where the pulsar's relativistic wind rams into the
// companion's much weaker wind. Modeled as a hemispherical shell wrapped
// around the pulsar, its dome bulging out toward the companion (the
// confining pressure comes from that direction) with the flat side open
// toward the pulsar's far side. Only meaningful in the rotation-powered
// state — once accretion takes over, the pulsar wind that drives it is gone.

const RADIUS = 1.7;
const REACH = 1.6; // stretches the dome further out along its axis toward the companion

export function createIntrabinaryShock() {
  const opacity = uniform(0);

  const geometry = new THREE.SphereGeometry(RADIUS, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  material.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.6);
    const shimmer = mx_noise_float(positionLocal.mul(2.2).add(time.mul(0.15))).mul(0.15).add(0.85);
    const indigo = color('#4b3fb0');
    const bright = color('#8f8bff');
    return indigo.add(bright.mul(rim)).mul(shimmer);
  })();

  material.opacityNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.6);
    return rim.mul(0.55).add(0.12).mul(opacity).clamp(0, 1);
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

  return { object3D: mesh, update };
}
