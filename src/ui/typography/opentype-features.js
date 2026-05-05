// opentype-features — collapsible Advanced Typography section.
// Renders only the toggles supported by the active font's GSUB feature list,
// grouped into Ligatures / Letter case / Numbers / Stylistic sets.
//
// Letter-case "Uppercase / Lowercase / Title" are technically text-transform
// (not OpenType features) — handled separately so they always work.

const FEATURE_GROUPS = [
  {
    id: 'lig', label: 'Ligatures',
    items: [
      { tag: 'liga', label: 'Standard',      defaultOn: true,  desc: 'Standard ligatures like fi, fl — usually ON for legibility.' },
      { tag: 'dlig', label: 'Discretionary', defaultOn: false, desc: 'Decorative ligatures like ct, st. Off by default.' },
      { tag: 'clig', label: 'Contextual',    defaultOn: false, desc: 'Context-dependent letter combinations.' },
    ],
  },
  {
    id: 'case', label: 'Letter case',
    items: [
      { tag: 'smcp', label: 'Small caps',         defaultOn: false, desc: 'Convert lowercase letters to small-cap glyphs (font must support it).' },
      { tag: 'c2sc', label: 'Caps → small caps',  defaultOn: false, desc: 'Convert UPPERCASE letters to small caps too.' },
      { tag: 'case', label: 'Case-sensitive',     defaultOn: false, desc: 'Adjust punctuation height for ALL-CAPS text.' },
    ],
  },
  {
    id: 'num-style', label: 'Number style',
    exclusive: true,    // only one active at a time (none = font default)
    items: [
      { tag: 'lnum', label: 'Lining',       defaultOn: false, desc: 'Modern numerals — same height as caps, sit on the baseline.' },
      { tag: 'onum', label: 'Old-style',    defaultOn: false, desc: 'Mixed-height numerals with ascenders/descenders, blend better with lowercase text.' },
    ],
  },
  {
    id: 'num-width', label: 'Number width',
    exclusive: true,
    items: [
      { tag: 'tnum', label: 'Tabular',      defaultOn: false, desc: 'Equal-width digits — line up cleanly in tables.' },
      { tag: 'pnum', label: 'Proportional', defaultOn: false, desc: 'Digits with their natural widths (1 narrower than 8).' },
    ],
  },
  {
    id: 'num-misc', label: 'Number variants',
    items: [
      { tag: 'frac', label: 'Fractions',    defaultOn: false, desc: 'Format slash-separated digits (1/2) as a single fraction glyph.' },
      { tag: 'sups', label: 'Superscript',  defaultOn: false, desc: 'Raise digits above baseline (¹²³).' },
      { tag: 'subs', label: 'Subscript',    defaultOn: false, desc: 'Drop digits below baseline (₁₂₃).' },
    ],
  },
  {
    id: 'kern', label: 'Spacing',
    items: [
      { tag: 'kern', label: 'Kerning',      defaultOn: true,  desc: 'Tightens specific letter pairs (AV, To, Wo) using the font’s kerning table. Usually ON.' },
    ],
  },
];

// CSS text-transform options — not OpenType features, but designers expect them
// in the same panel.
const TEXT_TRANSFORM_OPTIONS = [
  { value: 'none',       label: 'aA',         desc: 'No transform.' },
  { value: 'uppercase',  label: 'AA',         desc: 'UPPERCASE every character.' },
  { value: 'lowercase',  label: 'aa',         desc: 'lowercase every character.' },
  { value: 'capitalize', label: 'Aa',         desc: 'Capitalize First Letter Of Each Word.' },
];

const STYLISTIC_SET_TAGS = Array.from({ length: 20 }, (_, i) => `ss${String(i + 1).padStart(2, '0')}`);

