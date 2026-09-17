import * as THREE from 'three/webgpu';
import { Fn, uniform, color, mix, positionLocal, time, clamp, fract, pow, sin, oneMinus, smoothstep } from 'three/tsl';

const LENGTH = 5.5;
const RADIUS = 0.06;

function makeJet(direction) {
  // radiusTop sits at local +height/2; after the translate below that's the
  // far end, so put the wide radius there and the narrow one at the base
  // (the pulsar) — a jet collimated at its source, flaring downstream.
  const geometry = new THREE.CylinderGeometry(RADIUS * 2.2, RADIUS, LENGTH, 16, 24, true);
  geometry.translate(0, LENGTH / 2, 0);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const intensity = uniform(0);
  const extent = uniform(0.001);

  material.colorNode = Fn(() => {
    const t = clamp(positionLocal.y.div(LENGTH), 0, 1);
    const travel = fract(t.mul(5).sub(time.mul(2.6)));
    const knot = pow(sin(travel.mul(Math.PI)), 10);
    const fade = pow(oneMinus(t), 0.7);
    const base = mix(color('#ffffff'), color('#ff54dc'), 0.55);
    const glow = fade.mul(0.5).add(knot.mul(fade).mul(2.2)).mul(intensity);
    return base.mul(glow);
  })();

  material.opacityNode = Fn(() => {
    const t = clamp(positionLocal.y.div(LENGTH), 0, 1);
    const fade = pow(oneMinus(t), 0.7);
    const reach = oneMinus(smoothstep(extent.sub(0.08), extent, t)); // 1 while t < extent, 0 beyond
    return fade.mul(reach).mul(intensity).clamp(0, 1);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  if (direction < 0) mesh.rotation.x = Math.PI;
  return { mesh, uniforms: { intensity, extent } };
}

export function createJets() {
  const group = new THREE.Group();
  const up = makeJet(1);
  const down = makeJet(-1);
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
  };
}
