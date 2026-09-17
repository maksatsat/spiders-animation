import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import { state, onStateChange } from '../state/SimulationState.js';
import { SCENE, MODE_TARGETS } from '../physics/systemParams.js';
import { orbitState } from '../physics/orbit.js';

import { createStarfield } from './Starfield.js';
import { createNeutronStar } from './NeutronStar.js';
import { createCompanion, noseReach } from './Companion.js';
import { createAccretionDisk } from './AccretionDisk.js';
import { createAccretionStream } from './AccretionStream.js';
import { createJets } from './Jets.js';
import { createCameraRig } from './CameraRig.js';

function damp(current, target, dt, speed) {
  const a = 1 - Math.exp(-speed * dt);
  return current + (target - current) * a;
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

  const companion = createCompanion({ radius: SCENE.companionRadius });
  scene.add(companion.object3D);

  const accretionDisk = createAccretionDisk();
  neutronStar.object3D.add(accretionDisk.object3D); // must follow the pulsar, not sit at world origin

  const accretionStream = createAccretionStream();
  scene.add(accretionStream.object3D);

  const jets = createJets({ baseOffset: SCENE.pulsarRadius * 2.5 });
  neutronStar.object3D.add(jets.object3D);

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
  };

  let simTime = 0;
  let lastView = state.view;

  onStateChange((s) => {
    if (s.view !== lastView) {
      lastView = s.view;
      cameraRig.goTo(s.view);
    }
  });

  const pulsarWorldPos = new THREE.Vector3();
  const noseTip = new THREE.Vector3();
  const diskEdge = new THREE.Vector3();

  function tick(dt) {
    if (state.playing) simTime += dt * state.timeScale;

    const { pulsar, companion: companionPos, phase } = orbitState(simTime);
    neutronStar.object3D.position.set(pulsar.x, 0, pulsar.z);
    companion.object3D.position.set(companionPos.x, 0, companionPos.z);
    pulsarWorldPos.set(pulsar.x, 0, pulsar.z);
    companion.object3D.lookAt(pulsarWorldPos);

    neutronStar.update(dt, SCENE.pulsarSpinPeriodSeconds);

    const target = MODE_TARGETS[state.mode];
    const t = state.toggles;

    smoothed.radioIntensity = damp(smoothed.radioIntensity, t.radioBeam ? target.radioIntensity : 0, dt, 1.5);
    smoothed.gammaIntensity = damp(smoothed.gammaIntensity, t.gammaBeam ? target.gammaIntensity : 0, dt, 1.5);
    smoothed.accretionBlend = damp(smoothed.accretionBlend, target.accretionBlend, dt, 1.0);
    neutronStar.uniforms.radioIntensity.value = smoothed.radioIntensity;
    neutronStar.uniforms.gammaIntensity.value = smoothed.gammaIntensity;
    neutronStar.uniforms.pulseIntensity.value = 1 + smoothed.accretionBlend * 0.6;

    companion.uniforms.irradiation.value = 0.55 + smoothed.accretionBlend * 0.25;
    companion.uniforms.bulge.value = 0.2 + smoothed.accretionBlend * 0.08;
    companion.uniforms.noseStrength.value = 0.08 + smoothed.accretionBlend * 0.45;
    companion.uniforms.windIntensity.value = t.fireLayer ? 1 : 0;

    const diskOpacityTarget = t.accretionDisk ? target.diskOpacity : 0;
    smoothed.diskOpacity = damp(smoothed.diskOpacity, diskOpacityTarget, dt, 1.2);
    smoothed.diskExtent = damp(smoothed.diskExtent, Math.max(0.001, target.diskOuterExtent), dt, 0.8);
    smoothed.diskInnerRadius = damp(smoothed.diskInnerRadius, target.diskInnerRadius, dt, 0.9);
    accretionDisk.uniforms.opacity.value = smoothed.diskOpacity;
    accretionDisk.uniforms.extent.value = smoothed.diskExtent;
    accretionDisk.uniforms.innerRadius.value = smoothed.diskInnerRadius;
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

    const jetTarget = t.jets ? target.jetIntensity : 0;
    smoothed.jetIntensity = damp(smoothed.jetIntensity, jetTarget, dt, 1.0);
    smoothed.jetExtent = damp(smoothed.jetExtent, Math.max(0.001, jetTarget), dt, 0.8);
    jets.setIntensity(smoothed.jetIntensity);
    jets.setExtent(smoothed.jetExtent);

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
