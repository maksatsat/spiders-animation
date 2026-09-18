// Central reactive-ish state store. Plain object + pub/sub, no framework needed
// at this scale — every consumer (scene layer, UI layer) just reads `state`
// directly each frame and subscribes for the rarer discrete events (view changes).

// The three observed states a transitional millisecond pulsar (transformer)
// switches between. This is the primary "story" slider the user drives.
export const MODES = [
  { id: 'rotation', label: 'Rotation-powered' },
  { id: 'accretion-low', label: 'Low X-ray mode' },
  { id: 'accretion-high', label: 'High X-ray mode' },
  { id: 'mode-switching', label: 'Mode switching' },
];

export const state = {
  playing: true,
  timeScale: 1,
  spinSpeed: 1, // multiplier on the pulsar's base spin rate
  mode: 0, // index into MODES
  view: 'orbital', // 'earth' | 'orbital' | 'top' | 'free'
  modeSwitchPhase: 2, // which sub-mode (1 = low, 2 = high) is live while mode === "mode-switching"
  orbitalCycle: 0, // unbounded orbital cycle count (fractional), mirrors SceneApp's orbit clock
  irradiationLevel: 1, // 0..1, rotation-powered-only slider: 0 = uniform dark companion, 1 = irradiated as normal
  phaseResetToken: 0, // bumped by the "reset to phase 0" camera action; SceneApp watches for changes
  filterBand: null, // null | 'radio' | 'optical' | 'xray' | 'gamma' — emission-band highlight filter
  toggles: {
    radioBeam: true,
    gammaBeam: true,
    fireLayer: true,
    accretionDisk: true,
    jets: true,
    intrabinaryShock: true,
    bloom: true,
  },
};

const listeners = new Set();

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function setToggle(key, value) {
  state.toggles[key] = value;
  listeners.forEach((fn) => fn(state));
}
