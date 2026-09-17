import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  color,
  mix,
  positionLocal,
  time,
  length,
  atan,
  cos,
  sin,
  clamp,
  smoothstep,
  pow,
  abs,
  max,
  oneMinus,
} from 'three/tsl';

// Geometry inner radius stays fixed and small — the *visible* inner edge is
// entirely shader-driven via the `innerRadius` uniform, so it can move (the
// disk truncation radius that distinguishes the high/low X-ray modes)
// without rebuilding geometry.
const GEOMETRY_INNER = 0.1;
// A compact disk close to the pulsar, matched to real accretion-disk
// renders — the visual bridge to the companion is a dedicated feeder
// stream (AccretionStream.js), not an oversized disk.
const OUTER_RADIUS_MAX = 2.6;

// The disk has real volume, flaring thicker toward its outer edge (as real
// accretion disks do) rather than being an infinitely thin sheet. Built as
// a lathe profile — revolved around Y, which is already the orbital-plane
// normal in this scene, so no extra rotation is needed afterward.
//
// A single lathe surface still reads as a hollow shell (you can see clean
// through the middle from the right angle). To fake a filled, volumetric
// body cheaply, several nested shells at shrinking thickness are layered
// and additively blended — since the shader only depends on radius/angle
// (never on the thickness axis), one material can be shared across all of
// them, and the natural overlap near the midplane builds up density there,
// exactly like a real disk being optically thickest at its core.
function buildFlaredProfile(innerR, outerR, segments, thicknessScale) {
  const halfThickness = (r) => {
    const t = THREE.MathUtils.clamp((r - innerR) / (outerR - innerR), 0, 1);
    return (0.012 + Math.pow(t, 1.4) * 0.24) * thicknessScale;
  };
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const r = THREE.MathUtils.lerp(innerR, outerR, i / segments);
    points.push(new THREE.Vector2(r, halfThickness(r)));
  }
  for (let i = segments; i >= 0; i--) {
    const r = THREE.MathUtils.lerp(innerR, outerR, i / segments);
    points.push(new THREE.Vector2(r, -halfThickness(r)));
  }
  points.push(points[0].clone()); // seal the inner rim
  return points;
}

const SHELL_THICKNESS_SCALES = [1, 0.62, 0.32, 0.12];

export function createAccretionDisk() {
  const opacity = uniform(0);
  const extent = uniform(0.001); // 0..1, how far out the disk currently reaches
  const innerRadius = uniform(0.6); // world units, the current truncation radius
  const spinSpeed = uniform(1.5);
  const streamAngle = uniform(0); // world-space angle where the gas stream feeds in
  const pulsarSpinAngle = uniform(0); // tracks the neutron star's own spin (high mode only)
  const innerSpotIntensity = uniform(0);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const colorSpan = OUTER_RADIUS_MAX - GEOMETRY_INNER;

  material.colorNode = Fn(() => {
    const r = length(positionLocal.xz);
    const t = clamp(r.sub(innerRadius).div(colorSpan), 0, 1);
    const angle = atan(positionLocal.z, positionLocal.x);

    // Gentle differential-rotation streaking rather than bold concentric
    // rings — a subtle brightness ripple that spins faster near the center.
    const speed = spinSpeed.div(pow(t.add(0.15), 1.4));
    const ripple = sin(angle.mul(2).add(time.mul(speed))).mul(0.5).add(0.5);
    const brightnessMod = mix(0.85, 1.0, ripple);

    const hot = color('#fff3d9');
    const mid = color('#ff9a4d');
    const cool = color('#7a2410');
    let tempColor = mix(hot, mid, smoothstep(0, 0.4, t));
    tempColor = mix(tempColor, cool, smoothstep(0.4, 1, t));

    const innerGlow = pow(oneMinus(t), 6).mul(1.1);

    // Hot spot where the accretion stream slams into the disk's outer edge.
    const outerR = extent.mul(OUTER_RADIUS_MAX);
    const radialNear = pow(oneMinus(clamp(abs(r.sub(outerR)).div(0.35), 0, 1)), 2);
    const angularNear = pow(max(cos(angle.sub(streamAngle)), 0), 5);
    const hotspot = radialNear.mul(angularNear).mul(2.0);

    // Continues the stream's flow motion onto the disk itself: a bright
    // trailing arm that winds in from the hot spot, following the same
    // differential-rotation speed as the ripple above, so it spirals
    // inward continuously rather than the stream just stopping dead.
    const spiralOffset = angle.sub(streamAngle).add(time.mul(speed));
    const spiralArm = pow(max(cos(spiralOffset), 0), 22).mul(3);

    // Two spots on the inner side of the disk, one per magnetic pole, that
    // co-rotate with the pulsar's own spin rather than the disk's
    // differential rotation — material funneling down along the field
    // lines onto the polar caps, only present once accretion has truncated
    // the disk in close enough to couple to the magnetosphere (high mode).
    // Positioned by *absolute* distance past the inner edge (not a fraction
    // of the whole disk span, which lands much further out than "inner"
    // actually means) and pushed bright enough to read against the bloom.
    const distPastInner = r.sub(innerRadius);
    const innerBand = pow(oneMinus(clamp(abs(distPastInner.sub(0.4)).div(0.22), 0, 1)), 2);
    const spotA = pow(max(cos(angle.sub(pulsarSpinAngle)), 0), 10);
    const spotB = pow(max(cos(angle.sub(pulsarSpinAngle).sub(Math.PI)), 0), 10);
    const innerSpots = innerBand.mul(spotA.add(spotB)).mul(innerSpotIntensity).mul(24);

    return tempColor
      .mul(brightnessMod)
      .add(hot.mul(innerGlow))
      .add(color('#fff8ec').mul(hotspot))
      .add(color('#ffe9c2').mul(spiralArm))
      .add(color('#4fd8ff').mul(innerSpots));
  })();

  material.opacityNode = Fn(() => {
    const r = length(positionLocal.xz);
    const innerFade = smoothstep(innerRadius, innerRadius.add(0.1), r);
    const outerR = extent.mul(OUTER_RADIUS_MAX);
    const extentFade = oneMinus(smoothstep(outerR.sub(0.18), outerR, r));
    // Divided down from the raw opacity uniform because several shells
    // (see SHELL_THICKNESS_SCALES) stack additively to fake a filled body —
    // without this they'd sum well past full brightness.
    return innerFade.mul(extentFade).mul(opacity).mul(0.4).clamp(0, 1);
  })();

  // Nested shells at shrinking thickness, sharing this one material — the
  // shader only depends on radius/angle, never on the thickness axis, so
  // the same node graph is valid for all of them. Layering them fakes a
  // filled, volumetric disk instead of two thin surfaces with a visible
  // gap between.
  const group = new THREE.Group();
  for (const scale of SHELL_THICKNESS_SCALES) {
    const geometry = new THREE.LatheGeometry(
      buildFlaredProfile(GEOMETRY_INNER, OUTER_RADIUS_MAX, 72, scale),
      160
    );
    group.add(new THREE.Mesh(geometry, material));
  }

  return {
    object3D: group,
    uniforms: { opacity, extent, innerRadius, spinSpeed, streamAngle, pulsarSpinAngle, innerSpotIntensity },
    getOuterRadius: () => extent.value * OUTER_RADIUS_MAX,
  };
}
