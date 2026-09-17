import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  color,
  mix,
  float,
  positionLocal,
  normalView,
  positionViewDirection,
  time,
  pow,
  clamp,
  oneMinus,
} from 'three/tsl';

const RADIO_COLOR = '#7dffb8';
const GAMMA_COLOR = '#ff33d6';
const OBLIQUITY = THREE.MathUtils.degToRad(34);

function makeBeamCone(length, baseRadius, colorHex, intensityNode) {
  const geometry = new THREE.ConeGeometry(baseRadius, length, 24, 1, true);
  geometry.translate(0, length / 2, 0); // apex at local origin, opening toward +Y

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const beamColor = color(colorHex);

  material.colorNode = Fn(() => {
    const t = clamp(positionLocal.y.div(length), 0, 1);
    const lengthFade = pow(oneMinus(t), 3.2);
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 2);
    const glow = lengthFade.mul(0.7).add(rim.mul(0.3)).mul(intensityNode);
    return beamColor.mul(glow);
  })();

  material.opacityNode = Fn(() => {
    const t = clamp(positionLocal.y.div(length), 0, 1);
    return pow(oneMinus(t), 2.4).mul(intensityNode).clamp(0, 1);
  })();

  return new THREE.Mesh(geometry, material);
}

export function createNeutronStar({ radius, beamLength }) {
  const group = new THREE.Group();

  const radioIntensity = uniform(1);
  const gammaIntensity = uniform(0.4);
  const pulseIntensity = uniform(1);

  // Core: small, always-bright, fresnel-rimmed sphere.
  const coreMaterial = new THREE.MeshBasicNodeMaterial();
  coreMaterial.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.2);
    const pulse = float(1).add(time.mul(9).sin().mul(0.06));
    const base = mix(color('#bcd8ff'), color('#ffffff'), rim);
    return base.mul(pulse).mul(pulseIntensity);
  })();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 4), coreMaterial);
  group.add(core);

  // Point light so the pulsar actually lights nearby surfaces (companion, disk).
  const light = new THREE.PointLight('#dfe9ff', 6, 40, 1.4);
  group.add(light);

  const spinRig = new THREE.Group();
  const obliqueRig = new THREE.Group();
  obliqueRig.rotation.z = OBLIQUITY;
  spinRig.add(obliqueRig);
  group.add(spinRig);

  const radioTop = makeBeamCone(beamLength, radius * 1.1, RADIO_COLOR, radioIntensity);
  const radioBottom = makeBeamCone(beamLength, radius * 1.1, RADIO_COLOR, radioIntensity);
  radioBottom.rotation.x = Math.PI;

  const gammaTop = makeBeamCone(beamLength * 0.8, radius * 1.8, GAMMA_COLOR, gammaIntensity);
  const gammaBottom = makeBeamCone(beamLength * 0.8, radius * 1.8, GAMMA_COLOR, gammaIntensity);
  gammaBottom.rotation.x = Math.PI;

  obliqueRig.add(radioTop, radioBottom, gammaTop, gammaBottom);

  let spinAngle = 0;

  return {
    object3D: group,
    light,
    uniforms: { radioIntensity, gammaIntensity, pulseIntensity },
    update(dt, spinPeriodSeconds) {
      spinAngle += (dt / spinPeriodSeconds) * Math.PI * 2;
      spinRig.rotation.y = spinAngle;
    },
  };
}
