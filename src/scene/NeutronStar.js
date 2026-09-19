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
  smoothstep,
  oneMinus,
} from 'three/tsl';
import { dimColor } from './filterFx.js';

const RADIO_COLOR = '#7dffb8';
const GAMMA_COLOR = '#ff33d6';
export const GAMMA_COLOR_HIGH_MODE = '#4fb3ff'; // "pulsar wind" styling in high X-ray mode
const OBLIQUITY = THREE.MathUtils.degToRad(34);

function makeBeamCone(beamLength, baseRadius, colorHex, intensityNode, dimNode, occlusionNode) {
  // THREE.ConeGeometry puts its apex at +height/2 and its (wide) base at
  // -height/2; flip it so the apex sits at local origin and the cone flares
  // outward toward +Y — a proper lighthouse beam widening away from the star,
  // not a wedge that's widest at the source.
  const geometry = new THREE.ConeGeometry(baseRadius, beamLength, 24, 1, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, beamLength / 2, 0);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const beamColor = uniform(new THREE.Color(colorHex));

  material.colorNode = Fn(() => {
    const t = clamp(positionLocal.y.div(beamLength), 0, 1);
    const lengthFade = pow(oneMinus(t), 3.2);
    const rim = pow(oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1)), 2);
    const glow = lengthFade.mul(0.7).add(rim.mul(0.3)).mul(intensityNode);
    return dimColor(beamColor.mul(glow), dimNode);
  })();

  material.opacityNode = Fn(() => {
    const t = clamp(positionLocal.y.div(beamLength), 0, 1);
    let opacity = pow(oneMinus(t), 2.4).mul(intensityNode);
    if (occlusionNode) {
      // How much the companion's ablated wind is blocking the radio beam
      // right now — a single whole-beam factor (0 = clear, 1 = fully
      // blocked) computed once per frame from the pulsar's own position
      // relative to the companion and camera, not per-fragment. A
      // per-fragment ray test only dims whichever narrow sliver of the beam
      // cone happens to sit near the companion at the current spin angle,
      // which (with the beam confined to a ~34° cone around the spin axis,
      // rarely aimed anywhere near the companion's mostly-horizontal
      // direction) almost never lines up — so the beam read as unblocked
      // even with the pulsar plainly sitting behind the companion. Blocking
      // the whole beam whenever the *star* is behind the companion matches
      // what's actually happening: no radio gets out in that direction at
      // all, regardless of which way the beam cone currently points.
      opacity = opacity.mul(oneMinus(occlusionNode));
    }
    return opacity.clamp(0, 1);
  })();

  return { mesh: new THREE.Mesh(geometry, material), colorUniform: beamColor };
}

export function createNeutronStar({ radius, beamLength }) {
  const group = new THREE.Group();

  const radioIntensity = uniform(1);
  const gammaIntensity = uniform(0.4);
  const pulseIntensity = uniform(1);
  // Emission-filter dimming: 0 = normal, 1 = grayed out and faded, driven
  // independently per source so e.g. an X-ray filter can keep the core lit
  // while graying out the beams.
  const coreDim = uniform(0);
  const radioDim = uniform(0);
  const gammaDim = uniform(0);

  // The companion's ablated wind reads as visually blocking the radio beam
  // (but not the gamma beam — see makeBeamCone) whenever the pulsar itself
  // is behind the companion from the current camera. Computed once per frame
  // in SceneApp (see there for why per-fragment ray tracing doesn't work)
  // and applied as a single 0..1 factor across the whole beam.
  const radioOcclusion = uniform(0);

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
    const hotspot = smoothstep(0.93, 0.995, poleAlign).mul(3.5);
    return dimColor(base.mul(pulse).add(color('#ffffff').mul(hotspot)), coreDim).mul(pulseIntensity);
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

  // Anchor each cone's apex just outside the core's surface rather than at
  // its center — otherwise the apex is buried inside the opaque sphere and
  // the intersection seam sparkles/z-fights as the star spins.
  const poleOffset = radius * 0.95;

  const radioTop = makeBeamCone(beamLength, radius * 1.1, RADIO_COLOR, radioIntensity, radioDim, radioOcclusion);
  radioTop.mesh.position.y = poleOffset;
  const radioBottom = makeBeamCone(beamLength, radius * 1.1, RADIO_COLOR, radioIntensity, radioDim, radioOcclusion);
  radioBottom.mesh.position.y = -poleOffset;
  radioBottom.mesh.rotation.x = Math.PI;

  const gammaTop = makeBeamCone(beamLength * 0.85, radius * 4.5, GAMMA_COLOR, gammaIntensity, gammaDim);
  gammaTop.mesh.position.y = poleOffset;
  const gammaBottom = makeBeamCone(beamLength * 0.85, radius * 4.5, GAMMA_COLOR, gammaIntensity, gammaDim);
  gammaBottom.mesh.position.y = -poleOffset;
  gammaBottom.mesh.rotation.x = Math.PI;

  obliqueRig.add(radioTop.mesh, radioBottom.mesh, gammaTop.mesh, gammaBottom.mesh);

  let spinAngle = 0;
  const sinObliquity = Math.sin(OBLIQUITY);
  const cosObliquity = Math.cos(OBLIQUITY);

  return {
    object3D: group,
    light,
    uniforms: {
      radioIntensity,
      gammaIntensity,
      pulseIntensity,
      coreDim,
      radioDim,
      gammaDim,
      radioOcclusion,
    },
    setGammaColor(hex) {
      gammaTop.colorUniform.value.set(hex);
      gammaBottom.colorUniform.value.set(hex);
    },
    getSpinAngle: () => spinAngle,
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
