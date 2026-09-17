import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import { state, onStateChange } from '../state/SimulationState.js';
import { SCENE, MODE_TARGETS } from '../physics/systemParams.js';
import { orbitState } from '../physics/orbit.js';

import { createStarfield } from './Starfield.js';
import { createNeutronStar } from './NeutronStar.js';
import { createCompanion } from './Companion.js';
import { createGasStream } from './GasStream.js';
import { createAccretionDisk } from './AccretionDisk.js';
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

  const gasStream = createGasStream();
  scene.add(gasStream.object3D);

  const accretionDisk = createAccretionDisk();
  neutronStar.object3D.add(accretionDisk.object3D); // must follow the pulsar, not sit at world origin

  const jets = createJets();
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

  function tick(dt) {
    if (state.playing) simTime += dt * state.timeScale;

    const { pulsar, companion: companionPos } = orbitState(simTime);
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

    gasStream.update(simTime, smoothed.accretionBlend, t.ablationTail ? 1 : 0);

    const diskOpacityTarget = t.accretionDisk ? target.diskOpacity : 0;
    smoothed.diskOpacity = damp(smoothed.diskOpacity, diskOpacityTarget, dt, 1.2);
    smoothed.diskExtent = damp(smoothed.diskExtent, Math.max(0.001, target.diskOuterExtent), dt, 0.8);
    smoothed.diskInnerRadius = damp(smoothed.diskInnerRadius, target.diskInnerRadius, dt, 0.9);
    accretionDisk.uniforms.opacity.value = smoothed.diskOpacity;
    accretionDisk.uniforms.extent.value = smoothed.diskExtent;
    accretionDisk.uniforms.innerRadius.value = smoothed.diskInnerRadius;
    // The gas stream feeds the disk roughly along the pulsar-companion line.
    accretionDisk.uniforms.streamAngle.value = Math.atan2(
      companionPos.z - pulsar.z,
      companionPos.x - pulsar.x
    );

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
