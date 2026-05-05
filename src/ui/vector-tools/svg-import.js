// svg-import — turn a dropped .svg file into a new vector layer.
// Uses Paper.js's importSVG which understands almost every SVG construct
// (paths, shapes, transforms, groups, gradients, basic style attributes).

import paper from 'paper';

let _setup = false;
function ensure() {
  if (_setup) return;
  const dummy = document.createElement('canvas');
  dummy.width = 1; dummy.height = 1;
  paper.setup(dummy);
  _setup = true;
}

export async function importSvgFile(file, doc) {
  ensure();
  const text = await file.text();
  // Use a temporary detached project so we don't pollute the rasterise pipeline.
  const tempProject = new paper.Project(document.createElement('canvas'));
  tempProject.activate();
  const root = tempProject.importSVG(text, { expandShapes: true });

  // Walk every leaf path/compound and emit a serialisable record.
  const records = [];
  root.getItems({ class: paper.PathItem }).forEach((p) => {
    if (!p.pathData) return;
    const fillSpec = paperFillToSpec(p.fillColor);
    const strokeSpec = paperStrokeToSpec(p);
    records.push({
      d: p.pathData,
      closed: !!p.closed,
      fill: fillSpec,
      stroke: strokeSpec,
    });
  });
  // Tear down the temp project so memory doesn't leak between imports.
  tempProject.remove();

  if (!records.length) {
    console.warn('[svg] no paths found in', file.name);
    return null;
  }
  return doc.addVectorLayer({
    name: file.name.replace(/\.svg$/i, ''),
    vector: { paths: records },
  });
}

function paperFillToSpec(color) {
  if (!color) return { type: 'none' };
  if (color.type === 'gradient') {
    return {
      type: 'gradient',
      gradientType: color.gradient?.radial ? 'radial' : 'linear',
      stops: (color.gradient?.stops || []).map((s) => ({
        at: s.offset,
        color: s.color?.toCSS(true) || '#000',
      })),
      // Origin / destination — Paper exposes these on the Color instance.
      from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 },  // crude default; a future pass can map paper's origin/destination back to fractions
    };
  }
  return { type: 'solid', color: color.toCSS(true), opacity: color.alpha ?? 1 };
}

function paperStrokeToSpec(p) {
  if (!p.strokeColor) return { type: 'none' };
  const color = p.strokeColor;
  const base = {
    type: color.type === 'gradient' ? 'gradient' : 'solid',
    color: color.type === 'gradient' ? '#000' : color.toCSS(true),
    width: p.strokeWidth || 1,
    align: 'center',
    cap: p.strokeCap || 'butt',
    join: p.strokeJoin || 'miter',
    dash: p.dashArray || [],
    alongPath: false,
    opacity: color.alpha ?? 1,
  };
  if (color.type === 'gradient') {
    base.gradientType = color.gradient?.radial ? 'radial' : 'linear';
    base.stops = (color.gradient?.stops || []).map((s) => ({
      at: s.offset, color: s.color?.toCSS(true) || '#000',
    }));
    base.from = { x: 0, y: 0.5 }; base.to = { x: 1, y: 0.5 };
  }
  return base;
}