export function renderFeaturesSection(host, { meta, features, transform, variation, onToggle, onTransform, onVariationChange, expanded, onExpandChange }) {
  host.innerHTML = '';
  // The set of feature tags the font advertises. For catalogues without a
  // feature list we fall back to "show everything" (browser will silently
  // ignore unsupported features).
  const supported = new Set(meta?.features || []);
  const showAll = !meta?.features || !meta.features.length;

  const wrap = document.createElement('div');
  wrap.className = `typo-features ${expanded ? 'expanded' : ''}`;
  wrap.innerHTML = `
    <div class="typo-features-head" role="button" tabindex="0">
      <i class="fas fa-chevron-${expanded ? 'down' : 'right'}"></i>
      <span>Advanced Typography</span>
    </div>
    <div class="typo-features-body"></div>
  `;
  host.appendChild(wrap);

  const head = wrap.querySelector('.typo-features-head');
  head.addEventListener('click', () => onExpandChange?.(!expanded));
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpandChange?.(!expanded); }
  });

  if (!expanded) return;

  const body = wrap.querySelector('.typo-features-body');

  // Variable axes — every axis EXCEPT wght (which lives in the main Typo
  // panel as the primary Weight knob). Only renders if the active font
  // exposes any. Lazy-imports renderVariableAxes to avoid a cycle.
  if (meta?.variable && meta.axes && meta.axes.some((a) => a.tag !== 'wght')) {
    import('./variable-axis-controls.js').then(({ renderVariableAxes }) => {
      const grpEl = window.document.createElement('div');
      grpEl.className = 'typo-feat-group';
      grpEl.innerHTML = `<div class="typo-feat-grp-label" title="Extra design axes the type designer ships in this variable font.">Variable axes</div>`;
      const slot = window.document.createElement('div');
      slot.className = 'typo-axes-slot';
      grpEl.appendChild(slot);
      renderVariableAxes(slot, {
        meta, value: variation || {}, only: 'secondary',
        onChange: (tag, v) => onVariationChange?.(tag, v),
      });
      // Insert before the Text-transform group (which we add next)
      body.insertBefore(grpEl, body.firstChild);
    }).catch(() => {});
  }

  // (Text Transform now lives in the main panel below Align.)
  void TEXT_TRANSFORM_OPTIONS; void transform; void onTransform;

  for (const grp of FEATURE_GROUPS) {
    const groupItems = grp.items.filter((it) => showAll || supported.has(it.tag));
    if (!groupItems.length) continue;
    const grpEl = document.createElement('div');
    grpEl.className = 'typo-feat-group';
    grpEl.innerHTML = `<div class="typo-feat-grp-label">${grp.label}</div>`;
    const pills = document.createElement('div');
    pills.className = 'typo-feat-pills';
    for (const it of groupItems) {
      const isOn = features?.[it.tag] != null ? !!features[it.tag] : it.defaultOn;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `typo-feat-pill ${isOn ? 'active' : ''}`;
      b.title = `${it.tag} — ${it.desc}`;
      b.textContent = it.label;
      b.addEventListener('click', () => {
        const willBeOn = !isOn;
        if (grp.exclusive) {
          // Turn the others in this group off, then set this one.
          for (const sib of groupItems) {
            if (sib.tag !== it.tag) onToggle(sib.tag, false);
          }
        }
        onToggle(it.tag, willBeOn);
      });
      pills.appendChild(b);
    }
    grpEl.appendChild(pills);
    body.appendChild(grpEl);
  }

  // Stylistic sets — only those the font advertises.
  const ssTags = STYLISTIC_SET_TAGS.filter((tag) => showAll || supported.has(tag));
  if (ssTags.length) {
    const grpEl = document.createElement('div');
    grpEl.className = 'typo-feat-group';
    grpEl.innerHTML = `<div class="typo-feat-grp-label" title="Font-specific glyph alternates the type designer ships. Each font defines its own meaning — e.g. ss01 might swap a single-story g for a double-story one.">Stylistic sets <i class="fas fa-circle-info" style="opacity:0.4;font-size:8px;"></i></div>`;
    const pills = document.createElement('div');
    pills.className = 'typo-feat-pills';
    for (const tag of ssTags) {
      const isOn = !!(features && features[tag]);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `typo-feat-pill ${isOn ? 'active' : ''}`;
      b.title = `${tag} — Stylistic Set ${parseInt(tag.slice(2), 10)} (font-specific glyph alternates)`;
      b.textContent = tag.toUpperCase();
      b.addEventListener('click', () => {
        const willBeOn = !isOn;
        b.classList.toggle('active', willBeOn);
        onToggle(tag, willBeOn);
      });
      pills.appendChild(b);
    }
    grpEl.appendChild(pills);
    body.appendChild(grpEl);
  }
}
