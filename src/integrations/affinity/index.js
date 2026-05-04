// Affinity Bridge — talks to the helper running locally over WebSocket.
// Ported & adapted to the multi-layer model.
// Send: dropdown choice between active layer or visible composition.
// Pull: incoming images become new ImageLayers.

import { showNotification } from '../../ui/notifications.js';

const DEFAULT_PORT = 39871;

export function initAffinityBridge({ document: doc, renderer }) {
  const mount = document.getElementById('affinityMount');
  if (!mount) return;

  mount.innerHTML = `
    <button class="tb-btn tb-btn--icon affinity-trigger" id="affinityTrigger" title="Affinity Bridge" aria-expanded="false">
      <i class="fas fa-link"></i>
      <span class="affinity-led" id="affLed" title="Disconnected"></span>
    </button>
    <div class="affinity-slideout" id="affinitySlideout" hidden>
      <div class="affinity-slideout-header">
        <span class="affinity-title">AFFINITY</span>
        <button class="affinity-close" id="affClose" title="Close" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
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
    </div>
  `;

  const trigger = mount.querySelector('#affinityTrigger');
  const slideout = mount.querySelector('#affinitySlideout');
  const closeBtn = mount.querySelector('#affClose');
  const led = mount.querySelector('#affLed');
  const btnConnect = mount.querySelector('#affConnect');
  const btnSend = mount.querySelector('#affSend');
  const btnPull = mount.querySelector('#affPull');
  const sendModeSel = mount.querySelector('#affSendMode');

  function openSlideout() {
    slideout.hidden = false;
    requestAnimationFrame(() => slideout.classList.add('open'));
    trigger.setAttribute('aria-expanded', 'true');
  }
  function closeSlideout() {
    slideout.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!slideout.classList.contains('open')) slideout.hidden = true; }, 200);
  }
  trigger.addEventListener('click', () => {
    if (trigger.getAttribute('aria-expanded') === 'true') closeSlideout();
    else openSlideout();
  });
  closeBtn.addEventListener('click', closeSlideout);
  document.addEventListener('click', (e) => {
    if (!mount.contains(e.target) && trigger.getAttribute('aria-expanded') === 'true') closeSlideout();
  });

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
      ws.send(JSON.stringify({ type: 'push-image', name: doc.state.name || 'slammer composition', dataUrl: dataURL }));
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
