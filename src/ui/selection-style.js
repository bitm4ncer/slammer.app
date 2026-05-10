// Selection-style — Illustrator-style "selected layer drives the colour hub"
// glue layer.
//
// When a vector or text layer is selected, the colour hub + footer dial
// read THAT layer's fill / stroke / strokeWidth / opacity instead of the
// default `_active` state in colors.js. Writes from the hub flow to the
// selected layer too, AND update the active state so newly-created layers
// inherit the most-recently-used style.
//
// Selection rules:
//   • When 1+ vector / text layers are selected: read from the FIRST
//     selected layer (anchor). Writes apply to ALL selected vector / text
//     layers (Illustrator's "matching attributes" parity).
//   • When NO vector / text layer is selected: fall back to the active
//     state in colors.js. Writes update `_active` only.
//
// Multi-path vector layers: writes hit ALL paths. Reads use path[0] as the
// canonical sample (consistent with the active sub-path being path[0] for
// single-path layers, which is the common case).
//
// onEffectiveStyleChange(cb): fires when the effective style might have
// changed — selection swap OR active-state change OR document change to a
// selected layer's fill / stroke. Subscribers re-read via
// getEffectiveStyle() and repaint.

import {
  getActiveFill, getActiveStroke,
  getActiveKind, setActiveKind,
  getActiveStrokeWidth, setActiveStrokeWidth,
  getActiveOpacity, setActiveOpacity,
  getActiveGradient, setActiveGradient,
  setActiveSlot,
  onActiveChange,
} from '../core/colors.js';
import { getSelectionArray, getAnchor, onSelectionChange } from './selection-state.js';

let _doc = null;
const listeners = new Set();

export function attachSelectionStyle(doc) {
  _doc = doc;
  // Selection swap → re-emit effective style (colour hub + dial repaint).
  onSelectionChange(() => emit());
  // Active state → re-emit (so writes that go to active still update UI).
  onActiveChange(() => emit());
  // Document changes — vectorChanged + textChanged on a selected layer
  // also need to fire a repaint (other tools might mutate the layer).
  doc.subscribe((evt) => {
    if (!evt) return;
    if (evt.type === 'layer:vectorChanged' && isSelected(evt.id)) emit();
    else if (evt.type === 'layer:textChanged' && evt.prop === 'color' && isSelected(evt.id)) emit();
  });
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('[selection-style] listener', e); }
  }
}

export function onEffectiveStyleChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isSelected(id) {
  return getSelectionArray().includes(id);
}

// Returns the FIRST selected vector / text layer (anchor first), or null.
function pickedLayer() {
  if (!_doc) return null;
  const anchor = getAnchor();
  const ids = anchor != null ? [anchor, ...getSelectionArray().filter((id) => id !== anchor)] : getSelectionArray();
  for (const id of ids) {
    const layer = _doc.findLayer(id);
    if (!layer) continue;
    if (layer.type === 'vector' || layer.type === 'text') return layer;
  }
  return null;
}

// All selected vector / text layers — for write fan-out.
function pickedLayers() {
  if (!_doc) return [];
  return getSelectionArray()
    .map((id) => _doc.findLayer(id))
    .filter((l) => l && (l.type === 'vector' || l.type === 'text'));
}

// ---------------------------------------------------------------------------
// READ — returns the effective {fill, stroke, strokeWidth, ...} for either
// the selected layer or the active state.
// ---------------------------------------------------------------------------

