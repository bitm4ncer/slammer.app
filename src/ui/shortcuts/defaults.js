// shortcuts/defaults — default binding table.
//
// Phase 21b foundation step (this commit): EMPTY. The registry and
// router land first; existing keydown listeners stay in place; nothing
// is rewired yet. Subsequent commits in this branch migrate the ~9
// in-scope listeners (Groups A + B from the audit) into entries here.
//
// Each entry has the shape (see registerShortcut JSDoc in
// ../shortcut-manager.js):
//
//   {
//     id:            'edit.undo',
//     label:         'Undo',
//     defaultKeys:   'Mod+Z',          // or array of equivalents
//     scope:         'global',         // 'global' | 'tool:<id>' | 'text-edit'
//     category:      'Edit',
//     description?:  'Optional row blurb for Settings.',
//     preventDefault?: true,           // default true
//     capture?:      false,            // default false (set true for Esc-first)
//     action:        (e, ctx) => { ... }, // receives KeyboardEvent + façade
//   }
//
// Categories match the existing Settings → Shortcuts tab so the rewire
// step renders the same five sections:
//   'File' | 'Edit' | 'Move & transform' | 'Tools' | 'Canvas'

export const defaultShortcuts = [];
