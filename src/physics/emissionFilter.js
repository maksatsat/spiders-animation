// Which scene "sources" stay colored for each emission-band filter, keyed by
// the effective physical mode (0 = rotation-powered, 1 = low X-ray mode,
// 2 = high X-ray mode — "mode switching" always resolves to whichever of
// 1/2 is currently live). Anything not listed for the active band+mode is
// grayed out and faded, everywhere in the scene.
const FILTER_SOURCES = {
  radio: {
    0: ['radioBeam'],
    1: ['jets'],
    2: ['jets'],
  },
  optical: {
    0: ['companion', 'accretionDisk', 'innerDiskSpot', 'accretionStream'],
    1: ['companion', 'accretionDisk', 'innerDiskSpot', 'accretionStream'],
    2: ['companion', 'accretionDisk', 'innerDiskSpot', 'accretionStream'],
  },
  xray: {
    0: ['intrabinaryShock', 'neutronStarBody'],
    1: ['neutronStarBody', 'accretionDisk', 'innerDiskSpot', 'jets', 'accretionStream'],
    2: ['neutronStarBody', 'accretionDisk', 'innerDiskSpot', 'jets', 'accretionStream'],
  },
  gamma: {
    0: ['gammaBeam'],
    1: ['jets', 'propellerShock'],
    2: ['jets', 'innerDiskSpot', 'gammaBeam'],
  },
};

export const FILTER_BANDS = [
  { id: 'radio', label: 'Radio' },
  { id: 'optical', label: 'Optical' },
  { id: 'xray', label: 'X-ray' },
  { id: 'gamma', label: 'Gamma-ray' },
];

export function isHighlighted(bands, effectiveMode, sourceKey) {
  for (const band of bands) {
    const sources = FILTER_SOURCES[band] && FILTER_SOURCES[band][effectiveMode];
    if (sources && sources.includes(sourceKey)) return true;
  }
  return false;
}
