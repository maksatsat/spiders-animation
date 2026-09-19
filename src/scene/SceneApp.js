import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import { state, onStateChange, MODES } from '../state/SimulationState.js';
import { SCENE, MODE_TARGETS } from '../physics/systemParams.js';
import { orbitState } from '../physics/orbit.js';
import { createModeSwitchState, advanceModeSwitch } from '../physics/modeSwitching.js';
import { stepTelemetry } from '../physics/telemetry.js';
import { isHighlighted, FILTER_BANDS } from '../physics/emissionFilter.js';

import { createStarfield } from './Starfield.js';
import { createNeutronStar, GAMMA_COLOR_HIGH_MODE } from './NeutronStar.js';
import { createCompanion, noseReach } from './Companion.js';
import { createAccretionDisk } from './AccretionDisk.js';
import { createAccretionStream } from './AccretionStream.js';
import { createJets } from './Jets.js';
import { createIntrabinaryShock } from './IntrabinaryShock.js';
import { createPropellerShock } from './PropellerShock.js';
import { createCameraRig } from './CameraRig.js';

const GAMMA_COLOR_DEFAULT = '#ff33d6';
const SWITCHING_MODE = MODES.findIndex((m) => m.id === 'mode-switching');

function damp(current, target, dt, speed) {
  const a = 1 - Math.exp(-speed * dt);
  return current + (target - current) * a;
}

