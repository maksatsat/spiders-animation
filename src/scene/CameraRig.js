import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BOOKMARKS = {
  earth: { position: new THREE.Vector3(13.5, 1.6, 1.5), target: new THREE.Vector3(0, 0, 0) },
  orbital: { position: new THREE.Vector3(6.5, 2.8, 9.5), target: new THREE.Vector3(0, 0, 0) },
  top: { position: new THREE.Vector3(0.001, 15.5, 0.001), target: new THREE.Vector3(0, 0, 0) },
  // Exactly edge-on to the orbital plane (y=0) and aligned with the axis the
  // "reset to phase 0" action puts the conjunction on, so the companion
  // reads as side-on at phase 0 and would visibly pass in front of/behind
  // the pulsar a quarter orbit later, at phase 0.25.
  eclipse: { position: new THREE.Vector3(13.5, 0, 0), target: new THREE.Vector3(0, 0, 0) },
};

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function createCameraRig(canvas) {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.copy(BOOKMARKS.orbital.position);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(BOOKMARKS.orbital.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 90;
  controls.update();

  let tween = null;

  function goTo(name) {
    const bookmark = BOOKMARKS[name];
    if (!bookmark) return; // 'free' — leave the camera where it is
    tween = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: bookmark.position.clone(),
      toTarget: bookmark.target.clone(),
      t: 0,
      duration: 1.4,
    };
  }

  function update(dt) {
    if (tween) {
      tween.t += dt / tween.duration;
      const e = easeInOutCubic(Math.min(tween.t, 1));
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
  }

  function resize(width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return { camera, controls, goTo, update, resize };
}
