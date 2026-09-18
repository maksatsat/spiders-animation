import { state, setState, setToggle, onStateChange, MODES } from '../state/SimulationState.js';
import { SYSTEM, MODE_TARGETS } from '../physics/systemParams.js';
import { getTelemetry, TELEMETRY_WINDOW_SECONDS } from '../physics/telemetry.js';
import { gammaFlux, xrayFlux, radioFlux, opticalFlux, sampleLightCurve } from '../physics/lightCurves.js';
import { FILTER_BANDS } from '../physics/emissionFilter.js';

const SWITCHING_MODE = MODES.findIndex((m) => m.id === 'mode-switching');

// Ties each of the three underlying modes to the color it's given on the
// bottom slider, so the luminosity-bar ticks read as "the same mode" there.
const MODE_TICK_COLORS = ['var(--accent-radio)', 'var(--accent-warn)', 'var(--accent-gamma)'];

const LUMINOSITY_BARS = [
  { key: 'radioLuminosity', label: 'Radio luminosity' },
  { key: 'gammaLuminosity', label: 'Gamma-ray luminosity' },
  { key: 'xrayLuminosity', label: 'X-ray luminosity' },
];

const PLOTS = [
  { key: 'gamma', label: 'Gamma-ray', color: '#ff5fdb' },
  { key: 'xray', label: 'X-ray', color: '#8fd7ff' },
  { key: 'radio', label: 'Radio', color: '#7dffb8' },
];

const LIGHT_CURVE_BANDS = [
  { key: 'gamma', label: 'Gamma-ray', color: '#ff5fdb', flux: (x) => gammaFlux(x) },
  { key: 'xray', label: 'X-ray', color: '#8fd7ff', flux: (x) => xrayFlux(x) },
  { key: 'optical', label: 'Optical', color: '#ffe066', flux: (x) => opticalFlux(x, state.irradiationLevel) },
  { key: 'radio', label: 'Radio', color: '#7dffb8', flux: (x) => radioFlux(x) },
];
const LIGHT_CURVE_TICKS = [0, 0.5, 1, 1.5, 2];
const LIGHT_CURVE_CYCLES = 2;

const VIEWS = [
  { id: 'earth', label: 'Earth View' },
  { id: 'orbital', label: 'Orbital Plane' },
  { id: 'top', label: 'Top-Down' },
  { id: 'free', label: 'Free' },
];

// `modes` lists which slider positions (indices into MODES) each layer is
// actually active in — its checkbox is hidden the rest of the time instead
// of sitting there toggling nothing.
const TOGGLES = [
  { key: 'radioBeam', label: 'Radio beam', modes: [0] },
  {
    key: 'gammaBeam',
    label: 'Gamma-ray beam',
    labelByMode: { 2: 'Pulsar wind', [SWITCHING_MODE]: 'Pulsar wind' },
    modes: [0, 2, SWITCHING_MODE],
  },
  { key: 'fireLayer', label: 'Ablated material', modes: [0, 1, 2, SWITCHING_MODE] },
  { key: 'intrabinaryShock', label: 'Intrabinary shock', modes: [0] },
  { key: 'accretionDisk', label: 'Accretion disk', modes: [1, 2, SWITCHING_MODE] },
  { key: 'jets', label: 'Compact jet', modes: [1, 2, SWITCHING_MODE] },
  { key: 'bloom', label: 'Glow (bloom)', modes: [0, 1, 2, SWITCHING_MODE] },
];

// While the slider sits on "Mode switching" there's no fixed mode index to
// key labels/readouts off, so resolve to whichever sub-mode (low/high) is
// currently active.
function displayMode() {
  return state.mode === SWITCHING_MODE ? state.modeSwitchPhase : state.mode;
}

