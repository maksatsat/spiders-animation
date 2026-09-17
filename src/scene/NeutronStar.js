import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  color,
  mix,
  float,
  positionLocal,
  normalLocal,
  normalView,
  positionViewDirection,
  time,
  pow,
  clamp,
  abs,
  dot,
  oneMinus,
} from 'three/tsl';

const RADIO_COLOR = '#7dffb8';
const GAMMA_COLOR = '#ff33d6';
const OBLIQUITY = THREE.MathUtils.degToRad(34);

function makeBeamCone(length, baseRadius, colorHex, intensityNode) {
  // THREE.ConeGeometry puts its apex at +height/2 and its (wide) base at
  // -height/2; flip it so the apex sits at local origin and the cone flares
  // outward toward +Y — a proper lighthouse beam widening away from the star,
  // not a wedge that's widest at the source.
  const geometry = new THREE.ConeGeometry(baseRadius, length, 24, 1, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, length / 2, 0);

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

  // Core: small, always-bright, fresnel-rimmed sphere, with two flared hot
  // spots marking where the beams actually leave the star (the magnetic
  // poles), which precess around the spin axis as the star rotates.
  const poleDir = uniform(new THREE.Vector3(0, 1, 0));
  const coreMaterial = new THREE.MeshBasicNodeMaterial();
  coreMaterial.colorNode = Fn(() => {
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 1.2);
    const pulse = float(1).add(time.mul(9).sin().mul(0.06));
    const base = mix(color('#3d8fff'), color('#bfe0ff'), rim);
    const poleAlign = abs(dot(normalLocal, poleDir));
    const hotspot = pow(poleAlign, 22).mul(3.5);
    return base.mul(pulse).add(color('#ffffff').mul(hotspot)).mul(pulseIntensity);
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

  const gammaTop = makeBeamCone(beamLength * 0.85, radius * 4.5, GAMMA_COLOR, gammaIntensity);
  const gammaBottom = makeBeamCone(beamLength * 0.85, radius * 4.5, GAMMA_COLOR, gammaIntensity);
  gammaBottom.rotation.x = Math.PI;

  obliqueRig.add(radioTop, radioBottom, gammaTop, gammaBottom);

  let spinAngle = 0;
  const sinObliquity = Math.sin(OBLIQUITY);
  const cosObliquity = Math.cos(OBLIQUITY);

  return {
    object3D: group,
    light,
    uniforms: { radioIntensity, gammaIntensity, pulseIntensity },
    update(dt, spinPeriodSeconds) {
      spinAngle += (dt / spinPeriodSeconds) * Math.PI * 2;
      spinRig.rotation.y = spinAngle;
      // Same transform as the beam rig (oblique tilt, then spin around Y),
      // applied to the magnetic axis (0,1,0) in the core's own local frame.
      poleDir.value.set(
        -sinObliquity * Math.cos(spinAngle),
        cosObliquity,
        sinObliquity * Math.sin(spinAngle)
      );
    },
  };
}
