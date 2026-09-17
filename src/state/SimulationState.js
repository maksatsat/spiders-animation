// Central reactive-ish state store. Plain object + pub/sub, no framework needed
// at this scale — every consumer (scene layer, UI layer) just reads `state`
// directly each frame and subscribes for the rarer discrete events (view changes).

// The three observed states a transitional millisecond pulsar (transformer)
// switches between. This is the primary "story" slider the user drives.
export const MODES = [
  { id: 'rotation', label: 'Rotation-powered' },
  { id: 'accretion-low', label: 'Low X-ray mode' },
  { id: 'accretion-high', label: 'High X-ray mode' },
];

export const state = {
  playing: true,
  timeScale: 1,
  mode: 0, // index into MODES
  view: 'orbital', // 'earth' | 'orbital' | 'top' | 'free'
  toggles: {
    radioBeam: true,
    gammaBeam: true,
    fireLayer: true,
    accretionDisk: true,
    jets: true,
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
