// shortcuts/helpers — pure helpers used by the shortcut-manager router.
//
// Combo string format (canonical):
//   `Mod+Shift+K`, `Mod+Shift+Z`, `Mod+0`, `Tab`, `Escape`, `ArrowUp`, `S`
//
//   - Modifiers in fixed order: Mod / Ctrl / Cmd / Shift / Alt
//     (Mod = ctrlKey on Win/Linux, metaKey on macOS — same semantics as
//      the existing inline `e.ctrlKey || e.metaKey` checks across main.js
//      and toolbar.js, just centralised.)
//   - Letter keys are uppercased single chars (`A`, `B`, `V`, …).
//   - Digit keys are bare (`0`, `1`, …).
//   - Named keys use the KeyboardEvent.key spelling: `Escape`, `Enter`,
//     `Tab`, `Space`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`,
//     `Delete`, `Backspace`, `F1`–`F12`, plus punctuation like `;`, `-`,
//     `=`, `+`.
//   - A binding may have multiple equivalent combos — pass an array.

const MODIFIER_TOKENS = new Set(['Mod', 'Ctrl', 'Cmd', 'Shift', 'Alt']);

// Canonical key name from a KeyboardEvent.
// Preserves shape regardless of which physical key was pressed.
export function keyName(e) {
  const k = e.key;
  if (!k) return '';
  if (k === ' ') return 'Space';
  if (k.length === 1) {
    // Letters → uppercase canonical. Punctuation passes through.
    return /[a-zA-Z]/.test(k) ? k.toUpperCase() : k;
  }
  return k; // Escape, Enter, Tab, ArrowUp, F11, …
}

// Build the canonical combo string for a keyboard event.
export function comboFromEvent(e) {
  const parts = [];
  const mod = e.ctrlKey || e.metaKey;
  if (mod) parts.push('Mod');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = keyName(e);
  // Don't emit the modifier-only stream (Mod alone, etc.).
  if (k && !MODIFIER_TOKENS.has(k) && k !== 'Control' && k !== 'Meta' && k !== 'Alt' && k !== 'Shift') {
    parts.push(k);
  } else {
    return '';
  }
  return parts.join('+');
}

// Normalise a hand-authored combo string so authors can write `mod+z` or
// `Shift+Tab` and we still match correctly. Returns canonical form.
export function normaliseCombo(combo) {
  if (!combo) return '';
  const parts = String(combo).split('+').map((s) => s.trim()).filter(Boolean);
  let mod = false, ctrl = false, cmd = false, shift = false, alt = false;
  let key = '';
  for (const raw of parts) {
    const low = raw.toLowerCase();
    if (low === 'mod' || low === 'cmdorctrl' || low === 'commandorcontrol') { mod = true; continue; }
    if (low === 'ctrl' || low === 'control') { ctrl = true; continue; }
    if (low === 'cmd' || low === 'meta' || low === 'command') { cmd = true; continue; }
    if (low === 'shift') { shift = true; continue; }
    if (low === 'alt' || low === 'option') { alt = true; continue; }
    if (low === 'space' || raw === ' ') { key = 'Space'; continue; }
    if (raw.length === 1 && /[a-zA-Z]/.test(raw)) { key = raw.toUpperCase(); continue; }
    // Preserve spelling for named keys; only canonicalise the prefix.
    if (/^arrow(up|down|left|right)$/i.test(raw)) {
      key = 'Arrow' + raw.slice(5, 6).toUpperCase() + raw.slice(6).toLowerCase();
      continue;
    }
    if (/^f\d{1,2}$/i.test(raw)) { key = raw.toUpperCase(); continue; }
    if (/^(escape|enter|tab|delete|backspace|home|end|pageup|pagedown)$/i.test(raw)) {
      key = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      // PageUp / PageDown special-casing.
      if (/pageup/i.test(raw)) key = 'PageUp';
      if (/pagedown/i.test(raw)) key = 'PageDown';
      continue;
    }
    key = raw; // punctuation, digits, anything else
  }
  const out = [];
  if (mod) out.push('Mod');
  if (ctrl) out.push('Ctrl');
  if (cmd) out.push('Cmd');
  if (shift) out.push('Shift');
  if (alt) out.push('Alt');
  if (key) out.push(key);
  return out.join('+');
}

// Accept either a string or string[] for `defaultKeys`. Returns array of
// normalised combo strings.
export function normaliseCombos(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list.map(normaliseCombo).filter(Boolean);
}

// Standard "are we typing into a text field?" guard.
// Centralised here per the Phase 1 audit decision (canvas-view.js
// isEditingText() semantic, lifted as the registry canonical form).
export function isTyping(target) {
  const ae = target || document.activeElement;
  if (!ae) return false;
  const tag = ae.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (ae.isContentEditable) return true;
  return false;
}

// Cross-platform "is the Mod (Ctrl on Win/Linux, Cmd on macOS) pressed?"
// Kept as a tiny helper so callers don't have to remember the OR pattern.
export function isMod(e) {
  return !!(e && (e.ctrlKey || e.metaKey));
}

// Detect macOS so the Settings tab can render `Mod` as `⌘` instead of
// `Ctrl`. SSR-safe (returns false when navigator is absent).
function isMac() {
  try { return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || ''); }
  catch { return false; }
}

// Turn a canonical combo string ('Mod+Shift+ArrowUp') into a human-
// readable form for the Settings table ('Ctrl+Shift+↑' on Windows /
// Linux, '⌘+Shift+↑' on macOS). Multi-combo strings ('Mod+Shift+Z /
// Mod+Y' from getBindings().activeKeys) round-trip cleanly.
const PRETTY_KEYS = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Enter: 'Enter',
  Tab: 'Tab',
};
export function prettyCombo(combo) {
  if (!combo) return '';
  const modLabel = isMac() ? '⌘' : 'Ctrl';
  return combo.split(' / ').map((c) => c.split('+').map((part) => {
    if (part === 'Mod') return modLabel;
    if (part === 'Cmd') return '⌘';
    if (PRETTY_KEYS[part]) return PRETTY_KEYS[part];
    return part;
  }).join('+')).join(' / ');
}

// Capture a keyboard event in "listening mode" (the Settings remap UI).
// Returns one of:
//   { kind: 'pending' } — modifier-only keystroke; user is still
//                         composing (e.g. just pressed Shift, hasn't
//                         pressed the non-modifier key yet)
//   { kind: 'cancel' }  — Escape pressed alone (acts as the cancel
//                         signal — NOT captured as a combo)
//   { kind: 'capture', combo: 'Mod+Shift+K' } — final combo to save
//
// Esc-as-cancel is per the brief: Esc is reserved as the listening-
// mode cancel signal and can't be rebound through the UI.
export function captureCombo(e) {
  const k = keyName(e);
  if (!k || MODIFIER_TOKENS.has(k) || k === 'Control' || k === 'Meta') {
    return { kind: 'pending' };
  }
  if (k === 'Escape' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    return { kind: 'cancel' };
  }
  const combo = comboFromEvent(e);
  if (!combo) return { kind: 'pending' };
  return { kind: 'capture', combo };
}