function smoothstep01(t) {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

// How much the companion's ablated wind currently blocks the radio beam:
// 0 = clear line of sight to the pulsar, 1 = fully eclipsed. Evaluated once
// per frame from the *pulsar's* position (not per-beam-fragment — see
// NeutronStar.js for why that doesn't work), using the same
// perpendicular-distance-to-the-view-ray test a real eclipse would need.
function computeRadioEclipse(cameraPos, pulsarPos, companionPos, occluderRadius, tmp) {
  tmp.rayDir.copy(pulsarPos).sub(cameraPos);
  const fragDist = tmp.rayDir.length();
  if (fragDist < 1e-6) return 0;
  tmp.rayDir.multiplyScalar(1 / fragDist);
  tmp.toOccluder.copy(companionPos).sub(cameraPos);
  const along = tmp.toOccluder.dot(tmp.rayDir);
  tmp.closest.copy(cameraPos).addScaledVector(tmp.rayDir, along);
  const lineOfSightDist = companionPos.distanceTo(tmp.closest);
  const clearAt = occluderRadius;
  const blockedAt = occluderRadius * 0.1;
  const aligned = 1 - smoothstep01((lineOfSightDist - blockedAt) / (clearAt - blockedAt));
  // Alignment alone isn't enough — the companion also has to actually be the
  // nearer of the two along this ray, or a pulsar sitting safely in front of
  // a distant companion would read as eclipsed too. Gradual over ~1.5
  // companion-radii either side of the crossover, to match the fade above.
  const frontSpan = occluderRadius * 1.5;
  const inFront = smoothstep01((fragDist - along + frontSpan) / (2 * frontSpan));
  return aligned * inFront;
}

export async function createSceneApp(canvas) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0022);

  const ambient = new THREE.AmbientLight(0x1a2438, 1.2);
  scene.add(ambient);

  const starfield = createStarfield();
  scene.add(starfield);

  const neutronStar = createNeutronStar({ radius: SCENE.pulsarRadius, beamLength: 3.1 });
  scene.add(neutronStar.object3D);
  // How close (world units) the camera's line of sight to the pulsar has to
  // pass to the companion's center to read as eclipsed by its ablated wind.
  const RADIO_OCCLUDER_RADIUS = SCENE.companionRadius * 3.4;

  const companion = createCompanion({ radius: SCENE.companionRadius });
  scene.add(companion.object3D);

  const accretionDisk = createAccretionDisk();
  neutronStar.object3D.add(accretionDisk.object3D); // must follow the pulsar, not sit at world origin

  const accretionStream = createAccretionStream();
  scene.add(accretionStream.object3D);

  const jets = createJets({ baseOffset: SCENE.pulsarRadius * 2.5 });
  neutronStar.object3D.add(jets.object3D);

  const intrabinaryShock = createIntrabinaryShock();
  neutronStar.object3D.add(intrabinaryShock.object3D);

  const propellerShock = createPropellerShock();
  neutronStar.object3D.add(propellerShock.object3D);

  const cameraRig = createCameraRig(canvas);
  cameraRig.goTo(state.view);

  const renderPipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, cameraRig.camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(scenePassColor, 0.4, 0.22, 0.45);
  const bloomedOutput = scenePassColor.add(bloomPass);
  renderPipeline.outputNode = bloomedOutput;
  let bloomEnabled = true;

  const initialTarget = MODE_TARGETS[state.mode];
  const smoothed = {
    radioIntensity: initialTarget.radioIntensity,
    gammaIntensity: initialTarget.gammaIntensity,
    accretionBlend: initialTarget.accretionBlend,
    diskOpacity: 0,
    diskExtent: 0.001,
    diskInnerRadius: initialTarget.diskInnerRadius,
    jetIntensity: 0,
    jetExtent: 0.001,
    shockOpacity: 0,
    innerSpotIntensity: 0,
    irradiationLevel: state.irradiationLevel,
    propellerShockOpacity: 0,
    occluderStrength: 0,
    dim: {
      neutronStarBody: 0,
      radioBeam: 0,
      gammaBeam: 0,
      companion: 0,
      ablatedWind: 0,
      accretionDisk: 0,
      innerDiskSpot: 0,
      jets: 0,
      intrabinaryShock: 0,
      accretionStream: 0,
      propellerShock: 0,
    },
  };

  let simTime = 0;
  let lastView = state.view;
  let lastPhaseResetToken = state.phaseResetToken;
  const modeSwitchState = createModeSwitchState();

  // orbitState's own phase=0 puts the binary separation along the Earth
  // view's line of sight (a conjunction), not perpendicular to it — so the
  // light-curve phase (0 = ascending node, i.e. separation perpendicular to
  // the line of sight) runs a quarter-cycle ahead of the raw orbital phase.
  // This offset also gets rebased on a phase reset so the light-curve
  // display always restarts exactly at 0.
  let orbitalCycleOffset = 0.25;

  onStateChange((s) => {
    if (s.view !== lastView) {
      lastView = s.view;
      cameraRig.goTo(s.view);
    }
    if (s.phaseResetToken !== lastPhaseResetToken) {
      lastPhaseResetToken = s.phaseResetToken;
      // Raw phase 0.75 cycle puts the separation along Z — perpendicular to
      // the Earth view's line of sight (along X) — i.e. the ascending node.
      simTime = 0.75 * SCENE.orbitalPeriodSeconds;
      orbitalCycleOffset = -0.75;
    }
  });

  const pulsarWorldPos = new THREE.Vector3();
  const noseTip = new THREE.Vector3();
  const diskEdge = new THREE.Vector3();
  const companionDir = new THREE.Vector3();
  const eclipseTmp = { rayDir: new THREE.Vector3(), toOccluder: new THREE.Vector3(), closest: new THREE.Vector3() };

  function tick(dt) {
    const dtSim = state.playing ? dt * state.timeScale : 0;
    simTime += dtSim;

    const { pulsar, companion: companionPos, phase } = orbitState(simTime);
    // Unbounded cycle count driving the light-curve phase marker; see the
    // orbitalCycleOffset comment above for why the raw phase is shifted.
    state.orbitalCycle = phase / (Math.PI * 2) + orbitalCycleOffset;
    neutronStar.object3D.position.set(pulsar.x, 0, pulsar.z);
    companion.object3D.position.set(companionPos.x, 0, companionPos.z);
    pulsarWorldPos.set(pulsar.x, 0, pulsar.z);
    companion.object3D.lookAt(pulsarWorldPos);

    neutronStar.update(dt, SCENE.pulsarSpinPeriodSeconds / state.spinSpeed);

    let effectiveMode = state.mode;
    if (state.mode === SWITCHING_MODE) {
      effectiveMode = advanceModeSwitch(modeSwitchState, dtSim);
      state.modeSwitchPhase = modeSwitchState.phase;
      const phaseProgress = 1 - modeSwitchState.remaining / modeSwitchState.duration;
      stepTelemetry(dtSim, modeSwitchState.phase, phaseProgress);
    }
    const target = MODE_TARGETS[effectiveMode];
    const t = state.toggles;

    // Emission-band filter: anything not part of any selected band's
    // highlighted sources for the current mode fades to grayscale. The
    // ablated wind never belongs to any individual band, so it would
    // otherwise always dim while some filter is active — but with every band
    // selected there's nothing left to filter *out*, so that reads the same
    // as no filter at all and everything (ablated wind included) stays lit.
    // Multiple bands can be selected at once, so a source stays lit as long
    // as it's highlighted by at least one of them.
    const allBandsSelected = FILTER_BANDS.every((b) => state.filterBands.has(b.id));
    const filterActive = state.filterBands.size > 0 && !allBandsSelected;
    Object.keys(smoothed.dim).forEach((key) => {
      const dimTarget =
        key === 'ablatedWind'
          ? filterActive
          : filterActive && !isHighlighted(state.filterBands, effectiveMode, key);
      smoothed.dim[key] = damp(smoothed.dim[key], dimTarget ? 1 : 0, dt, 4);
    });
    neutronStar.uniforms.coreDim.value = smoothed.dim.neutronStarBody;
    neutronStar.uniforms.radioDim.value = smoothed.dim.radioBeam;
    neutronStar.uniforms.gammaDim.value = smoothed.dim.gammaBeam;
    companion.uniforms.dim.value = smoothed.dim.companion;
    companion.uniforms.windDim.value = smoothed.dim.ablatedWind;
    accretionDisk.uniforms.diskDim.value = smoothed.dim.accretionDisk;
    accretionDisk.uniforms.spotDim.value = smoothed.dim.innerDiskSpot;
    jets.setDim(smoothed.dim.jets);
    intrabinaryShock.uniforms.dim.value = smoothed.dim.intrabinaryShock;
    accretionStream.uniforms.dim.value = smoothed.dim.accretionStream;
    propellerShock.uniforms.dim.value = smoothed.dim.propellerShock;

    smoothed.radioIntensity = damp(smoothed.radioIntensity, t.radioBeam ? target.radioIntensity : 0, dt, 1.5);
    smoothed.gammaIntensity = damp(smoothed.gammaIntensity, t.gammaBeam ? target.gammaIntensity : 0, dt, 1.5);
    smoothed.accretionBlend = damp(smoothed.accretionBlend, target.accretionBlend, dt, 1.0);
    neutronStar.uniforms.radioIntensity.value = smoothed.radioIntensity;
    neutronStar.uniforms.gammaIntensity.value = smoothed.gammaIntensity;
    neutronStar.uniforms.pulseIntensity.value = 1 + smoothed.accretionBlend * 0.6;
    neutronStar.setGammaColor(effectiveMode === 2 ? GAMMA_COLOR_HIGH_MODE : GAMMA_COLOR_DEFAULT);

    companion.uniforms.irradiation.value = 0.55 + smoothed.accretionBlend * 0.25;
    companion.uniforms.bulge.value = 0.2 + smoothed.accretionBlend * 0.08;
    companion.uniforms.noseStrength.value = 0.08 + smoothed.accretionBlend * 0.45;
    companion.uniforms.windIntensity.value = t.fireLayer ? 1 : 0;
    // In the accretion modes the disk itself is bathing the companion in
    // X-rays regardless of what the (rotation-powered-only) irradiation
    // slider is set to, so it always reads as maximally heated there.
    const irradiationLevelTarget = effectiveMode === 0 ? state.irradiationLevel : 1;
    smoothed.irradiationLevel = damp(smoothed.irradiationLevel, irradiationLevelTarget, dt, 1.5);
    companion.uniforms.irradiationLevel.value = smoothed.irradiationLevel;

    // The radio beam reads as blocked by the companion's ablated wind
    // whenever the pulsar itself is behind the companion from the current
    // camera (see NeutronStar.js and computeRadioEclipse above) — but only
    // while that wind layer is actually on.
    const eclipseTarget = t.fireLayer
      ? computeRadioEclipse(cameraRig.camera.position, pulsarWorldPos, companion.object3D.position, RADIO_OCCLUDER_RADIUS, eclipseTmp)
      : 0;
    smoothed.occluderStrength = damp(smoothed.occluderStrength, eclipseTarget, dt, 3);
    neutronStar.uniforms.radioOcclusion.value = smoothed.occluderStrength;

    const diskOpacityTarget = t.accretionDisk ? target.diskOpacity : 0;
    smoothed.diskOpacity = damp(smoothed.diskOpacity, diskOpacityTarget, dt, 1.2);
    smoothed.diskExtent = damp(smoothed.diskExtent, Math.max(0.001, target.diskOuterExtent), dt, 0.8);
    smoothed.diskInnerRadius = damp(smoothed.diskInnerRadius, target.diskInnerRadius, dt, 0.9);
    accretionDisk.uniforms.opacity.value = smoothed.diskOpacity;
    accretionDisk.uniforms.extent.value = smoothed.diskExtent;
    accretionDisk.uniforms.innerRadius.value = smoothed.diskInnerRadius;
    accretionDisk.uniforms.pulsarSpinAngle.value = neutronStar.getSpinAngle();

    // Gamma-ray-emitting cavity between the star and the (still-truncated)
    // inner disk edge, low mode only — the pulsar wind hasn't fully shut
    // off there, unlike in the high mode.
    const propellerShockTarget = effectiveMode === 1 && t.gammaBeam ? 0.7 : 0;
    smoothed.propellerShockOpacity = damp(smoothed.propellerShockOpacity, propellerShockTarget, dt, 1.5);
    propellerShock.update(smoothed.diskInnerRadius, smoothed.propellerShockOpacity);
    const innerSpotTarget = t.accretionDisk && effectiveMode === 2 ? 1 : 0;
    smoothed.innerSpotIntensity = damp(smoothed.innerSpotIntensity, innerSpotTarget, dt, 1.2);
    accretionDisk.uniforms.innerSpotIntensity.value = smoothed.innerSpotIntensity;
    // The nose (on the star) always points straight at the pulsar, but the
    // stream leaves carrying the companion's orbital velocity, so it hits
    // the disk ahead of the direct line — offset by the motion direction
    // (tangent to the orbit), which is also where a real infall hot spot
    // forms since it's prograde with the disk's own rotation.
    const noseAngle = Math.atan2(companionPos.z - pulsar.z, companionPos.x - pulsar.x);
    const motionAngle = phase + Math.PI / 2;
    accretionDisk.uniforms.streamAngle.value = motionAngle;

    // Bridge the companion's tidal "nose" to the disk's current edge with a
    // dedicated feeder-stream mesh (see AccretionStream.js).
    const noseDist = noseReach(SCENE.companionRadius, companion.uniforms.bulge.value, companion.uniforms.noseStrength.value);
    noseTip.set(
      companionPos.x - Math.cos(noseAngle) * noseDist,
      0,
      companionPos.z - Math.sin(noseAngle) * noseDist
    );
    const diskOuterR = accretionDisk.getOuterRadius();
    diskEdge.set(pulsar.x + Math.cos(motionAngle) * diskOuterR, 0, pulsar.z + Math.sin(motionAngle) * diskOuterR);
    accretionStream.update(noseTip, diskEdge, t.accretionDisk ? smoothed.diskOpacity : 0);

    // Intrabinary shock: only exists while the pulsar wind is actually
    // driving it, i.e. the rotation-powered state.
    companionDir.set(Math.cos(noseAngle), 0, Math.sin(noseAngle));
    const shockTarget = effectiveMode === 0 && t.intrabinaryShock ? 0.6 : 0;
    // Fading in (the wind ramping up) reads fine at the normal rate, but
    // fading out on an untick looked sluggish — snap it away faster.
    const shockDampSpeed = shockTarget < smoothed.shockOpacity ? 2.6 : 1.2;
    smoothed.shockOpacity = damp(smoothed.shockOpacity, shockTarget, dt, shockDampSpeed);
    intrabinaryShock.update(companionDir, smoothed.shockOpacity);

    const jetTarget = t.jets ? target.jetIntensity : 0;
    smoothed.jetIntensity = damp(smoothed.jetIntensity, jetTarget, dt, 1.0);
    smoothed.jetExtent = damp(smoothed.jetExtent, Math.max(0.001, jetTarget), dt, 0.8);
    jets.setIntensity(smoothed.jetIntensity);
    jets.setExtent(smoothed.jetExtent);
    jets.setColorMix(target.jetColorMix);
    jets.setBaseColor(target.jetBaseColor);

    starfield.rotation.y += dt * 0.0015;

    if (t.bloom !== bloomEnabled) {
      bloomEnabled = t.bloom;
      renderPipeline.outputNode = bloomEnabled ? bloomedOutput : scenePassColor;
      renderPipeline.needsUpdate = true;
    }

    cameraRig.update(dt);
    renderPipeline.render();
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    cameraRig.resize(width, height);
  }

  window.addEventListener('resize', resize);
  resize();

  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    tick(dt);
  });

  return { renderer, scene, cameraRig };
}
