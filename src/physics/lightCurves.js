// The four multi-wavelength light curves shown in the rotation-powered
// state, all as a function of orbital phase (0..1, wrapping). Phase 0 is
// defined as the pulsar's ascending node; phase 0.25 is superior conjunction
// (pulsar behind the companion as seen from Earth) — that's where the radio
// eclipse and the X-ray minimum both sit.

// Digitized X-ray double-hump orbital modulation (see lc.txt), phase 0..1,
// arbitrary flux units. Minimum sits at superior conjunction (phase ~0.25),
// with two humps roughly symmetric around it.
const XRAY_TABLE = [[0,1.231571],[0.010101,1.170881],[0.020202,1.1096],[0.030303,1.049078],[0.040404,0.990387],[0.050505,0.934325],[0.060606,0.881443],[0.070707,0.832085],[0.080808,0.786426],[0.090909,0.744512],[0.10101,0.706294],[0.111111,0.671659],[0.121212,0.640453],[0.131313,0.612499],[0.141414,0.587608],[0.151515,0.565594],[0.161616,0.54628],[0.171717,0.529497],[0.181818,0.515095],[0.191919,0.502939],[0.20202,0.492915],[0.212121,0.484924],[0.222222,0.478887],[0.232323,0.474746],[0.242424,0.472459],[0.252525,0.472003],[0.262626,0.473373],[0.272727,0.476583],[0.282828,0.481665],[0.292929,0.48867],[0.30303,0.497667],[0.313131,0.508744],[0.323232,0.522007],[0.333333,0.537581],[0.343434,0.55561],[0.353535,0.576253],[0.363636,0.599682],[0.373737,0.626081],[0.383838,0.655639],[0.393939,0.688538],[0.40404,0.724946],[0.414141,0.765002],[0.424242,0.808788],[0.434343,0.856309],[0.444444,0.90746],[0.454545,0.961987],[0.464646,1.019448],[0.474747,1.07917],[0.484848,1.140223],[0.494949,1.201395],[0.505051,1.261199],[0.515152,1.317921],[0.525253,1.369692],[0.535354,1.414624],[0.545455,1.450961],[0.555556,1.477259],[0.565657,1.492541],[0.575758,1.496422],[0.585859,1.489156],[0.59596,1.471608],[0.606061,1.445159],[0.616162,1.411552],[0.626263,1.372724],[0.636364,1.33064],[0.646465,1.287158],[0.656566,1.243936],[0.666667,1.202383],[0.676768,1.163639],[0.686869,1.128591],[0.69697,1.097901],[0.707071,1.072047],[0.717172,1.051355],[0.727273,1.036042],[0.737374,1.026242],[0.747475,1.02203],[0.757576,1.023435],[0.767677,1.030447],[0.777778,1.043016],[0.787879,1.06104],[0.79798,1.084346],[0.808081,1.112667],[0.818182,1.145606],[0.828283,1.182599],[0.838384,1.222874],[0.848485,1.26542],[0.858586,1.308964],[0.868687,1.351969],[0.878788,1.392667],[0.888889,1.429132],[0.89899,1.459394],[0.909091,1.481591],[0.919192,1.494142],[0.929293,1.495906],[0.939394,1.486316],[0.949495,1.465439],[0.959596,1.433967],[0.969697,1.393128],[0.979798,1.344545],[0.989899,1.29006],[1,1.231571]];

const XRAY_MIN = Math.min(...XRAY_TABLE.map((p) => p[1]));
const XRAY_MAX = Math.max(...XRAY_TABLE.map((p) => p[1]));

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

// Shortest signed distance from `phase` to `center` on the unit circle, in [-0.5, 0.5].
function circularDelta(phase, center) {
  return wrap01(phase - center + 0.5) - 0.5;
}

function interpXray(phase01) {
  const p = phase01 * (XRAY_TABLE.length - 1);
  const i0 = Math.floor(p);
  const i1 = Math.min(i0 + 1, XRAY_TABLE.length - 1);
  const t = p - i0;
  const v = XRAY_TABLE[i0][1] + (XRAY_TABLE[i1][1] - XRAY_TABLE[i0][1]) * t;
  return (v - XRAY_MIN) / (XRAY_MAX - XRAY_MIN);
}

export function gammaFlux(phase) {
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase - 0.25));
}

export function xrayFlux(phase) {
  return interpXray(wrap01(phase));
}

// A smooth (not sharp-edged) dip centered on superior conjunction, standing
// in for the radio eclipse as the pulsar passes behind the companion's wind.
export function radioFlux(phase) {
  const d = circularDelta(phase, 0.25);
  const sigma = 0.06;
  return 1 - 0.92 * Math.exp(-(d * d) / (2 * sigma * sigma));
}

// Blends between the irradiated shape (single peak at phase 0.75, the
// heated face turned toward us) and the ellipsoidal-modulation shape (two
// peaks per orbit, at phase 0 and 0.5, from the tidally distorted star
// presenting more/less projected area) as `irradiationLevel` goes 0..1.
export function opticalFlux(phase, irradiationLevel) {
  const irradiated = 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase - 0.75));
  // Much shallower than the irradiated swing — ellipsoidal modulation from
  // the tidal distortion alone is a subtle effect, so it shouldn't span the
  // full flux axis the way the heated-face curve does.
  const ellipsoidal = 0.5 + 0.08 * Math.cos(4 * Math.PI * phase);
  return ellipsoidal + (irradiated - ellipsoidal) * irradiationLevel;
}

// Samples a flux(phase) function across `cycles` orbital cycles (phase axis
// 0..cycles), for a static (non-scrolling) light-curve plot.
export function sampleLightCurve(fluxFn, { cycles = 2, points = 240 } = {}) {
  const samples = new Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * cycles;
    samples[i] = { x, y: fluxFn(x) };
  }
  return samples;
}