function labelFor(def, mode) {
  return (def.labelByMode && def.labelByMode[mode]) || def.label;
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// Builds a column of labeled canvases sharing one y-axis title (drawn once,
// spanning the whole stack) and one x-axis title underneath, rather than
// repeating axis labels per subplot.
function buildPlotStack(container, entries, { width = 220, height = 44, yLabel, xLabel } = {}) {
  const row = el('div', 'plot-stack');
  if (yLabel) row.appendChild(el('div', 'plot-yaxis-label', yLabel));
  const col = el('div', 'plot-columns');
  const canvases = entries.map(({ key, label, color }) => {
    const block = el('div', 'plot-block');
    block.appendChild(el('div', 'plot-label', label));
    const canvas = document.createElement('canvas');
    canvas.className = 'plot-canvas';
    canvas.width = width;
    canvas.height = height;
    block.appendChild(canvas);
    col.appendChild(block);
    return { key, color, canvas, ctx: canvas.getContext('2d') };
  });
  row.appendChild(col);
  container.appendChild(row);
  if (xLabel) container.appendChild(el('div', 'plot-xaxis-label', xLabel));
  return canvases;
}

// Lets the user reposition any panel by dragging it; clicks on interactive
// controls inside (buttons, inputs, canvases, labels) are left alone so they
// keep working normally.
function makeDraggable(panelEl) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  panelEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, a, canvas, label, .panel-close')) return;
    const rect = panelEl.getBoundingClientRect();
    panelEl.style.position = 'fixed';
    panelEl.style.left = `${rect.left}px`;
    panelEl.style.top = `${rect.top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.margin = '0';
    panelEl.style.zIndex = '15';
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panelEl.setPointerCapture(e.pointerId);
  });
  panelEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panelEl.style.left = `${startLeft + (e.clientX - startX)}px`;
    panelEl.style.top = `${startTop + (e.clientY - startY)}px`;
  });
  const stopDrag = () => {
    dragging = false;
  };
  panelEl.addEventListener('pointerup', stopDrag);
  panelEl.addEventListener('pointercancel', stopDrag);
}

export function mountControlPanel(root) {
  root.innerHTML = '';

  // Panels can each be dismissed with their own close button; `hiddenPanels`
  // tracks that per-panel choice, and the burger menu is the one place that
  // survives hiding everything, to bring panels back.
  const hiddenPanels = {};
  const panels = []; // { id, label, el, autoShow? }

  function applyPanelVisibility() {
    panels.forEach(({ id, el: panelEl, autoShow }) => {
      const wanted = !hiddenPanels[id] && (!autoShow || autoShow());
      panelEl.style.display = wanted ? '' : 'none';
    });
  }

  function registerPanel(id, label, panelEl, autoShow, { movable = true } = {}) {
    const closeBtn = el('button', 'panel-close', '&times;');
    closeBtn.type = 'button';
    closeBtn.title = 'Hide panel';
    closeBtn.addEventListener('click', () => {
      hiddenPanels[id] = true;
      applyPanelVisibility();
      updateBurgerMenu();
    });
    panelEl.appendChild(closeBtn);
    if (movable) makeDraggable(panelEl);
    panels.push({ id, label, el: panelEl, autoShow });
  }

  const plots = el('div', 'panel panel--plots');
  plots.appendChild(el('div', 'panel-label', 'Light curves'));
  const plotCanvases = buildPlotStack(plots, PLOTS, { yLabel: 'Flux', xLabel: 'Time' });
  root.appendChild(plots);
  registerPanel('plots', 'Light curves', plots, () => state.mode === SWITCHING_MODE);

  const readout = el('div', 'panel panel--readout');
  readout.innerHTML = `
    <div class="subtitle" id="state-label">Rotation-powered (radio pulsar)</div>
    <div class="readout-row"><span>Spin period </span><b> ≲30 ms</b></div>
    <div class="readout-row"><span>Orbital period </span><b>≲24 h</b></div>
    <div class="readout-row"><span>Companion mass</span><b>~0.1 M&#9737;</b></div>
    <div class="readout-divider"></div>
  `;
  root.appendChild(readout);
  registerPanel('readout', 'Readout', readout);

  // Each bar's tick positions are fixed (the three modes' reference values
  // never change) — only which tick is "active" moves, so build the ticks
  // once here and just toggle a class in refreshReadout.
  const luminosityBars = LUMINOSITY_BARS.map(({ key, label }) => {
    const row = el('div', 'readout-row readout-row--bar');
    row.appendChild(el('span', null, label));
    const bar = el('div', 'lumbar');
    bar.appendChild(el('div', 'lumbar-track'));
    const ticks = MODE_TARGETS.map((target, i) => {
      const tick = el('div', `lumbar-tick lumbar-tick--${i}`);
      tick.style.left = `${target[key] * 100}%`;
      tick.style.setProperty('--tick-color', MODE_TICK_COLORS[i]);
      bar.appendChild(tick);
      return tick;
    });
    row.appendChild(bar);
    readout.appendChild(row);
    return ticks;
  });

  const views = el('div', 'panel panel--views');
  views.appendChild(el('div', 'panel-label', 'Camera'));
  const viewRow = el('div', 'button-row');
  VIEWS.forEach((v) => {
    const btn = el('button', 'btn', v.label);
    btn.dataset.view = v.id;
    btn.addEventListener('click', () => setState({ view: v.id }));
    viewRow.appendChild(btn);
  });
  views.appendChild(viewRow);
  const resetPhaseBtn = el('button', 'btn btn--wide', 'Reset to phase 0');
  resetPhaseBtn.addEventListener('click', () => {
    // Also frames the camera edge-on to the orbit (see CameraRig's "eclipse"
    // bookmark) so the companion reads as side-on right now, at phase 0, and
    // would visibly eclipse the pulsar a quarter orbit later at phase 0.25.
    setState({ phaseResetToken: state.phaseResetToken + 1, view: 'eclipse' });
  });
  views.appendChild(resetPhaseBtn);
  root.appendChild(views);
  registerPanel('views', 'Camera', views);

  const toggles = el('div', 'panel panel--toggles');
  toggles.appendChild(el('div', 'panel-label', 'Layers'));
  const toggleRows = TOGGLES.map((t) => {
    const row = el('label', 'toggle-row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.toggles[t.key];
    input.addEventListener('change', () => setToggle(t.key, input.checked));
    const labelSpan = el('span', null, t.label);
    row.appendChild(input);
    row.appendChild(labelSpan);
    toggles.appendChild(row);
    return { def: t, row, labelSpan };
  });
  root.appendChild(toggles);
  registerPanel('toggles', 'Layers', toggles);

  const filterPanel = el('div', 'panel panel--filter');
  filterPanel.appendChild(el('div', 'panel-label', 'Filter'));
  const filterRow = el('div', 'button-row');
  FILTER_BANDS.forEach((b) => {
    const btn = el('button', 'btn', b.label);
    btn.dataset.band = b.id;
    btn.addEventListener('click', () => {
      setState({ filterBand: state.filterBand === b.id ? null : b.id });
    });
    filterRow.appendChild(btn);
  });
  filterPanel.appendChild(filterRow);
  root.appendChild(filterPanel);
  registerPanel('filter', 'Filter', filterPanel);

  const lightCurvePanel = el('div', 'panel panel--lightcurves');
  lightCurvePanel.appendChild(el('div', 'panel-label', 'Light curves (2 orbits)'));
  const lightCurveCanvases = buildPlotStack(lightCurvePanel, LIGHT_CURVE_BANDS, {
    height: 46,
    yLabel: 'Flux',
    xLabel: 'Orbital phase',
  });
  lightCurvePanel.appendChild(
    el('div', 'lightcurve-note', 'Phase 0 corresponds to the pulsar’s ascending node.')
  );
  root.appendChild(lightCurvePanel);
  registerPanel('lightcurves', 'Light curves', lightCurvePanel, () => state.mode === 0);

  const transport = el('div', 'panel panel--transport');
  const playBtn = el('button', 'btn btn--icon', '⏸');
  playBtn.addEventListener('click', () => {
    setState({ playing: !state.playing });
    playBtn.textContent = state.playing ? '⏸' : '▶';
  });

  const speedWrap = el('div', 'slider-block slider-block--compact');
  speedWrap.innerHTML = `<span class="slider-label">Speed <b id="speed-val">1.0×</b></span>`;
  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '0';
  speedSlider.max = '4';
  speedSlider.step = '0.05';
  speedSlider.value = String(state.timeScale);
  speedSlider.addEventListener('input', () => {
    const v = parseFloat(speedSlider.value);
    setState({ timeScale: v });
    document.getElementById('speed-val').textContent = `${v.toFixed(2)}×`;
  });
  speedWrap.appendChild(speedSlider);

  const spinWrap = el('div', 'slider-block slider-block--compact');
  spinWrap.innerHTML = `<span class="slider-label">Spin <b id="spin-val">1.0×</b></span>`;
  const spinSlider = document.createElement('input');
  spinSlider.type = 'range';
  spinSlider.min = '0.1';
  spinSlider.max = '5';
  spinSlider.step = '0.05';
  spinSlider.value = String(state.spinSpeed);
  spinSlider.addEventListener('input', () => {
    const v = parseFloat(spinSlider.value);
    setState({ spinSpeed: v });
    document.getElementById('spin-val').textContent = `${v.toFixed(2)}×`;
  });
  spinWrap.appendChild(spinSlider);

  const mainSliderWrap = el('div', 'slider-block slider-block--main');
  const modeLabelsHtml = MODES.map((m) => `<span>${m.label}</span>`).join('');
  mainSliderWrap.innerHTML = `<div class="slider-label slider-label--main">${modeLabelsHtml}</div>`;
  const mainSlider = document.createElement('input');
  mainSlider.type = 'range';
  mainSlider.className = 'main-slider';
  mainSlider.min = '0';
  mainSlider.max = String(MODES.length - 1);
  mainSlider.step = '1';
  mainSlider.value = String(state.mode);
  mainSlider.addEventListener('input', () => {
    setState({ mode: parseInt(mainSlider.value, 10) });
  });
  mainSliderWrap.appendChild(mainSlider);

  transport.appendChild(playBtn);
  transport.appendChild(mainSliderWrap);
  transport.appendChild(speedWrap);
  transport.appendChild(spinWrap);
  root.appendChild(transport);
  registerPanel('transport', 'Controls', transport);

  // Its own panel (rotation-powered only) — the accretion modes drive the
  // companion's heating themselves, so this slider has nothing to do there.
  const irradPanel = el('div', 'panel panel--irradiation');
  irradPanel.appendChild(el('div', 'panel-label', 'Irradiation'));
  const irradWrap = el('div', 'slider-block');
  irradWrap.innerHTML = `<span class="slider-label">Level <b id="irrad-val">100%</b></span>`;
  const irradSlider = document.createElement('input');
  irradSlider.type = 'range';
  irradSlider.min = '0';
  irradSlider.max = '1';
  irradSlider.step = '0.01';
  irradSlider.value = String(state.irradiationLevel);
  irradSlider.addEventListener('input', () => {
    const v = parseFloat(irradSlider.value);
    setState({ irradiationLevel: v });
    document.getElementById('irrad-val').textContent = `${Math.round(v * 100)}%`;
  });
  irradWrap.appendChild(irradSlider);
  irradPanel.appendChild(irradWrap);
  root.appendChild(irradPanel);
  registerPanel('irradiation', 'Irradiation', irradPanel, () => state.mode === 0);

  // Hidden by default — reachable only from the burger menu.
  const aboutPanel = el('div', 'panel panel--about');
  aboutPanel.appendChild(el('div', 'panel-label', 'About'));
  const aboutBody = el('div', 'about-body');
  aboutBody.innerHTML = `
   <p>Made by Maksat Satybaldiev, built entirely with Claude Code.</p>
    <p>Inspired by:</p>
    <ul>
      <li><a href="https://singularity.misterprada.com/" target="_blank" rel="noopener">singularity.misterprada.com</a></li>
      <li><a href="https://svs.gsfc.nasa.gov/11567" target="_blank" rel="noopener">NASA SVS 11567</a></li>
      <li><a href="https://svs.gsfc.nasa.gov/11215" target="_blank" rel="noopener">NASA SVS 11215</a></li>
    </ul>
    <p>It represents the phenomena (physical effects) and models from the following works:</p>
    <ul>
    <li><a href="https://ui.adsabs.harvard.edu/abs/2026arXiv260713019S/abstract" target="_blank" rel="noopener">Satybaldiev & Linares 2026</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2026ApJ...998...94S/abstract" target="_blank" rel="noopener">Satybaldiev, Linares, Vecchiotti 2026</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2023A%26A...677A..30B/abstract" target="_blank" rel="noopener">Baglio et al. 2023</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2023MNRAS.525.2565T" target="_blank" rel="noopener">Turchetta et al. 2023</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2019ApJ...882..104P" target="_blank" rel="noopener">Papitto et al. 2019</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2019ApJ...884..144V" target="_blank" rel="noopener">Veledina et al. 2019</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2018ApJ...856...54B" target="_blank" rel="noopener">Bogdanov et al. 2018</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2017ApJ...839...80W" target="_blank" rel="noopener">Wadiasingh etl al. 2017, </a><a href="https://ui.adsabs.harvard.edu/abs/2018ApJ...869..120W" target="_blank" rel="noopener">2018</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2016ApJ...828....7R/abstract" target="_blank" rel="noopener">Romani & Sanchez 2016</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2014ApJ...795...72L" target="_blank" rel="noopener">Linares 2014</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2013Natur.501..517P/" target="_blank" rel="noopener">Papitto et al. 2013</a></li>
      <li><a href="https://ui.adsabs.harvard.edu/abs/2009Sci...324.1411A" target="_blank" rel="noopener">Archibald et al. 2009</a></li>  
    </ul>
    <p class="about-disclaimer">This is an illustrative animation only — not to scale.</p>
  `;
  aboutPanel.appendChild(aboutBody);
  root.appendChild(aboutPanel);
  registerPanel('about', 'About', aboutPanel, null, { movable: false });
  hiddenPanels.about = true;

  // The burger menu is rendered outside the panel grid (fixed position) so
  // it's always reachable even if every panel above has been hidden.
  const burgerBtn = el('button', 'burger-btn', '&#9776;');
  burgerBtn.type = 'button';
  burgerBtn.title = 'Show/hide panels';
  root.appendChild(burgerBtn);

  const burgerMenu = el('div', 'burger-menu');
  root.appendChild(burgerMenu);

  function updateBurgerMenu() {
    burgerMenu.innerHTML = '';
    panels
      .filter(({ autoShow }) => !autoShow || autoShow())
      .forEach(({ id, label }) => {
        const row = el('label', 'burger-menu-row');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !hiddenPanels[id];
        cb.addEventListener('change', () => {
          hiddenPanels[id] = !cb.checked;
          applyPanelVisibility();
        });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(label));
        burgerMenu.appendChild(row);
      });
  }

  burgerBtn.addEventListener('click', () => burgerMenu.classList.toggle('open'));
  onStateChange(updateBurgerMenu);

  // On phones/small screens, start with every panel tucked away — the
  // burger menu is the way back in.
  if (window.matchMedia('(max-width: 860px)').matches) {
    panels.forEach(({ id }) => {
      hiddenPanels[id] = true;
    });
  }

  updateBurgerMenu();
  applyPanelVisibility();

  function drawPlots() {
    const telemetry = getTelemetry();
    const samples = telemetry.samples;
    plotCanvases.forEach(({ key, color, canvas, ctx }) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (samples.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const age = telemetry.t - s.t;
        const x = w * (1 - age / TELEMETRY_WINDOW_SECONDS);
        const y = h - s[key] * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function drawLightCurves() {
    const cyclePos = ((state.orbitalCycle % LIGHT_CURVE_CYCLES) + LIGHT_CURVE_CYCLES) % LIGHT_CURVE_CYCLES;
    lightCurveCanvases.forEach(({ key, color, canvas, ctx }, bandIndex) => {
      const band = LIGHT_CURVE_BANDS.find((b) => b.key === key);
      const isLast = bandIndex === lightCurveCanvases.length - 1;
      const w = canvas.width;
      const h = canvas.height;
      const plotBottom = isLast ? h - 11 : h; // reserve room for tick labels on the bottom chart
      const samples = sampleLightCurve(band.flux, { cycles: LIGHT_CURVE_CYCLES });
      // A shared, fixed 0..1 flux domain across every band (rather than
      // auto-scaling each curve to its own min/max) — that's the point of a
      // common y-axis: the optical curve's shallow ellipsoidal modulation
      // should visibly NOT fill the axis the way the other bands do.
      const toXY = (x, y) => [(x / LIGHT_CURVE_CYCLES) * w, plotBottom - 4 - y * (plotBottom - 8)];

      ctx.clearRect(0, 0, w, h);

      // Faint gridlines at the phase ticks, with numeric labels under the
      // bottom-most chart only (they'd otherwise repeat needlessly).
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      LIGHT_CURVE_TICKS.forEach((tick) => {
        const x = (tick / LIGHT_CURVE_CYCLES) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
        if (isLast) {
          ctx.fillStyle = 'rgba(142, 162, 196, 0.9)';
          ctx.font = '9px monospace';
          ctx.textAlign = tick === 0 ? 'left' : tick === LIGHT_CURVE_CYCLES ? 'right' : 'center';
          ctx.fillText(tick.toFixed(1), x, h - 1);
        }
      });

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const [x, y] = toXY(s.x, s.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Bright marker tracking the live orbital phase across the curve.
      const [dotX, dotY] = toXY(cyclePos, band.flux(cyclePos));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function refreshReadout() {
    const effMode = displayMode();
    const p = MODE_TARGETS[effMode];
    document.getElementById('state-label').textContent = p.label;
    luminosityBars.forEach((ticks) => {
      ticks.forEach((tick, i) => tick.classList.toggle('active', i === effMode));
    });
    mainSlider.value = String(state.mode);
    viewRow.querySelectorAll('.btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    filterRow.querySelectorAll('.btn').forEach((b) => b.classList.toggle('active', b.dataset.band === state.filterBand));
    toggleRows.forEach(({ def, row, labelSpan }) => {
      row.style.display = def.modes.includes(state.mode) ? '' : 'none';
      labelSpan.textContent = labelFor(def, state.mode);
    });
    applyPanelVisibility();
  }

  mainSlider.addEventListener('input', refreshReadout);
  onStateChange(refreshReadout);
  refreshReadout();

  // The mode-switching sub-mode (and its telemetry), the live orbital phase,
  // and the irradiation slider's light-curve blend are all advanced outside
  // of setState, so poll for them continuously instead of relying solely on
  // the (event-driven) onStateChange refresh.
  (function pollLive() {
    if (state.mode === SWITCHING_MODE) {
      refreshReadout();
      drawPlots();
    } else if (state.mode === 0) {
      drawLightCurves();
    }
    requestAnimationFrame(pollLive);
  })();
}
