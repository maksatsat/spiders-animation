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
  mx_noise_float,
} from 'three/tsl';

// The companion is tidally locked, so it always shows the same face to the
// pulsar (see SceneApp: the mesh is oriented with lookAt each frame). Note
// Object3D.lookAt() points +Z at the target for ordinary meshes (only
// cameras/lights use -Z), so local +Z is the pulsar-facing axis here. The
// shader bulges the mesh and heats its surface based on alignment with that
// fixed local axis, so the effect stays glued to the star regardless of
// orbital phase.

export function createCompanion({ radius }) {
  const bulge = uniform(0.22); // tidal elongation strength, 0..~0.4
  const irradiation = uniform(0.6); // 0..1, how strongly pulsar-facing side is heated
  // How far the pulsar-facing "nose" — the feeder-stream anchor point —
  // pokes out beyond the general tidal bulge, in units of radius. Kept in
  // sync with the plain-JS estimate in SceneApp (see NOSE_REACH below).
  const noseStrength = uniform(0.1);

  const geometry = new THREE.SphereGeometry(radius, 96, 64);

  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.85,
    metalness: 0.0,
  });

  const facing = normalLocal.z; // +1 = points straight at the pulsar

  material.positionNode = Fn(() => {
    const axisAlign = abs(facing); // bulge on both near AND far side (tidal stretch)
    const bulgeAmount = pow(axisAlign, float(2.5)).mul(bulge);
    // A sharp, narrow spike only on the near side — the "nose" the feeder
    // stream visually erupts from, matching an L1-point accretion funnel.
    const nose = pow(clamp(facing, 0, 1), 6).mul(noseStrength);
    return positionLocal.add(normalLocal.mul(bulgeAmount.add(nose)).mul(radius));
  })();

  // Fine surface mottling (granulation / limb detail) so the terminator
  // reads as a real irradiated surface rather than a flat gradient.
  const grain = mx_noise_float(positionLocal.mul(5.5)).mul(0.5).add(0.5);

  material.colorNode = Fn(() => {
    // Sharp day/night terminator, like a heavily irradiated tidally-locked
    // world: most of the far hemisphere stays cold, and the heating ramps
    // up hard only right around the sub-pulsar point.
    const heat = smoothstep(-0.45, 0.35, facing).mul(irradiation.add(0.6));
    const nightColor = color('#170502');
    const duskColor = color('#8a2c14');
    const warmColor = color('#ff9a3d');
    const hotColor = color('#fffaf0');

    let base = mix(nightColor, duskColor, smoothstep(0, 0.3, heat));
    base = mix(base, warmColor, smoothstep(0.3, 0.6, heat));
    base = mix(base, hotColor, pow(smoothstep(0.6, 0.9, heat), 1.5));

    const mottled = base.mul(mix(0.85, 1.08, grain));
    const shimmer = time.mul(2.2).sin().mul(0.02).add(1);
    return mottled.mul(shimmer);
  })();

  material.emissiveNode = Fn(() => {
    const heat = smoothstep(-0.1, 0.75, facing).mul(irradiation);
    return color('#ffb066').mul(pow(heat, 2)).mul(2.4);
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
    uniforms: { bulge, irradiation, noseStrength },
  };
}

// Matches the shader's peak displacement at facing=1 (bulge + nose, both in
// units of radius) — lets SceneApp find the nose tip's world position
// without reading back from the GPU.
export function noseReach(radius, bulgeValue, noseStrengthValue) {
  return radius * (1 + bulgeValue + noseStrengthValue);
}
