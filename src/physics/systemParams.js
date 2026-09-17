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
  pulsarSpinPeriodSeconds: 1.5,
};

// The three observed states, as fixed target values — both what the scene
// animates toward and what the info readout displays. Modeled loosely on the
// real high/low X-ray "mode switching" seen in PSR J1023: in the high mode
// the magnetospheric (disk truncation) radius sits further out and the
// system is X-ray brighter; in the low mode the disk pushes in closer to the
// neutron star but the system is fainter overall.
export const MODE_TARGETS = [
  {
    label: 'Rotation-powered (radio pulsar)',
    radioIntensity: 1,
    gammaIntensity: 0.35,
    accretionBlend: 0,
    diskOpacity: 0,
    diskInnerRadius: 0.35,
    diskOuterExtent: 0,
    jetIntensity: 0,
    jetColorMix: 0.55,
    radioLuminosity: 1,
    gammaLuminosity: 0.35,
    xrayLuminosity: 0.12,
    massTransferRate: 0.04,
  },
  {
    label: 'Low X-ray mode (disk just outside the light cylinder)',
    radioIntensity: 0,
    gammaIntensity: 0,
    accretionBlend: 1,
    diskOpacity: 0.14,
    diskInnerRadius: 0.35,
    diskOuterExtent: 0.85,
    jetIntensity: 0.9,
    jetColorMix: 0, // pure white outgoing animation in low mode
    radioLuminosity: 0.15,
    gammaLuminosity: 0.55,
    xrayLuminosity: 0.5,
    massTransferRate: 0.5,
  },
  {
    label: 'High X-ray mode (disk inside the light cylinder)',
    radioIntensity: 0,
    gammaIntensity: 1.2,
    accretionBlend: 1,
    diskOpacity: 0.16,
    diskInnerRadius: 1.15,
    diskOuterExtent: 0.92,
    jetIntensity: 0.9,
    jetColorMix: 0.55, // existing pink/white animation, unchanged in high mode
    radioLuminosity: 0.02,
    gammaLuminosity: 1,
    xrayLuminosity: 1,
    massTransferRate: 0.85,
  },
];
