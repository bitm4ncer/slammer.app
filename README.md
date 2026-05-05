# slammer.app

Multi-layer graphics editor for slamming, glitching, and dithering, with VST-like
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
| Reorder layers         | Drag rows in the Layer Stack panel                    |
| Add an effect          | **+** button on the Effects panel header              |
| Reorder effects        | Drag the grip handle on an effect row                 |
| Disable an effect      | Click the check icon on the effect's header           |
| Delete a layer         | Trash icon, or **Delete** key                         |
| Save project           | Toolbar **Save** (or autosaves on change)             |
| Open project           | Toolbar **Open** -> modal grid                        |
| Export PNG             | Toolbar **Export**                                    |
| Export .slammerproj    | **Shift** + **Export**                                |
| Import .slammerproj    | Drag the .slammerproj file onto the canvas            |
| Connect Affinity       | Footer -> **Connect** (Affinity Photo 2 must be open) |

`.crushproj` files exported by older builds are still imported transparently.

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
  io/             # project-store (IndexedDB), project-file (.slammerproj), export-png
  integrations/
    affinity/     # SSE + JSON-RPC bridge to Affinity Photo 2 MCP server
  style/          # variables, layout, components, effects (CSS)
```

The renderer maintains a per-layer effect cache (one ImageData per effect) so
that tweaking a late-stage filter does not re-run earlier ones - see
`plugins/plugin-contract.md` for the caching contract.

## Plugins

To add a new effect, write an ES module that default-exports the manifest in
`plugins/plugin-contract.md`, then import + register it in `src/main.js`. The
plugin appears automatically in the Effects panel's add menu.

## Roadmap

See [`roadmap.md`](roadmap.md) for the phased rebuild plan (rebrand,
design-system polish, Affinity bridge, dithering rework, knobs system, FX
layers, vector tools, brushes, masks, plugins, artboards).

## History

Forked from the v0.5 single-image tool that lived at
`C:\Users\konta\Desktop\CRUSH_app`. v1 is the layered Konva rewrite. The
`crush:*` localStorage keys and old IndexedDB store are migrated automatically
on first launch.