export function getEffectiveStyle() {
  const layer = pickedLayer();
  if (layer) {
    if (layer.type === 'vector') {
      const path0 = layer.vector?.paths?.[0];
      const fill = path0?.fill || { type: 'solid', color: '#ffffff', opacity: 1 };
      const stroke = path0?.stroke || { type: 'none', color: '#000000', width: 2, opacity: 1 };
      return {
        source: 'layer',
        layerId: layer.id,
        fillKind: fill.type === 'gradient' ? 'gradient' : (fill.type === 'none' ? 'none' : 'solid'),
        strokeKind: stroke.type === 'gradient' ? 'gradient' : (stroke.type === 'none' ? 'none' : 'solid'),
        fill: fill.color || '#ffffff',
        stroke: stroke.color || '#000000',
        fillOpacity: Number.isFinite(fill.opacity) ? fill.opacity : 1,
        strokeOpacity: Number.isFinite(stroke.opacity) ? stroke.opacity : 1,
        strokeWidth: Number.isFinite(stroke.width) ? stroke.width : 2,
        fillGradient: fill.type === 'gradient' ? gradientFromVectorFill(fill) : getActiveGradient('fill'),
        strokeGradient: stroke.type === 'gradient' ? gradientFromVectorFill(stroke) : getActiveGradient('stroke'),
      };
    }
    // Text layer. The rasteriser only honours `text.color` (a solid
    // fill — no gradient, no stroke). So both fillKind AND strokeKind
    // fall back to the active state, letting the user navigate the
    // mode pills and set defaults for the next vector they create.
    // Writes to stroke / non-solid fill / stroke-width / opacity all
    // no-op on the text layer itself (applySlot* skip non-vector
    // layers); the active-state side-effect still happens so
    // newly-created vectors inherit the chosen look.
    //
    // The fill HEX still mirrors text.color when the user is in solid
    // mode — that's the one place text actually responds to writes.
    return {
      source: 'layer',
      layerId: layer.id,
      fillKind: getActiveKind('fill'),
      strokeKind: getActiveKind('stroke'),
      fill: getActiveKind('fill') === 'solid' ? (layer.text?.color || '#ffffff') : getActiveFill(),
      stroke: getActiveStroke(),
      fillOpacity: getActiveOpacity('fill'),
      strokeOpacity: getActiveOpacity('stroke'),
      strokeWidth: getActiveStrokeWidth(),
      fillGradient: getActiveGradient('fill'),
      strokeGradient: getActiveGradient('stroke'),
    };
  }
  // Fall back to active state.
  return {
    source: 'active',
    layerId: null,
    fillKind: getActiveKind('fill'),
    strokeKind: getActiveKind('stroke'),
    fill: getActiveFill(),
    stroke: getActiveStroke(),
    fillOpacity: getActiveOpacity('fill'),
    strokeOpacity: getActiveOpacity('stroke'),
    strokeWidth: getActiveStrokeWidth(),
    fillGradient: getActiveGradient('fill'),
    strokeGradient: getActiveGradient('stroke'),
  };
}

function gradientFromVectorFill(f) {
  return {
    type: f.gradientType || 'linear',
    angle: Number.isFinite(f.angle) ? f.angle : 90,
    stops: Array.isArray(f.stops) ? f.stops.map((s) => ({ at: s.at, color: s.color })) : [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }],
  };
}

// ---------------------------------------------------------------------------
// WRITE — apply a slot colour / kind / strokeWidth / opacity / gradient to
// (a) every selected vector / text layer AND (b) the active state.
// Each write passes through the document so undo + autosave catch it; the
// active-state copy is so the next-created layer inherits the same look.
// ---------------------------------------------------------------------------

export function applySlotColor(slot, hex) {
  // Active state always tracks the latest pick.
  setActiveSlot(slot, hex);
  for (const layer of pickedLayers()) {
    if (layer.type === 'vector') {
      const paths = layer.vector?.paths || [];
      paths.forEach((p, idx) => {
        if (slot === 'fill') {
          const next = { ...(p.fill || {}), type: p.fill?.type === 'gradient' ? 'gradient' : 'solid', color: hex };
          if (p.fill?.type === 'gradient') {
            // For gradient fills, hex applies to the stop being edited —
            // caller should use applySlotGradient for full gradient writes.
            // Here we don't change the fill kind; just no-op and let active
            // state carry the colour. (Callers that DO want to flip a layer
            // from gradient → solid should use applySlotKind.)
          } else {
            _doc.setVectorFill(layer.id, idx, next);
          }
        } else {
          const next = { ...(p.stroke || {}), type: p.stroke?.type === 'gradient' ? 'gradient' : 'solid', color: hex };
          if (p.stroke?.type !== 'gradient') {
            _doc.setVectorStroke(layer.id, idx, next);
          }
        }
      });
    } else if (layer.type === 'text' && slot === 'fill') {
      _doc.setTextProp(layer.id, 'color', hex);
    }
  }
}

export function applySlotKind(slot, kind) {
  setActiveKind(slot, kind);
  for (const layer of pickedLayers()) {
    if (layer.type !== 'vector') continue;
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      const cur = slot === 'fill' ? p.fill : p.stroke;
      let next;
      if (kind === 'none') {
        next = { ...(cur || {}), type: 'none' };
      } else if (kind === 'gradient') {
        const g = getActiveGradient(slot);
        next = {
          ...(cur || {}),
          type: 'gradient',
          gradientType: g.type, angle: g.angle,
          stops: g.stops.map((s) => ({ ...s })),
          from: { x: 0, y: 0 }, to: { x: 1, y: 0 },
        };
      } else {
        // solid
        const color = slot === 'fill' ? getActiveFill() : getActiveStroke();
        next = { ...(cur || {}), type: 'solid', color };
      }
      if (slot === 'fill') _doc.setVectorFill(layer.id, idx, next);
      else                 _doc.setVectorStroke(layer.id, idx, next);
    });
  }
}

