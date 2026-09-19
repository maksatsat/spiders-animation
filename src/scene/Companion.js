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
  max,
} from 'three/tsl';
import { dimColor } from './filterFx.js';

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
  // User-facing slider multiplier: 0 collapses the whole day/night heating
  // effect away (a uniform, dark-side-only sphere), 1 reproduces today's
  // normal irradiated look. Independent of `irradiation` above, which is
  // driven by the accretion-mode blend instead.
  const irradiationLevel = uniform(1);
  // How far the pulsar-facing "nose" — the feeder-stream anchor point —
  // pokes out beyond the general tidal bulge, in units of radius. Kept in
  // sync with the plain-JS estimate in SceneApp (see NOSE_REACH below).
  const noseStrength = uniform(0.1);
  // Emission-filter dimming for the companion's own body ("optical"); the
  // ablated-wind shell has its own separate dim below, since it never
  // belongs to any of the filter's highlighted categories.
  const dim = uniform(0);

  // Shared with the wind shell below (declared here so the surface's own
  // advection glow, built before the shell, can reference the same speed).
  const windIntensity = uniform(1); // toggle: 0 = off, 1 = on
  const windSpeed = uniform(0.3);
  // The ablated wind never belongs to any filter band's highlighted set, so
  // it's dimmed whenever a filter is active at all, independent of `dim`.
  const windDim = uniform(0);

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
    const heat = smoothstep(-0.45, 0.35, facing).mul(irradiation.add(0.6)).mul(irradiationLevel);
    const nightColor = color('#3c2415');
    const duskColor = color('#8a2c14');
    const warmColor = color('#ff9a3d');
    const hotColor = color('#fffaf0');

    let base = mix(nightColor, duskColor, smoothstep(0, 0.3, heat));
    base = mix(base, warmColor, smoothstep(0.3, 0.6, heat));
    base = mix(base, hotColor, pow(smoothstep(0.6, 0.9, heat), 1.5));

    const mottled = base.mul(mix(0.85, 1.08, grain));
    const shimmer = time.mul(2.2).sin().mul(0.02).add(1);
    return dimColor(mottled.mul(shimmer), dim);
  })();

  material.emissiveNode = Fn(() => {
    // The far side receives essentially no direct light (its normal faces
    // away from the pulsar, so standard diffuse lighting alone renders it
    // as near-black regardless of albedo) — give it a small constant
    // emissive floor so it reads as a dim brown surface, not black.
    //
    // The glow itself never fully switches off with the irradiation slider —
    // even a "dark", non-irradiated star should still read as weakly
    // glowing, not inert — so the heat-driven glow terms use a floored
    // version of irradiationLevel instead of the raw 0..1 value.
    const glowLevel = irradiationLevel.mul(0.85).add(0.15);
    const heat = smoothstep(-0.1, 0.75, facing).mul(irradiation).mul(glowLevel);
    const hotGlow = color('#ffb066').mul(pow(heat, 2)).mul(2.4);
    const nightGlow = color('#5a3a22').mul(0.16);

    // A steady limb glow of the star's own irradiated atmosphere. This is
    // independent of the ablated-wind shell (own noise field, own always-on
    // visibility) — just a fixed rim texture with a gentle overall pulse,
    // not a directional flow.
    const rimFresnel = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 2.2);
    const streak = clamp(mx_noise_float(positionLocal.mul(3.4)).mul(0.5).add(0.5), 0, 1);
    const pulse = time.mul(1.1).sin().mul(0.15).add(0.85);
    const limbGlow = color('#ff8a3d')
      .mul(pow(streak, 2))
      .mul(rimFresnel)
      .mul(heat.add(0.25))
      .mul(pulse)
      .mul(1.6)
      .mul(glowLevel);

    // Advection glow: bright filaments of ablated material visibly carried
    // across the surface away from the sub-pulsar point, baked directly onto
    // the body itself (not just the separate wind shell) so the flow still
    // reads even with that layer toggled off. Same advection trick as the
    // wind shell below — sample noise offset along local +Z by time, which
    // makes the pattern appear to stream backward across the surface, away
    // from the pulsar-facing nose.
    const advectSample = positionLocal.add(vec3(0, 0, 1).mul(time.mul(windSpeed)));
    const advectN1 = mx_noise_float(advectSample.mul(3.4));
    const advectN2 = mx_noise_float(advectSample.mul(7.5).add(6.0));
    const advectFlow = clamp(advectN1.mul(0.6).add(advectN2.mul(0.4)).mul(0.5).add(0.5), 0, 1);
    const advectionGlow = color('#ffc073')
      .mul(pow(advectFlow, 4))
      .mul(heat.add(0.15))
      .mul(glowLevel)
      .mul(2.6);

    return dimColor(hotGlow.add(nightGlow).add(limbGlow).add(advectionGlow), dim);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;

  // A turbulent, fire-like layer wrapping the irradiated hemisphere,
  // standing in for the star's boiled-off atmosphere. The noise field is
  // advected along local +Z (toward the pulsar) each frame, which makes
  // the pattern visually stream in the opposite direction — i.e. wind
  // blowing *from* the pulsar-facing side back across the surface.
  const windMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });

  // Reshape the shell from a sphere into a paraboloid whose tip sits right
  // on the nose: tight to the surface facing the pulsar, flaring outward
  // with distance from that point, like a bow-shock/wind-sock wrapping the
  // irradiated hemisphere rather than a uniform bubble.
  windMaterial.positionNode = Fn(() => {
    const windFacing = normalLocal.z;

    // Track the star's *actual* deformed surface (same formula as the star's
    // own positionNode above) so the shell can never dip inside the bulge
    // or the nose spike, whatever they're currently set to.
    const axisAlign = abs(windFacing);
    const starBulge = pow(axisAlign, float(2.5)).mul(bulge);
    const starNose = pow(clamp(windFacing, 0, 1), 6).mul(noseStrength);
    const surfaceFactor = float(1).add(starBulge).add(starNose);

    const t = clamp(oneMinus(windFacing).mul(0.5), 0, 1); // 0 at nose, 1 at far pole
    const flare = pow(t, 1.25).mul(2.6);
    const margin = float(0.22);

    const shellR = surfaceFactor.add(margin).add(flare);
    return positionLocal.mul(shellR);
  })();

  windMaterial.colorNode = Fn(() => {
    const windSample = positionLocal.add(vec3(0, 0, 1).mul(time.mul(windSpeed)));
    const n1 = mx_noise_float(windSample.mul(2.0));
    const n2 = mx_noise_float(windSample.mul(4.6).add(10.0));
    const turbulence = clamp(n1.mul(0.65).add(n2.mul(0.35)).mul(0.5).add(0.5), 0, 1);

    const heat = smoothstep(-0.7, 0.5, facing).mul(irradiation.add(0.3));

    const fireCool = color('#7a1c02');
    const fireMid = color('#ff5a1a');
    const fireHot = color('#ffe066');
    let fire = mix(fireCool, fireMid, turbulence);
    fire = mix(fire, fireHot, pow(clamp(turbulence.mul(heat.add(0.3)), 0, 1), 2));
    return dimColor(fire.mul(heat.add(0.2)), windDim);
  })();

  windMaterial.opacityNode = Fn(() => {
    const windSample = positionLocal.add(vec3(0, 0, 1).mul(time.mul(windSpeed)));
    const n1 = mx_noise_float(windSample.mul(2.0));
    const n2 = mx_noise_float(windSample.mul(4.6).add(10.0));
    const turbulence = clamp(n1.mul(0.65).add(n2.mul(0.35)).mul(0.5).add(0.5), 0, 1);

    const heat = smoothstep(-0.7, 0.5, facing).mul(irradiation.add(0.3));
    const rimFresnel = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 2);
    const glowOpacity = heat.mul(turbulence).mul(0.85).add(rimFresnel.mul(heat).mul(0.4));

    // Real ablated material is densest right where it's being blown off the
    // star and thins out into the flared wake — so opacity floors out near
    // full close to the star's own surface, fading with distance from it.
    const windFacing = normalLocal.z;
    const distFromStar = clamp(oneMinus(windFacing).mul(0.5), 0, 1); // 0 at the surface, 1 at the far, flared wake
    const surfaceOpacity = pow(oneMinus(distFromStar), 1.5).mul(0.9);

    return max(glowOpacity, surfaceOpacity).mul(windIntensity).clamp(0, 1);
  })();

  const windLayer = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), windMaterial);
  mesh.add(windLayer);

  return {
    object3D: mesh,
    uniforms: { bulge, irradiation, irradiationLevel, noseStrength, windIntensity, windSpeed, dim, windDim },
  };
}

// Matches the shader's peak displacement at facing=1 (bulge + nose, both in
// units of radius) — lets SceneApp find the nose tip's world position
// without reading back from the GPU.
export function noseReach(radius, bulgeValue, noseStrengthValue) {
  return radius * (1 + bulgeValue + noseStrengthValue);
}
