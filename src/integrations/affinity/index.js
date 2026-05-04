// Affinity bridge — SSE + JSON-RPC 2.0 to Affinity Photo 2's bundled MCP server.
// Default endpoint: http://localhost:6767/sse (override via Shift+click on Connect).
//
// Send: pushes the active layer's rendered canvas, or the visible composition,
// as a new pixel layer in the active Affinity document.
// Pull: takes the selected Affinity layer and adds it as a new image layer.

import { showNotification } from '../../ui/notifications.js';

const DEFAULT_MCP_URL = 'http://localhost:6767/sse';
const MCP_URL_KEY = 'slammer:affinityMcpUrl';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const RECONNECT_DELAYS = [1000, 2000, 5000, 15000, 30000];
const FLASH_MS = 2000;

function getMcpUrl() {
  try { return localStorage.getItem(MCP_URL_KEY) || DEFAULT_MCP_URL; }
  catch { return DEFAULT_MCP_URL; }
}
function setMcpUrl(v) {
  try {
    if (v) localStorage.setItem(MCP_URL_KEY, v);
    else   localStorage.removeItem(MCP_URL_KEY);
  } catch {}
}

export function initAffinityBridge({ document: doc, renderer }) {
  const mount = document.getElementById('affinityMount');
  if (!mount) return;

  // ---------- DOM ----------
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
      <div class="affinity-status-row">
        <span class="affinity-led-inline" id="affLedInline"></span>
        <span class="affinity-status-text" id="affStatus">Not connected</span>
      </div>
      <div class="affinity-row">
        <button class="affinity-btn" id="affConnect" title="Connect to Affinity (Shift+click to change MCP URL)">
          <i class="fas fa-link"></i> <span>Connect</span>
        </button>
      </div>
      <div class="affinity-row">
        <select class="effect-select" id="affSendMode">
          <option value="active">Active layer</option>
          <option value="composition">Visible composition</option>
        </select>
      </div>
      <div class="affinity-row">
        <button class="affinity-btn" id="affSend" disabled><i class="fas fa-upload"></i> <span>Send</span></button>
        <button class="affinity-btn" id="affPull" disabled><i class="fas fa-download"></i> <span>Pull</span></button>
      </div>
    </div>
  `;

  const trigger = mount.querySelector('#affinityTrigger');
  const slideout = mount.querySelector('#affinitySlideout');
  const closeBtn = mount.querySelector('#affClose');
  const led = mount.querySelector('#affLed');
  const ledInline = mount.querySelector('#affLedInline');
  const statusText = mount.querySelector('#affStatus');
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

  // ---------- Connection state ----------
  const state = {
    connected: false,
    busy: false,
    eventSource: null,
    postEndpoint: null,
    nextId: 1,
    pending: new Map(),
    hasDocument: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    wantReconnect: false,
    flashTimer: null,
  };

  function setStatusUI(kind, text) {
    statusText.textContent = text;
    led.classList.remove('connected', 'busy', 'error');
    ledInline.classList.remove('connected', 'busy', 'error');
    if (kind) {
      led.classList.add(kind);
      ledInline.classList.add(kind);
    }
  }
  function syncButtons() {
    const cIcon = btnConnect.querySelector('i');
    const cLabel = btnConnect.querySelector('span');
    if (cIcon) cIcon.className = state.connected ? 'fas fa-unlink' : 'fas fa-link';
    if (cLabel) cLabel.textContent = state.connected ? 'Disconnect' : 'Connect';
    btnConnect.disabled = state.busy;
    const usable = state.connected && !state.busy && state.hasDocument;
    btnSend.disabled = !usable;
    btnPull.disabled = !usable;
    const hint = !state.hasDocument && state.connected ? ' (no document open in Affinity)' : '';
    btnSend.title = 'Send to Affinity' + hint;
    btnPull.title = 'Pull from Affinity' + hint;
  }

  setStatusUI(null, 'Not connected');
  syncButtons();

  // ---------- JSON-RPC ----------
  function rpcNotify(method, params) {
    return fetch(state.postEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    });
  }
  function rpcCall(method, params, timeoutMs = 120000) {
    const id = state.nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`JSON-RPC ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      state.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject:  (e) => { clearTimeout(timer); reject(e);  },
      });
      fetch(state.postEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch((e) => {
        if (state.pending.has(id)) {
          state.pending.delete(id);
          clearTimeout(timer);
          reject(e);
        }
      });
    });
  }
  function handleSseMessage(evt) {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    if (msg.id != null && state.pending.has(msg.id)) {
      const entry = state.pending.get(msg.id);
      state.pending.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message || JSON.stringify(msg.error));
        err.rpcCode = msg.error.code;
        err.rpcData = msg.error.data;
        entry.reject(err);
      } else {
        entry.resolve(msg.result);
      }
    }
  }

  async function probeHasDocument() {
    try {
      const result = await rpcCall('tools/call', {
        name: 'execute_script',
        arguments: {
          script:
            "const {Document}=require('/document');" +
            "console.log(JSON.stringify({ok:true,hasDoc:!!Document.current}));",
        },
      }, 10000);
      const payload = parseScriptPayload(result);
      return !!payload.hasDoc;
    } catch { return false; }
  }

  function parseScriptPayload(result) {
    const text = (result.content || []).map((c) => c.text || '').join('\n').trim();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.startsWith('{') && l.endsWith('}')) {
        try { return JSON.parse(l); } catch {}
      }
    }
    throw new Error('Unexpected script output: ' + text.slice(0, 200));
  }

  function mapError(code) {
    switch (code) {
      case 'NO_DOC':                 return 'Open a document in Affinity first.';
      case 'NO_SELECTION':           return 'Select a layer in Affinity before pulling.';
      case 'UNSUPPORTED':            return 'Select a pixel, image, vector, or text layer.';
      case 'BAD_FORMAT':             return 'Layer format not supported (expected RGBA8 or RGBA16).';
      case 'UNSUPPORTED_DOC_FORMAT': return 'Document format not supported. Convert to RGB first.';
      case 'ADD_FAILED':             return 'Affinity refused to add the layer';
      case 'RENDER_FAILED':          return 'Affinity failed to render the selection';
      default:                       return code || 'Unknown error';
    }
  }

  function flashSuccess(msg) {
    setStatusUI('connected', msg);
    if (state.flashTimer) clearTimeout(state.flashTimer);
    state.flashTimer = setTimeout(() => {
      if (state.connected && !state.busy) {
        setStatusUI('connected', state.hasDocument ? 'Connected' : 'Connected — open a document');
      }
    }, FLASH_MS);
  }

  // ---------- Connect / Disconnect ----------
  async function connect() {
    if (state.connected || state.busy) return;
    state.wantReconnect = true;
    state.busy = true;
    setStatusUI('busy', 'Connecting…');
    syncButtons();
    const url = getMcpUrl();
    try {
      const es = new EventSource(url);
      state.eventSource = es;
      const endpoint = await new Promise((resolve, reject) => {
        const onErr = () => reject(new Error(`Could not reach Affinity MCP server at ${url}. Is Affinity Photo open with MCP enabled?`));
        es.addEventListener('endpoint', (e) => {
          es.removeEventListener('error', onErr);
          const origin = new URL(url).origin;
          resolve(new URL(e.data, origin).toString());
        }, { once: true });
        es.addEventListener('error', onErr, { once: true });
      });
      state.postEndpoint = endpoint;
      es.addEventListener('message', handleSseMessage);
      es.addEventListener('error', () => {
        if (state.connected) {
          setStatusUI('error', 'Connection lost — reconnecting…');
          scheduleReconnect();
        }
      });

      // Try known protocol versions; on rejection, append server-advertised supported list.
      let initResult = null;
      let lastError = null;
      const tried = new Set();
      const queue = PROTOCOL_VERSIONS.slice();
      while (queue.length) {
        const pv = queue.shift();
        if (tried.has(pv)) continue;
        tried.add(pv);
        try {
          initResult = await rpcCall('initialize', {
            protocolVersion: pv,
            capabilities: {},
            clientInfo: { name: 'slammer-web', version: '1.0' },
          }, 15000);
          break;
        } catch (e) {
          lastError = e;
          const supported = e?.rpcData?.supported;
          if (Array.isArray(supported) && supported.length) {
            for (let i = supported.length - 1; i >= 0; i--) {
              if (!tried.has(supported[i])) queue.unshift(supported[i]);
            }
          }
        }
      }
      if (!initResult) throw lastError || new Error('initialize failed for every known protocol version');

      await rpcNotify('notifications/initialized', {});
      // Required preamble — without this, execute_script silently breaks later.
      await rpcCall('tools/call', { name: 'read_sdk_documentation_topic', arguments: { filename: 'preamble' } }, 10000);

      state.connected = true;
      state.reconnectAttempts = 0;
      state.hasDocument = await probeHasDocument();
      setStatusUI('connected', state.hasDocument ? 'Connected' : 'Connected — open a document');
    } catch (e) {
      teardown();
      setStatusUI('error', e.message);
      scheduleReconnect();
    } finally {
      state.busy = false;
      syncButtons();
    }
  }

  function scheduleReconnect() {
    if (!state.wantReconnect) return;
    teardown();
    const i = Math.min(state.reconnectAttempts, RECONNECT_DELAYS.length - 1);
    const delay = RECONNECT_DELAYS[i];
    state.reconnectAttempts++;
    if (state.reconnectAttempts > RECONNECT_DELAYS.length) {
      setStatusUI('error', 'Reconnect gave up. Click Connect to retry.');
      state.wantReconnect = false;
      syncButtons();
      return;
    }
    setStatusUI('error', `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${state.reconnectAttempts})`);
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connect, delay);
  }

  function teardown() {
    if (state.eventSource) {
      try { state.eventSource.close(); } catch {}
      state.eventSource = null;
    }
    state.postEndpoint = null;
    state.connected = false;
    state.hasDocument = false;
    for (const { reject } of state.pending.values()) {
      try { reject(new Error('Disconnected')); } catch {}
    }
    state.pending.clear();
  }

  function disconnect() {
    state.wantReconnect = false;
    state.reconnectAttempts = 0;
    clearTimeout(state.reconnectTimer);
    teardown();
    setStatusUI(null, 'Not connected');
    syncButtons();
  }

  // ---------- Send ----------
  function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function getCanvasForSend() {
    const mode = sendModeSel.value;
    if (mode === 'active') {
      const layer = doc.activeLayer;
      if (!layer) return { canvas: null, name: null, error: 'No active layer to send.' };
      const st = renderer.layerState.get(layer.id);
      if (!st || !st.dstCanvas) return { canvas: null, name: null, error: 'Active layer has no rendered output.' };
      return { canvas: st.dstCanvas, name: layer.name || 'Layer' };
    }
    const out = renderer.flattenVisible({ background: null });
    if (!out) return { canvas: null, name: null, error: 'Nothing visible to send.' };
    return { canvas: out, name: doc.state.name || 'slammer composition' };
  }

  async function send() {
    if (!state.connected || state.busy) return;
    const { canvas, name, error } = getCanvasForSend();
    if (!canvas) { setStatusUI('error', error); showNotification(error); return; }
    if (!canvas.width || !canvas.height) {
      setStatusUI('error', 'Empty canvas — nothing to send.');
      return;
    }
    state.busy = true;
    setStatusUI('busy', 'Sending…');
    syncButtons();

    try {
      const W = canvas.width, H = canvas.height;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, W, H);
      const b64 = bytesToBase64(new Uint8Array(imgData.data.buffer));
      const time = new Date().toTimeString().slice(0, 5);
      const layerName = `slammer · ${name} · ${time}`;
      const script = buildSendScript(W, H, b64, layerName);
      const result = await rpcCall('tools/call', { name: 'execute_script', arguments: { script } }, 300000);
      const payload = parseScriptPayload(result);
      if (!payload.ok) throw new Error(mapError(payload.error) + (payload.detail ? ` (${payload.detail})` : ''));
      flashSuccess(`Sent ✓ ${payload.name}`);
    } catch (e) {
      setStatusUI('error', 'Send failed: ' + e.message);
    } finally {
      state.busy = false;
      syncButtons();
    }
  }

  function buildSendScript(W, H, b64, layerName) {
    return `
'use strict';
const { Document } = require('/document');
const { RasterFormat, PixelBuffer, Bitmap } = require('/rasterobject');
const { RasterNodeDefinition } = require('/nodes');
const { Rectangle } = require('/geometry');

const doc = Document.current;
if (!doc) { console.log(JSON.stringify({ok:false, error:'NO_DOC'})); } else {
  const W = ${W}, H = ${H};
  const b64 = ${JSON.stringify(b64)};
  function b64bytes(s) {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lut = new Uint8Array(128);
    for (let i = 0; i < CHARS.length; i++) lut[CHARS.charCodeAt(i)] = i;
    const sl = s.length;
    let pad = 0;
    if (s.charCodeAt(sl - 1) === 61) pad++;
    if (s.charCodeAt(sl - 2) === 61) pad++;
    const outLen = (sl * 3) / 4 - pad;
    const out = new Uint8Array(outLen);
    let o = 0;
    for (let i = 0; i < sl; i += 4) {
      const a = lut[s.charCodeAt(i)];
      const b = lut[s.charCodeAt(i + 1)];
      const c = lut[s.charCodeAt(i + 2)];
      const d = lut[s.charCodeAt(i + 3)];
      if (o < outLen) out[o++] = (a << 2) | (b >> 4);
      if (o < outLen) out[o++] = ((b & 15) << 4) | (c >> 2);
      if (o < outLen) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
  }
  const bin = b64bytes(b64);
  let docFormat = null;
  try {
    const all = Array.from(doc.layers);
    for (const n of all) {
      if (n.isRasterNode || n.isImageNode) {
        const probe = n.rasterInterface.createCompatibleBuffer(false);
        docFormat = probe.format;
        break;
      }
    }
  } catch (e) {}
  function tryAdd(fmt) {
    const pbuf = PixelBuffer.create(W, H, fmt);
    const dstBuf = pbuf.buffer;
    if (fmt.value === RasterFormat.RGBA8.value) {
      const dst = new Uint8Array(dstBuf);
      for (let i = 0; i < bin.length; i++) dst[i] = bin[i];
    } else if (fmt.value === RasterFormat.RGBA16.value) {
      const dst = new Uint16Array(dstBuf);
      for (let i = 0; i < bin.length; i++) dst[i] = bin[i] * 257;
    } else {
      throw new Error('UNSUPPORTED_DOC_FORMAT');
    }
    const bmp = Bitmap.create(W, H, fmt);
    pbuf.copyTo(bmp, new Rectangle(0, 0, W, H), 0, 0);
    const nodeDef = RasterNodeDefinition.create(fmt);
    nodeDef.bitmap = bmp;
    doc.addNode(nodeDef);
  }
  try {
    if (docFormat) { tryAdd(docFormat); }
    else { try { tryAdd(RasterFormat.RGBA8); } catch (e) { tryAdd(RasterFormat.RGBA16); } }
    const newly = Array.from(doc.selection.nodes);
    if (newly.length) { try { newly[0].name = ${JSON.stringify(layerName)}; } catch (e) {} }
    console.log(JSON.stringify({ok:true, name: ${JSON.stringify(layerName)}}));
  } catch (e) {
    if (String(e.message).includes('UNSUPPORTED_DOC_FORMAT')) {
      console.log(JSON.stringify({ok:false, error:'UNSUPPORTED_DOC_FORMAT'}));
    } else {
      console.log(JSON.stringify({ok:false, error:'ADD_FAILED', detail: e.message}));
    }
  }
}
`;
  }

  // ---------- Pull ----------
  function rasterPayloadToDataUrl(W, H, b64) {
    const bin = atob(b64);
    const bytes = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(new ImageData(bytes, W, H), 0, 0);
    return tmp.toDataURL('image/png');
  }

  function trimAlphaEdges(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const W = c.width, H = c.height;
        if (!W || !H) { resolve(dataUrl); return; }
        const data = ctx.getImageData(0, 0, W, H).data;
        let minX = W, minY = H, maxX = -1, maxY = -1;
        for (let y = 0; y < H; y++) {
          const row = y * W * 4;
          for (let x = 0; x < W; x++) {
            if (data[row + x * 4 + 3] > 0) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0 || maxY < 0) { resolve(dataUrl); return; }
        const tw = maxX - minX + 1;
        const th = maxY - minY + 1;
        if (tw === W && th === H) { resolve(dataUrl); return; }
        const out = document.createElement('canvas');
        out.width = tw; out.height = th;
        out.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
        resolve(out.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function pull() {
    if (!state.connected || state.busy) return;
    state.busy = true;
    setStatusUI('busy', 'Pulling…');
    syncButtons();
    try {
      const renderScript = `
'use strict';
const { Document } = require('/document');
const { RasterFormat, NodeRenderingEngine } = require('/rasterobject');
const doc = Document.current;
if (!doc) { console.log('SLAMMER_DATA:' + JSON.stringify({ok:false, error:'NO_DOC'})); } else {
  const sel = Array.from(doc.selection.nodes)[0];
  if (!sel) { console.log('SLAMMER_DATA:' + JSON.stringify({ok:false, error:'NO_SELECTION'})); } else {
    try {
      const engine = NodeRenderingEngine.createDefault(sel, RasterFormat.RGBA8);
      const pbuf = engine.createCompatibleBuffer(true);
      const W = pbuf.width;
      const H = pbuf.height;
      const rgba8 = new Uint8Array(pbuf.buffer);
      const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let b64 = '';
      const len = rgba8.length;
      let i = 0;
      for (; i + 2 < len; i += 3) {
        const a = rgba8[i], b = rgba8[i + 1], c = rgba8[i + 2];
        b64 += CHARS[a >> 2] + CHARS[((a & 3) << 4) | (b >> 4)] + CHARS[((b & 15) << 2) | (c >> 6)] + CHARS[c & 63];
      }
      if (i < len) {
        const a = rgba8[i], b = i + 1 < len ? rgba8[i + 1] : 0;
        b64 += CHARS[a >> 2] + CHARS[((a & 3) << 4) | (b >> 4)];
        if (i + 1 < len) { b64 += CHARS[(b & 15) << 2] + '='; }
        else { b64 += '=='; }
      }
      console.log('SLAMMER_DATA:' + JSON.stringify({ ok: true, name: sel.name || '', W, H, b64 }));
    } catch (e) {
      console.log('SLAMMER_DATA:' + JSON.stringify({ ok: false, error: 'RENDER_FAILED', detail: String(e.message || e) }));
    }
  }
}
`;
      const renderResult = await rpcCall('tools/call', { name: 'execute_script', arguments: { script: renderScript } }, 300000);
      const rText = ((renderResult && renderResult.content) || []).map((c) => c.text || '').join('\n');
      const marker = rText.indexOf('SLAMMER_DATA:');
      if (marker < 0) throw new Error('Unexpected script output: ' + rText.slice(0, 200));
      const pl = JSON.parse(rText.slice(marker + 'SLAMMER_DATA:'.length).split(/\r?\n/)[0]);
      if (!pl.ok) throw new Error(mapError(pl.error) + (pl.detail ? ` (${pl.detail})` : ''));

      const rawUrl = rasterPayloadToDataUrl(pl.W, pl.H, pl.b64);
      const trimmed = await trimAlphaEdges(rawUrl);
      const blob = await fetch(trimmed).then((r) => r.blob());
      doc.addImageLayer({ name: pl.name || 'Pulled from Affinity', source: blob });
      flashSuccess(`Pulled ✓ ${pl.name || 'layer'}`);
    } catch (e) {
      setStatusUI('error', 'Pull failed: ' + e.message);
    } finally {
      state.busy = false;
      syncButtons();
    }
  }

  // ---------- URL prompt ----------
  function promptForMcpUrl() {
    const current = getMcpUrl();
    const next = window.prompt('Affinity MCP SSE URL', current);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      setMcpUrl(null);
      setStatusUI(null, `MCP URL reset to default (${DEFAULT_MCP_URL})`);
      return;
    }
    try { new URL(trimmed); } catch {
      setStatusUI('error', 'Invalid URL: ' + trimmed);
      return;
    }
    setMcpUrl(trimmed);
    setStatusUI(null, 'MCP URL set. Click Connect.');
  }

  // ---------- Wire ----------
  btnConnect.addEventListener('click', (e) => {
    if (e.shiftKey && !state.connected) { promptForMcpUrl(); return; }
    state.connected ? disconnect() : connect();
  });
  btnSend.addEventListener('click', send);
  btnPull.addEventListener('click', pull);

  return { connect, disconnect, send, pull };
}
