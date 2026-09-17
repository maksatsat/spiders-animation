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
// Reaches most of the way out to the companion's orbit (~6.45 units) so the
// disk visually connects to it, with the gas stream bridging the last gap.
const OUTER_RADIUS_MAX = 5.6;

export function createAccretionDisk() {
  const opacity = uniform(0);
  const extent = uniform(0.001); // 0..1, how far out the disk currently reaches
  const innerRadius = uniform(0.6); // world units, the current truncation radius
  const spinSpeed = uniform(1.5);
  const streamAngle = uniform(0); // world-space angle where the gas stream feeds in

  const geometry = new THREE.RingGeometry(GEOMETRY_INNER, OUTER_RADIUS_MAX, 192, 48);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const colorSpan = OUTER_RADIUS_MAX - GEOMETRY_INNER;

  material.colorNode = Fn(() => {
    const r = length(positionLocal.xy);
    const t = clamp(r.sub(innerRadius).div(colorSpan), 0, 1);
    const angle = atan(positionLocal.y, positionLocal.x);

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
    const radialNear = pow(oneMinus(clamp(abs(r.sub(outerR)).div(0.7), 0, 1)), 2);
    const angularNear = pow(max(cos(angle.sub(streamAngle)), 0), 5);
    const hotspot = radialNear.mul(angularNear).mul(2.2);

    return tempColor.mul(brightnessMod).add(hot.mul(innerGlow)).add(color('#fff8ec').mul(hotspot));
  })();

  material.opacityNode = Fn(() => {
    const r = length(positionLocal.xy);
    const innerFade = smoothstep(innerRadius, innerRadius.add(0.1), r);
    const outerR = extent.mul(OUTER_RADIUS_MAX);
    const extentFade = oneMinus(smoothstep(outerR.sub(0.18), outerR, r));
    return innerFade.mul(extentFade).mul(opacity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;

  return {
    object3D: mesh,
    uniforms: { opacity, extent, innerRadius, spinSpeed, streamAngle },
  };
}
