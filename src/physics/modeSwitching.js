// The "Mode switching" slider position alternates between the low and high
// X-ray mode targets (MODE_TARGETS indices 1 and 2), mirroring the real
// mode-switching behavior PSR J1023+0038 was observed to show. Real
// switching isn't metronomic, so each phase's duration is redrawn from an
// exponential distribution (a standard model for random, memoryless
// switching intervals) around these means rather than held fixed.
const MEAN_HIGH_SECONDS = 7;
const MEAN_LOW_SECONDS = 3;

function sampleDuration(mean) {
  return -mean * Math.log(1 - Math.random());
}

export function createModeSwitchState() {
  const duration = sampleDuration(MEAN_HIGH_SECONDS);
  return { phase: 2, remaining: duration, duration };
}

// Advances the state machine by `dtSim` simulated seconds and returns the
// (possibly just-flipped) phase: 2 = high mode, 1 = low mode. `duration` and
// `remaining` (both in seconds) are exposed so callers can derive how far
// into the current phase they are, e.g. to shape a flare over its span.
export function advanceModeSwitch(switchState, dtSim) {
  switchState.remaining -= dtSim;
  while (switchState.remaining <= 0) {
    if (switchState.phase === 2) {
      switchState.phase = 1;
      switchState.duration = sampleDuration(MEAN_LOW_SECONDS);
    } else {
      switchState.phase = 2;
      switchState.duration = sampleDuration(MEAN_HIGH_SECONDS);
    }
    switchState.remaining += switchState.duration;
  }
  return switchState.phase;
}
