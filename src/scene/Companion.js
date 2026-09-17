import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  color,
  mix,
  float,
  positionLocal,
  normalLocal,
  normalView,
  positionViewDirection,
  time,
  pow,
  clamp,
  abs,
  smoothstep,
  oneMinus,
} from 'three/tsl';

// The companion is tidally locked, so its local -Z axis always points at the
// pulsar (see SceneApp: the mesh is oriented with lookAt each frame). The
// shader bulges the mesh and heats its surface based on alignment with that
// fixed local axis, so the effect stays glued to the star regardless of
// orbital phase.

export function createCompanion({ radius }) {
  const bulge = uniform(0.22); // tidal elongation strength, 0..~0.4
  const irradiation = uniform(0.6); // 0..1, how strongly pulsar-facing side is heated

  const geometry = new THREE.SphereGeometry(radius, 96, 64);

  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.85,
    metalness: 0.0,
  });

  const facing = normalLocal.z.negate(); // +1 = points straight at the pulsar

  material.positionNode = Fn(() => {
    const axisAlign = abs(facing); // bulge on both near AND far side (tidal stretch)
    const bulgeAmount = pow(axisAlign, float(2.5)).mul(bulge);
    return positionLocal.add(normalLocal.mul(bulgeAmount).mul(radius));
  })();

  material.colorNode = Fn(() => {
    const heat = smoothstep(-0.15, 1.0, facing).mul(irradiation.add(0.35));
    const coolColor = color('#7a2c1c');
    const warmColor = color('#ffb066');
    const hotColor = color('#fff3d6');
    const base = mix(mix(coolColor, warmColor, clamp(heat.mul(1.6), 0, 1)), hotColor, pow(clamp(heat, 0, 1), 3));
    const shimmer = time.mul(2.2).sin().mul(0.03).add(1);
    return base.mul(shimmer);
  })();

  material.emissiveNode = Fn(() => {
    const heat = smoothstep(0.1, 1.0, facing).mul(irradiation);
    return color('#ff9d4d').mul(pow(heat, 2)).mul(0.9);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;

  // Faint atmospheric rim to sell the "gas actively boiling off" look even
  // when the particle tail is toggled off.
  const rimMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  rimMaterial.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 3);
    return color('#ff8a4a').mul(rim).mul(irradiation);
  })();
  rimMaterial.opacityNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 3);
    return rim.mul(irradiation).clamp(0, 1);
  })();
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 48, 32), rimMaterial);
  mesh.add(rim);

  return {
    object3D: mesh,
    uniforms: { bulge, irradiation },
  };
}