export function applySlotGradient(slot, gradient) {
  setActiveGradient(slot, gradient);
  for (const layer of pickedLayers()) {
    if (layer.type !== 'vector') continue;
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      const cur = slot === 'fill' ? p.fill : p.stroke;
      if (cur?.type !== 'gradient') return; // only mutate paths already in gradient mode
      const next = {
        ...cur,
        gradientType: gradient.type,
        angle: gradient.angle,
        stops: gradient.stops.map((s) => ({ ...s })),
      };
      if (slot === 'fill') _doc.setVectorFill(layer.id, idx, next);
      else                 _doc.setVectorStroke(layer.id, idx, next);
    });
  }
}

export function applySlotOpacity(slot, opacity) {
  setActiveOpacity(slot, opacity);
  for (const layer of pickedLayers()) {
    if (layer.type !== 'vector') continue;
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      if (slot === 'fill') {
        const next = { ...(p.fill || {}), opacity };
        _doc.setVectorFill(layer.id, idx, next);
      } else {
        const next = { ...(p.stroke || {}), opacity };
        _doc.setVectorStroke(layer.id, idx, next);
      }
    });
  }
}

export function applyStrokeWidth(width) {
  setActiveStrokeWidth(width);
  for (const layer of pickedLayers()) {
    if (layer.type !== 'vector') continue;
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      const next = { ...(p.stroke || {}), width };
      _doc.setVectorStroke(layer.id, idx, next);
    });
  }
}

// ---------------------------------------------------------------------------
// Drop-target helpers — apply a colour OR gradient directly to a SPECIFIC
// layer (NOT the selection). Used by drag-drop sources (the colour hub's
// swatches strip, the Gradient Library plugin) so the user can drop a
// swatch onto any layer card / canvas hit + have it land regardless of
// the current selection.
//
//   slot = 'fill' | 'stroke' (default 'fill')
//   For text layers: only fill is honoured. Drops to stroke no-op (text
//   rasteriser doesn't render strokes — see roadmap Phase 23).
// ---------------------------------------------------------------------------

export function applyColorToLayer(layerId, hex, slot = 'fill') {
  if (!_doc || !layerId || !isHex(hex)) return false;
  const layer = _doc.findLayer(layerId);
  if (!layer) return false;
  if (layer.type === 'vector') {
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      const cur = slot === 'fill' ? p.fill : p.stroke;
      // Drop = explicit "use this colour" intent. Replace whatever was
      // there (solid, gradient, or none) with a fresh solid. Preserve
      // opacity so the user doesn't lose alpha settings on the swap.
      // (Stroke also preserves width / cap / join / etc.)
      const next = {
        ...(cur || {}),
        type: 'solid',
        color: hex.toLowerCase(),
        opacity: cur?.opacity ?? 1,
      };
      // Strip gradient-specific fields so they don't linger in the model.
      delete next.gradientType;
      delete next.stops;
      delete next.from;
      delete next.to;
      delete next.angle;
      if (slot === 'fill') _doc.setVectorFill(layer.id, idx, next);
      else                 _doc.setVectorStroke(layer.id, idx, next);
    });
    return true;
  }
  if (layer.type === 'text' && slot === 'fill') {
    _doc.setTextProp(layer.id, 'color', hex.toLowerCase());
    return true;
  }
  return false;
}

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

export function applyGradientToLayer(layerId, gradient, slot = 'fill') {
  if (!_doc || !layerId || !gradient) return false;
  const layer = _doc.findLayer(layerId);
  if (!layer || layer.type !== 'vector') return false;
  const paths = layer.vector?.paths || [];
  paths.forEach((p, idx) => {
    const cur = slot === 'fill' ? p.fill : p.stroke;
    const next = {
      ...(cur || {}),
      type: 'gradient',
      gradientType: gradient.type || 'linear',
      angle: Number.isFinite(gradient.angle) ? gradient.angle : 90,
      stops: (gradient.stops || []).map((s) => ({ at: s.at, color: s.color })),
      from: { x: 0, y: 0 }, to: { x: 1, y: 0 },
      opacity: cur?.opacity ?? 1,
    };
    if (slot === 'fill') _doc.setVectorFill(layer.id, idx, next);
    else                 _doc.setVectorStroke(layer.id, idx, next);
  });
  return true;
}

export function applySwap() {
  // Use colors.js's own swap to update active state.
  // For selected layers, swap their fill ↔ stroke as well.
  // (Active state swap is done by the caller via colors.swapFillStroke.)
  for (const layer of pickedLayers()) {
    if (layer.type !== 'vector') continue;
    const paths = layer.vector?.paths || [];
    paths.forEach((p, idx) => {
      const oldFill = p.fill || { type: 'none' };
      const oldStroke = p.stroke || { type: 'none' };
      _doc.setVectorFill(layer.id, idx, oldStroke);
      _doc.setVectorStroke(layer.id, idx, oldFill);
    });
  }
}
