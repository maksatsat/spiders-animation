import { createSceneApp } from './scene/SceneApp.js';
import { mountControlPanel } from './ui/ControlPanel.js';

const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui-root');

mountControlPanel(uiRoot);
createSceneApp(canvas).catch((err) => {
  console.error('Failed to start spider-pulsar scene', err);
  uiRoot.insertAdjacentHTML(
    'beforeend',
    `<div class="panel" style="grid-column:1/4;grid-row:2/3;justify-self:center;align-self:center;">
      <b>Rendering failed to start.</b><br/>${err.message ?? err}
    </div>`
  );
});
