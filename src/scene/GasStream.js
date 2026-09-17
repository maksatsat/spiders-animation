import * as THREE from 'three/webgpu';
import { instanceColor, instancedBufferAttribute } from 'three/tsl';
import { SCENE } from '../physics/systemParams.js';
import { companionOrbitRadius } from '../physics/orbit.js';

// A single particle population whose trajectory formula is *blended*
// continuously between two closed-form regimes as the accretion slider
// moves:
//   - regime A (accretion = 0): ablation — pulsar-wind pressure blows gas
//     off the companion's irradiated face; it drifts outward and unwinds
//     into a wide, loose multi-turn spiral trailing the orbit.
//   - regime B (accretion = 1): infall — gas instead spirals down toward
//     the pulsar with rapidly increasing angular speed, flattening into the
//     forming disk.
// Each particle's whole life is a pure function of (age, accretion), so
// there is no persistent per-particle simulation state to get out of sync —
// positions are recomputed from scratch every frame, CPU-side, which is
// cheap at this particle count and much easier to reason about than an
// equivalent GPU feedback-loop shader.
//
// Rendered as real lit instanced spheres (not flat billboards or
// THREE.Points): WebGPU's point-list primitive rasterizes every Points
// point at a fixed 1px regardless of material size, and flat billboards
// read as glowing cards rather than gas grains. Small lit spheres pick up
// real shading from the pulsar's light and genuinely occlude/are occluded,
// which is what actually sells "3D" instead of a flat sprite.

const COUNT = 3200;
const CYCLE_SECONDS = 26;
const PARTICLE_SIZE = 0.14;

function hash(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function createGasStream() {
  const birth = new Float32Array(COUNT);
  const jitter = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    birth[i] = hash(i);
    jitter[i * 3 + 0] = hash(i * 3.1 + 1) * 2 - 1;
    jitter[i * 3 + 1] = hash(i * 7.7 + 2) * 2 - 1;
    jitter[i * 3 + 2] = hash(i * 13.3 + 3) * 2 - 1;
  }

  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1);
  geometry.setAttribute('aAlpha', alphaAttr);

  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  });
  material.colorNode = instanceColor;
  material.opacityNode = instancedBufferAttribute(alphaAttr);

  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.frustumCulled = false;

  const infallColor = new THREE.Color('#ffb46a');
  const hotColor = new THREE.Color('#fff2d8');
  const tmp = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  function update(simTime, accretion, density) {
    // Start the plume at the companion's irradiated (sub-pulsar) surface
    // point, not its center — otherwise the first ~40% of every particle's
    // life is spent inside the opaque companion mesh.
    const surfaceR = companionOrbitRadius - SCENE.companionRadius * 0.9;
    const orbitalPeriod = SCENE.orbitalPeriodSeconds;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < COUNT; i++) {
      const age = (simTime / CYCLE_SECONDS + birth[i]) % 1;
      const birthTime = simTime - age * CYCLE_SECONDS;
      const birthPhase = (birthTime / orbitalPeriod) * TWO_PI;

      // Regime A: a wide, loose multi-turn outspiral unwinding from the
      // binary — radius grows well past the orbit while the angular lag
      // keeps accumulating, so each particle traces a long spiral arm.
      const rOut = surfaceR + age * 4.2 + jitter[i * 3] * 0.35;
      const angleOut = birthPhase - age * 6.5;
      const yOut = jitter[i * 3 + 1] * 0.9 * age;

      // Regime B: infall + accelerating spiral -> feeds the disk.
      const fallT = Math.min(age * 1.35, 1);
      const rIn = THREE.MathUtils.lerp(surfaceR, 0.55, fallT) + jitter[i * 3] * 0.08 * (1 - fallT);
      const angleIn = birthPhase - age * age * 26;
      const settle = 1 - Math.min(age * 1.8, 1);
      const yIn = jitter[i * 3 + 1] * 0.3 * settle;

      const r = THREE.MathUtils.lerp(rOut, rIn, accretion);
      const angle = THREE.MathUtils.lerp(angleOut, angleIn, accretion);
      const y = THREE.MathUtils.lerp(yOut, yIn, accretion);

      pos.set(r * Math.cos(angle), y, r * Math.sin(angle));

      // A smooth, gradual transparency gradient: quick fade in, then a long
      // continuous fade-out across the rest of the particle's life rather
      // than a hard cutoff — reads as gas thinning out as it disperses.
      const fadeIn = Math.min(age / 0.04, 1);
      const fadeOut = Math.pow(1 - age, 1.6);
      let alpha = fadeIn * fadeOut * density * 0.85;

      tmp.setRGB(0.55, 0.57, 0.6).lerp(infallColor, accretion);
      if (accretion > 0.3) {
        const heat = Math.max(0, (fallT - 0.6) / 0.4) * accretion;
        tmp.lerp(hotColor, heat);
        alpha *= 1 + heat * 0.8;
      }

      const particleScale = PARTICLE_SIZE * (0.6 + 0.5 * fadeIn) * (0.8 + 0.4 * (jitter[i * 3 + 2] * 0.5 + 0.5));
      scale.set(particleScale, particleScale, particleScale);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tmp);
      alphaAttr.array[i] = Math.min(alpha, 1);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  return { object3D: mesh, update };
}
