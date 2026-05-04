// Affinity Bridge — talks to the helper running locally over WebSocket.
// Ported & adapted to the multi-layer model.
// Send: dropdown choice between active layer or visible composition.
// Pull: incoming images become new ImageLayers.

import { showNotification } from '../../ui/notifications.js';

const DEFAULT_PORT = 39871;

export function initAffinityBridge({ document: doc, renderer }) {
  const sidePanel = document.querySelector('.side-panel');
  if (!sidePanel) return;

  const block = document.createElement('div');
  block.className = 'control-group affinity-block';
  block.innerHTML = `
    <h3 style="display:flex;align-items:center;gap:8px;">
      <i class="fas fa-link"></i><span>AFFINITY</span>
      <span class="affinity-led" id="affLed" title="Disconnected"></span>
    </h3>
    <div class="affinity-row">
      <button class="add-effect-btn" id="affConnect" style="flex:1"><i class="fas fa-plug"></i> Connect</button>
    </div>
    <div class="affinity-row">
      <select class="effect-select" id="affSendMode">
        <option value="active">Send active layer</option>
        <option value="composition">Send visible composition</option>
      </select>
    </div>
    <div class="affinity-row">
      <button class="add-effect-btn" id="affSend" style="flex:1" disabled><i class="fas fa-upload"></i> Send</button>
      <button class="add-effect-btn" id="affPull" style="flex:1" disabled><i class="fas fa-download"></i> Pull</button>
    </div>
  `;
  sidePanel.appendChild(block);

  const led = block.querySelector('#affLed');
  const btnConnect = block.querySelector('#affConnect');
  const btnSend = block.querySelector('#affSend');
  const btnPull = block.querySelector('#affPull');
  const sendModeSel = block.querySelector('#affSendMode');

  let ws = null;

  function setConnected(yes) {
    led.classList.toggle('connected', yes);
    btnSend.disabled = !yes;
    btnPull.disabled = !yes;
    btnConnect.innerHTML = yes
      ? '<i class="fas fa-plug"></i> Connected'
      : '<i class="fas fa-plug"></i> Connect';
  }

  function connect() {
    try { if (ws) ws.close(); } catch {}
    try {
      ws = new WebSocket(`ws://localhost:${DEFAULT_PORT}/`);
    } catch (e) {
      showNotification('Affinity helper not reachable');
      return;
    }
    ws.onopen = () => {
      setConnected(true);
      showNotification('Affinity helper connected');
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => {
      setConnected(false);
      showNotification('Affinity helper not reachable');
    };
    ws.onmessage = async (ev) => {
      try {
        let data;
        if (typeof ev.data === 'string') data = JSON.parse(ev.data);
        else return;
        if (data.type === 'pull-image' && data.dataUrl) {
          const blob = await fetch(data.dataUrl).then((r) => r.blob());
          doc.addImageLayer({ name: data.name || 'Pull from Affinity', source: blob });
          showNotification('Pulled layer from Affinity');
        }
      } catch (e) {
        console.error('[affinity]', e);
      }
    };
  }

  function send() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const mode = sendModeSel.value;
    if (mode === 'active') {
      const layer = doc.activeLayer;
      if (!layer) return showNotification('No active layer');
      const st = renderer.layerState.get(layer.id);
      if (!st) return;
      const dataURL = st.dstCanvas.toDataURL('image/png');
      ws.send(JSON.stringify({ type: 'push-image', name: layer.name, dataUrl: dataURL }));
      showNotification('Sent active layer');
    } else {
      const out = renderer.flattenVisible({ background: null });
      if (!out) return showNotification('Nothing visible');
      const dataURL = out.toDataURL('image/png');
      ws.send(JSON.stringify({ type: 'push-image', name: doc.state.name || 'CRUSH composition', dataUrl: dataURL }));
      showNotification('Sent composition');
    }
  }

  function pull() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'request-pull' }));
  }

  btnConnect.addEventListener('click', connect);
  btnSend.addEventListener('click', send);
  btnPull.addEventListener('click', pull);
}
