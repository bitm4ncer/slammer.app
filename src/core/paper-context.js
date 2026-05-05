// paper-context — single shared Paper.js project for the vector subsystem.
//
// Multiple modules (vector-renderer, pen, pencil, anchor-overlay, svg-import)
// all need a Paper project to hydrate path d-strings, run boolean ops, etc.
// Each one used to boot its own + re-activate it on every call. svg-import
// then made it worse by spinning up a temp project and tearing it down,
// occasionally leaving paper.project pointing at a destroyed instance.
//
// One singleton + activate-before-use solves both. svg-import still uses a
// temp project (it has to, to avoid polluting the main one), but it always
// re-activates ours afterwards.

import paper from 'paper';

let _project = null;

export function ensurePaper() {
  if (_project && !_project._destroyed) {
    _project.activate();
    return _project;
  }
  const dummy = document.createElement('canvas');
  dummy.width = 1; dummy.height = 1;
  paper.setup(dummy);
  _project = paper.project;
  return _project;
}

export function activatePaper() {
  if (!_project || _project._destroyed) return ensurePaper();
  if (paper.project !== _project) _project.activate();
  return _project;
}

export { paper };
