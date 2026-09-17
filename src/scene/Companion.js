import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  color,
  mix,
  float,
  vec3,
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

  // A turbulent, fire-like layer wrapping the irradiated hemisphere,
  // standing in for the star's boiled-off atmosphere. The noise field is
  // advected along local +Z (toward the pulsar) each frame, which makes
  // the pattern visually stream in the opposite direction — i.e. wind
  // blowing *from* the pulsar-facing side back across the surface.
  const windIntensity = uniform(1); // toggle: 0 = off, 1 = on
  const windSpeed = uniform(0.3);

  const windMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });

  windMaterial.colorNode = Fn(() => {
    const windSample = positionLocal.add(vec3(0, 0, 1).mul(time.mul(windSpeed)));
    const n1 = mx_noise_float(windSample.mul(3.2));
    const n2 = mx_noise_float(windSample.mul(7.5).add(10.0));
    const turbulence = clamp(n1.mul(0.65).add(n2.mul(0.35)).mul(0.5).add(0.5), 0, 1);

    const heat = smoothstep(-0.5, 0.6, facing).mul(irradiation.add(0.3));

    const fireCool = color('#7a1c02');
    const fireMid = color('#ff5a1a');
    const fireHot = color('#ffe066');
    let fire = mix(fireCool, fireMid, turbulence);
    fire = mix(fire, fireHot, pow(clamp(turbulence.mul(heat.add(0.3)), 0, 1), 2));
    return fire.mul(heat.add(0.2));
  })();

  windMaterial.opacityNode = Fn(() => {
    const windSample = positionLocal.add(vec3(0, 0, 1).mul(time.mul(windSpeed)));
    const n1 = mx_noise_float(windSample.mul(3.2));
    const n2 = mx_noise_float(windSample.mul(7.5).add(10.0));
    const turbulence = clamp(n1.mul(0.65).add(n2.mul(0.35)).mul(0.5).add(0.5), 0, 1);

    const heat = smoothstep(-0.5, 0.6, facing).mul(irradiation.add(0.3));
    const rimFresnel = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 2);

    return heat.mul(turbulence).mul(0.85).add(rimFresnel.mul(heat).mul(0.4)).mul(windIntensity).clamp(0, 1);
  })();

  const windLayer = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.18, 64, 48), windMaterial);
  mesh.add(windLayer);

  return {
    object3D: mesh,
    uniforms: { bulge, irradiation, noseStrength, windIntensity, windSpeed },
  };
}

// Matches the shader's peak displacement at facing=1 (bulge + nose, both in
// units of radius) — lets SceneApp find the nose tip's world position
// without reading back from the GPU.
export function noseReach(radius, bulgeValue, noseStrengthValue) {
  return radius * (1 + bulgeValue + noseStrengthValue);
}
