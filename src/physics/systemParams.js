// Loosely modeled on PSR J1023+0038 ("the Transformer"), the prototypical
// system observed to switch between a rotation-powered radio pulsar state
// and an accretion-powered state with a disk — the real-world basis for the
// accretion/pulsar slider. Numbers are real-world approximations, not exact
// fit values, used to drive the info readout and scene proportions.

export const SYSTEM = {
  name: 'PSR J1023+0038',
  nickname: 'the Transformer',
  distanceLy: 4400,
  orbitalPeriodHours: 4.75,
  pulsarMassSolar: 1.7,
  companionMassSolar: 0.2,
  spinPeriodMs: 1.69,
};

// Scene units: the orbit is drawn at a fixed visual separation regardless of
// the "real" scale (a to-scale render would make the companion invisible).
export const SCENE = {
  separation: 7.2,
  pulsarRadius: 0.16,
  companionRadius: 0.85,
  orbitalPeriodSeconds: 34, // one lap of the visualized orbit, at timeScale=1
  pulsarSpinPeriodSeconds: 2.2,
};

// Interpolated "live readout" values shown in the info panel, as a function
// of the accretion slider t in [0, 1].
export function liveParams(t) {
  const lerp = (a, b) => a + (b - a) * t;
  return {
    state:
      t < 0.15
        ? 'Rotation-powered (radio pulsar)'
        : t > 0.85
        ? 'Accretion-powered (disk-fed)'
        : 'Transitional / state-switching',
    radioLuminosity: lerp(1, 0.02),
    gammaLuminosity: lerp(0.35, 1),
    xrayLuminosity: lerp(0.15, 1),
    massTransferRate: lerp(0.05, 1),
    diskRadius: lerp(0, 1),
  };
}
