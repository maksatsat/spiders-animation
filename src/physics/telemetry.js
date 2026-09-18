// Drives the three strip-chart plots shown while the main slider sits on
// "Mode switching". These aren't derived from MODE_TARGETS — they're a
// simplified, hand-shaped signal meant to read clearly at a glance: X-ray and
// gamma-ray each sit at one of two noisy constants depending on the current
// phase (and anticorrelated with each other, matching the real X-ray/gamma
// behavior across a switch), while radio stays near zero in the high mode
// and flares once per low-mode phase, timed to that phase's own duration.

export const TELEMETRY_WINDOW_SECONDS = 30;

const NOISE = 0.05;
const XRAY_HIGH = 0.82;
const XRAY_LOW = 0.22;
const RADIO_FLARE_PEAK = 0.9;

const telemetry = { t: 0, samples: [] };

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function jitter() {
  return (Math.random() - 0.5) * NOISE;
}

// `phase` is 2 (high) or 1 (low); `phaseProgress` is 0..1 through that phase.
export function stepTelemetry(dtSim, phase, phaseProgress) {
  telemetry.t += dtSim;

  const isHigh = phase === 2;
  const xray = isHigh ? XRAY_HIGH : XRAY_LOW;
  const gamma = isHigh ? XRAY_LOW : XRAY_HIGH; // anticorrelated with X-ray
  const radio = isHigh ? 0 : Math.sin(Math.PI * clamp01(phaseProgress)) * RADIO_FLARE_PEAK;

  telemetry.samples.push({
    t: telemetry.t,
    xray: clamp01(xray + jitter()),
    gamma: clamp01(gamma + jitter()),
    radio: clamp01(radio + jitter()),
  });

  const cutoff = telemetry.t - TELEMETRY_WINDOW_SECONDS;
  while (telemetry.samples.length && telemetry.samples[0].t < cutoff) {
    telemetry.samples.shift();
  }
}

export function getTelemetry() {
  return telemetry;
}
