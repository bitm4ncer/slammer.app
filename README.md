# CRUSH v1

Multi-layer image editor for crushing / glitching / dithering, with VST-like
tool plugins and a typography layer. Konva-based free canvas, non-destructive
per-layer effect stacks, IndexedDB project storage, Affinity Photo bridge.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # outputs static files to dist/
npm run preview      # serves the built dist
```

## Workflow at a glance

| Action                 | How                                                   |
|------------------------|-------------------------------------------------------|
| Add image              | Toolbar **Image** button, or drop file on canvas      |
| Add text               | Toolbar **Text** button, edit in the Typography panel |
| Move / scale / rotate  | Click layer to select, drag handles                   |
| Pan                    | Hold **Space** + drag, or middle-mouse drag           |
| Zoom                   | Mouse wheel (zoom-to-pointer), or zoom buttons        |
| Reorder layers         | Drag rows in the Layers panel                         |
| Add an effect          | **+ Add Tool** or **+ Add Filter** in the Effects panel |
| Reorder effects        | Drag the grip handle on an effect row                 |
| Disable an effect      | Click the check icon on the effect's header           |
| Delete a layer         | Trash icon, or **Delete** key                         |
| Save project           | Toolbar **Save** (or autosaves on change)             |
| Open project           | Toolbar **Open** → modal grid                         |
| Export PNG             | Toolbar **Export**                                    |
| Export .crushproj      | **Shift** + **Export**                                |
| Import .crushproj      | Drag the .crushproj file onto the canvas              |
| Connect Affinity       | Side panel → **Connect** (helper must be running)     |

## Architecture

```
src/
  core/           # document, layer, renderer, history (model)
  ui/             # canvas-view, panels, toolbar, modals
  plugins/
    registry.js   # registry + manifest validator
    plugin-contract.md
    tools/        # VST-style: dithering, jpeg-compression, pixelsort
    filters/      # compact: invert, brightness, contrast, levels, blur
    shared/       # UI helpers
  io/             # project-store (IndexedDB), project-file (.crushproj), export-png
  integrations/
    affinity/     # WebSocket bridge to Affinity helper
  style/          # variables, layout, components, effects (CSS)
```

The renderer maintains a per-layer effect cache (one ImageData per effect) so
that tweaking a late-stage filter does not re-run earlier ones — see
`plugins/plugin-contract.md` for the caching contract.

## Plugins

To add a new effect, write an ES module that default-exports the manifest in
`plugins/plugin-contract.md`, then import + register it in `src/main.js`. The
plugin appears automatically in the matching Add menu.

## Status

- **Stable:** layered canvas, transform, layer panel, effect stack, dithering
  (24 algorithms × 5 colour modes), pixelsort, JPEG compression, levels /
  brightness / contrast / blur / invert, text layer with Google Fonts, project
  save/load (IndexedDB), PNG + .crushproj export, Affinity bridge.
- **Planned:** undo/redo, vector layers, generator-type plugins, mobile layout,
  Web Worker offload for heavy effects.

## Relationship to v0.5

v0.5 (`C:\Users\konta\Desktop\CRUSH_app`, branch `main`) is a single-image
single-pipeline tool. It remains in maintenance mode. v1 is the layered
rewrite, currently on the `next/konva-rewrite` branch and tagged `v.1.0.0`
when ready.
