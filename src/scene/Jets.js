import * as THREE from 'three/webgpu';
import { Fn, uniform, color, mix, positionLocal, time, clamp, fract, pow, sin, oneMinus, smoothstep } from 'three/tsl';
import { dimColor } from './filterFx.js';

const LENGTH = 5.5;
const RADIUS = 0.13;

function makeJet(direction, baseOffset) {
  // Apex at local origin, flaring outward toward +Y — a real cone, not a
  // frustum, and anchored a bit clear of the pulsar's surface rather than
  // erupting from a point buried inside it.
  const geometry = new THREE.ConeGeometry(RADIUS, LENGTH, 20, 24, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, LENGTH / 2, 0);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const intensity = uniform(0);
  const extent = uniform(0.001);
  const colorMix = uniform(0.55); // blend fraction toward pink (high mode)
  const baseColor = uniform(new THREE.Color('#ffffff')); // the colorMix=0 endpoint, mode-dependent (green in low mode)
  const dim = uniform(0); // emission-filter dimming

  material.colorNode = Fn(() => {
    const t = clamp(positionLocal.y.div(LENGTH), 0, 1);
    const travel = fract(t.mul(5).sub(time.mul(2.6)));
    const knot = pow(sin(travel.mul(Math.PI)), 10);
    const fade = pow(oneMinus(t), 0.7);
    const base = mix(baseColor, color('#ff54dc'), colorMix);
    const glow = fade.mul(0.5).add(knot.mul(fade).mul(2.2)).mul(intensity);
    return dimColor(base.mul(glow), dim);
  })();

  material.opacityNode = Fn(() => {
    const t = clamp(positionLocal.y.div(LENGTH), 0, 1);
    const fade = pow(oneMinus(t), 0.7);
    const reach = oneMinus(smoothstep(extent.sub(0.08), extent, t)); // 1 while t < extent, 0 beyond
    return fade.mul(reach).mul(intensity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseOffset * direction;
  if (direction < 0) mesh.rotation.x = Math.PI;
  return { mesh, uniforms: { intensity, extent, colorMix, baseColor, dim } };
}

export function createJets({ baseOffset = 0.4 } = {}) {
  const group = new THREE.Group();
  const up = makeJet(1, baseOffset);
  const down = makeJet(-1, baseOffset);
  group.add(up.mesh, down.mesh);

  return {
    object3D: group,
    setIntensity(v) {
      up.uniforms.intensity.value = v;
      down.uniforms.intensity.value = v;
    },
    setExtent(v) {
      up.uniforms.extent.value = v;
      down.uniforms.extent.value = v;
    },
    setColorMix(v) {
      up.uniforms.colorMix.value = v;
      down.uniforms.colorMix.value = v;
    },
    setBaseColor(hex) {
      up.uniforms.baseColor.value.set(hex);
      down.uniforms.baseColor.value.set(hex);
    },
    setDim(v) {
      up.uniforms.dim.value = v;
      down.uniforms.dim.value = v;
    },
  };
}
