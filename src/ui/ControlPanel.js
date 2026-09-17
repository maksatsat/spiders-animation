import { state, setState, setToggle, onStateChange, MODES } from '../state/SimulationState.js';
import { SYSTEM, MODE_TARGETS } from '../physics/systemParams.js';

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
  { key: 'gammaBeam', label: 'Gamma-ray beam', labelByMode: { 2: 'Pulsar wind' }, modes: [0, 2] },
  { key: 'fireLayer', label: 'Ablated material', modes: [0, 1, 2] },
  { key: 'intrabinaryShock', label: 'Intrabinary shock', modes: [0] },
  { key: 'accretionDisk', label: 'Accretion disk', modes: [1, 2] },
  { key: 'jets', label: 'Compact jet', modes: [1, 2] },
  { key: 'bloom', label: 'Glow (bloom)', modes: [0, 1, 2] },
];

function labelFor(def, mode) {
  return (def.labelByMode && def.labelByMode[mode]) || def.label;
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtPct(v) {
  return `${Math.round(v * 100)}%`;
}

export function mountControlPanel(root) {
  root.innerHTML = '';

  const header = el('div', 'panel panel--header');
  header.innerHTML = `
    <div class="title">Spider Pulsar</div>
    <div class="subtitle" id="state-label">Rotation-powered (radio pulsar)</div>
  `;
  root.appendChild(header);

  const readout = el('div', 'panel panel--readout');
  readout.innerHTML = `
    <div class="readout-row"><span>Distance</span><b>${SYSTEM.distanceLy.toLocaleString()} ly</b></div>
    <div class="readout-row"><span>Orbital period</span><b>${SYSTEM.orbitalPeriodHours} h</b></div>
    <div class="readout-row"><span>Pulsar mass</span><b>${SYSTEM.pulsarMassSolar} M&#9737;</b></div>
    <div class="readout-row"><span>Companion mass</span><b>${SYSTEM.companionMassSolar} M&#9737;</b></div>
    <div class="readout-divider"></div>
    <div class="readout-row"><span>Radio luminosity</span><b id="r-radio">—</b></div>
    <div class="readout-row"><span>Gamma-ray luminosity</span><b id="r-gamma">—</b></div>
    <div class="readout-row"><span>X-ray luminosity</span><b id="r-xray">—</b></div>
    <div class="readout-row"><span>Mass-transfer rate</span><b id="r-mdot">—</b></div>
  `;
  root.appendChild(readout);

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
  root.appendChild(views);

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

  function refreshReadout() {
    const p = MODE_TARGETS[state.mode];
    document.getElementById('state-label').textContent = p.label;
    document.getElementById('r-radio').textContent = fmtPct(p.radioLuminosity);
    document.getElementById('r-gamma').textContent = fmtPct(p.gammaLuminosity);
    document.getElementById('r-xray').textContent = fmtPct(p.xrayLuminosity);
    document.getElementById('r-mdot').textContent = fmtPct(p.massTransferRate);
    mainSlider.value = String(state.mode);
    viewRow.querySelectorAll('.btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    toggleRows.forEach(({ def, row, labelSpan }) => {
      row.style.display = def.modes.includes(state.mode) ? '' : 'none';
      labelSpan.textContent = labelFor(def, state.mode);
    });
  }

  mainSlider.addEventListener('input', refreshReadout);
  onStateChange(refreshReadout);
  refreshReadout();
}
