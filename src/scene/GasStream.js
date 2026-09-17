import * as THREE from 'three/webgpu';
import { SCENE } from '../physics/systemParams.js';
import { companionOrbitRadius } from '../physics/orbit.js';

// A single particle population whose trajectory formula is *blended*
// continuously between two closed-form regimes as the accretion slider
// moves:
//   - regime A (accretion = 0): ablation — pulsar-wind pressure blows gas
//     off the companion's irradiated face; it drifts to a slightly larger
//     orbit and lags behind, producing the classic curved comet-like tail.
//   - regime B (accretion = 1): infall — gas instead spirals down toward
//     the pulsar with rapidly increasing angular speed, flattening into the
//     forming disk.
// Each particle's whole life is a pure function of (age, accretion), so
// there is no persistent per-particle simulation state to get out of sync —
// positions are recomputed from scratch every frame, CPU-side, which is
// cheap at this particle count and much easier to reason about than an
// equivalent GPU feedback-loop shader.

const COUNT = 4200;
const CYCLE_SECONDS = 20;

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

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const sprite = new THREE.CanvasTexture(canvas);

  const material = new THREE.PointsMaterial({
    size: 0.16,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const ablationColor = new THREE.Color('#8fd6ff');
  const infallColor = new THREE.Color('#ffb46a');
  const hotColor = new THREE.Color('#fff2d8');
  const tmp = new THREE.Color();

  function update(simTime, accretion, density) {
    const posAttr = geometry.getAttribute('position');
    const colAttr = geometry.getAttribute('color');
    const r0 = companionOrbitRadius;
    const orbitalPeriod = SCENE.orbitalPeriodSeconds;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < COUNT; i++) {
      const age = (simTime / CYCLE_SECONDS + birth[i]) % 1;
      const birthTime = simTime - age * CYCLE_SECONDS;
      const birthPhase = (birthTime / orbitalPeriod) * TWO_PI;

      // Regime A: outward drift + angular lag -> trailing tail.
      const rOut = r0 + age * 2.1 + jitter[i * 3] * 0.15;
      const angleOut = birthPhase - age * 2.3;
      const yOut = jitter[i * 3 + 1] * 0.55 * age;

      // Regime B: infall + accelerating spiral -> feeds the disk.
      const fallT = Math.min(age * 1.35, 1);
      const rIn = THREE.MathUtils.lerp(r0, 0.55, fallT) + jitter[i * 3] * 0.08 * (1 - fallT);
      const angleIn = birthPhase - age * age * 26;
      const settle = 1 - Math.min(age * 1.8, 1);
      const yIn = jitter[i * 3 + 1] * 0.3 * settle;

      const r = THREE.MathUtils.lerp(rOut, rIn, accretion);
      const angle = THREE.MathUtils.lerp(angleOut, angleIn, accretion);
      const y = THREE.MathUtils.lerp(yOut, yIn, accretion);

      const idx = i * 3;
      posAttr.array[idx + 0] = r * Math.cos(angle);
      posAttr.array[idx + 1] = y;
      posAttr.array[idx + 2] = r * Math.sin(angle);

      const fadeIn = Math.min(age / 0.08, 1);
      const fadeOut = Math.min((1 - age) / 0.25, 1);
      let alpha = fadeIn * fadeOut * density;

      tmp.copy(ablationColor).lerp(infallColor, accretion);
      if (accretion > 0.3) {
        const heat = Math.max(0, (fallT - 0.6) / 0.4) * accretion;
        tmp.lerp(hotColor, heat);
        alpha *= 1 + heat * 1.5;
      }

      colAttr.array[idx + 0] = tmp.r * alpha;
      colAttr.array[idx + 1] = tmp.g * alpha;
      colAttr.array[idx + 2] = tmp.b * alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  return { object3D: points, update };
}
