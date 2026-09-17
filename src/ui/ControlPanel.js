import { state, setState, setToggle, onStateChange, MODES } from '../state/SimulationState.js';
import { SYSTEM, MODE_TARGETS } from '../physics/systemParams.js';

const VIEWS = [
  { id: 'earth', label: 'Earth View' },
  { id: 'orbital', label: 'Orbital Plane' },
  { id: 'top', label: 'Top-Down' },
  { id: 'free', label: 'Free' },
];

const TOGGLES = [
  { key: 'radioBeam', label: 'Radio beam' },
  { key: 'gammaBeam', label: 'Gamma-ray beam' },
  { key: 'ablationTail', label: 'Gas / ablation tail' },
  { key: 'accretionDisk', label: 'Accretion disk' },
  { key: 'jets', label: 'Jets' },
  { key: 'bloom', label: 'Glow (bloom)' },
];

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
    <div class="system-line">modeled on ${SYSTEM.name} — "${SYSTEM.nickname}"</div>
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
  TOGGLES.forEach((t) => {
    const row = el('label', 'toggle-row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.toggles[t.key];
    input.addEventListener('change', () => setToggle(t.key, input.checked));
    row.appendChild(input);
    row.appendChild(el('span', null, t.label));
    toggles.appendChild(row);
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

  const mainSliderWrap = el('div', 'slider-block slider-block--main');
  mainSliderWrap.innerHTML = `
    <div class="slider-label slider-label--main">
      <span>Rotation-powered</span>
      <span>High X-ray</span>
      <span>Low mode</span>
    </div>
  `;
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
  }

  mainSlider.addEventListener('input', refreshReadout);
  onStateChange(refreshReadout);
  refreshReadout();
}
