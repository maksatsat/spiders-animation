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
  sin,
  clamp,
  smoothstep,
  pow,
  oneMinus,
} from 'three/tsl';

const INNER_RADIUS = 0.45;
const OUTER_RADIUS_MAX = 2.9;

export function createAccretionDisk() {
  const opacity = uniform(0);
  const extent = uniform(0.001); // 0..1, how far out the disk currently reaches
  const spinSpeed = uniform(1.6);

  const geometry = new THREE.RingGeometry(INNER_RADIUS, OUTER_RADIUS_MAX, 160, 48);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const span = OUTER_RADIUS_MAX - INNER_RADIUS;

  material.colorNode = Fn(() => {
    const r = length(positionLocal.xy);
    const t = clamp(r.sub(INNER_RADIUS).div(span), 0, 1);
    const angle = atan(positionLocal.y, positionLocal.x);

    const speed = spinSpeed.div(pow(t.add(0.1), 1.5));
    const spiral = sin(angle.mul(3).add(time.mul(speed)));
    const bands = spiral.mul(0.5).add(0.5);
    const brightnessMod = mix(0.55, 1.0, bands);

    const hot = color('#fff6e0');
    const mid = color('#ffab55');
    const cool = color('#8a2a12');
    let tempColor = mix(hot, mid, smoothstep(0, 0.45, t));
    tempColor = mix(tempColor, cool, smoothstep(0.45, 1, t));

    const innerGlow = pow(oneMinus(t), 4).mul(2);
    return tempColor.mul(brightnessMod).add(hot.mul(innerGlow));
  })();

  material.opacityNode = Fn(() => {
    const r = length(positionLocal.xy);
    const t = clamp(r.sub(INNER_RADIUS).div(span), 0, 1);
    const innerFade = smoothstep(0, 0.05, t);
    const extentFade = oneMinus(smoothstep(extent.sub(0.06), extent, t));
    return innerFade.mul(extentFade).mul(opacity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;

  return {
    object3D: mesh,
    uniforms: { opacity, extent, spinSpeed },
  };
}
