import { SCENE, SYSTEM } from './systemParams.js';

const massRatio = SYSTEM.companionMassSolar / SYSTEM.pulsarMassSolar;
// Distance of each body from the barycenter, split by mass ratio.
export const pulsarOrbitRadius = SCENE.separation * (massRatio / (1 + massRatio));
export const companionOrbitRadius = SCENE.separation * (1 / (1 + massRatio));

const TWO_PI = Math.PI * 2;

/**
 * Circular two-body orbit in the XZ plane (Y is the orbital-plane normal).
 * Returns positions for both bodies plus the companion's tidally-locked
 * facing angle (== its own orbital phase, since tidal lock means the same
 * hemisphere always faces the pulsar).
 */
export function orbitState(simTimeSeconds) {
  const phase = (simTimeSeconds / SCENE.orbitalPeriodSeconds) * TWO_PI;
  const cos = Math.cos(phase);
  const sin = Math.sin(phase);

  const companion = {
    x: companionOrbitRadius * cos,
    z: companionOrbitRadius * sin,
  };
  const pulsar = {
    x: -pulsarOrbitRadius * cos,
    z: -pulsarOrbitRadius * sin,
  };

  return { phase, pulsar, companion };
}

export function pulsarSpinAngle(simTimeSeconds) {
  return (simTimeSeconds / SCENE.pulsarSpinPeriodSeconds) * TWO_PI;
}
