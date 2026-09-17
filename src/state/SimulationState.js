// Central reactive-ish state store. Plain object + pub/sub, no framework needed
// at this scale — every consumer (scene layer, UI layer) just reads `state`
// directly each frame and subscribes for the rarer discrete events (view changes).

export const state = {
  playing: true,
  timeScale: 1,
  // 0 = fully rotation-powered (spider) state, 1 = fully accretion-powered
  // (transformer) state. This is the primary "story" slider the user drives.
  accretion: 0,
  view: 'orbital', // 'earth' | 'orbital' | 'top' | 'free'
  toggles: {
    radioBeam: true,
    gammaBeam: true,
    ablationTail: true,
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
