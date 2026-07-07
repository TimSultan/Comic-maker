# Comic Maker TODO

## Highest Impact Additions

1. Undo / redo for project edits.
2. PNG / PDF export for final pages.
3. Batch generate panels with progress, retry, and cancellation.
4. Project asset library for generated panel images, character refs, style refs, and uploaded references.
5. Layer / object list for each panel: image, bubbles, connectors.
6. Better bubble connector editing with direct canvas controls.
7. Panel reordering inside a page.
8. Page reordering in the left sidebar.
9. Autosave and recovery snapshots.
10. Project schema migration for older JSON files.

## Important Improvements

1. Move large image payloads out of Zustand/localStorage into IndexedDB or files.
2. Reduce large nested store updates and separate image data from layout data.
3. Add panel editor zoom/pan and fit/100%/200% controls.
4. Improve bubble text layout with auto-fit, better wrapping, font presets, padding controls, and overflow warnings.
5. Improve connector endpoint accuracy with measured rendered bubble bounds.
6. Add request timeout, retry, provider error handling, and model capability validation for image generation.
7. Store per-panel generation history with prompt, references, model, interaction ID, and output image.
8. Improve reference UX with tags, labels, preview enlargement, and used-in-panel indicators.
9. Unify selection between panel, bubble, connector, and image crop.
10. Add smoke tests for save/load, layouts, bubble editing, connectors, and image generation payloads.

## Codebase Cleanup

1. Split `PanelEditModal.jsx` into focused components.
2. Split `PropertiesPanel.jsx` into panel/style/characters/image generation sections.
3. Move AI request code and prompt building into service modules with tests.
4. Add a project schema version and migration utility.
5. Add reusable UI primitives for sliders, color controls, icon buttons, modals, and image pickers.

## Implemented

1. Undo / redo for project edits, with drag/zoom/resize changes batched into one history entry.
2. PNG export from the rendered page DOM.
3. IndexedDB image storage for large generated panel images.
4. Project asset library for uploaded project references, generated panel images, character refs, and style refs.
