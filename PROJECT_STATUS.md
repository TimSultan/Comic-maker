# Comic Maker — Project Status
_Last updated: 2026-07-06_

---

## What This Is

A browser-based comic book creator. The user writes a story concept, the AI expands it into a full scene-by-scene script, and then generates structured comic pages with panel prompts, camera angles, speech bubbles, and character assignments — all editable. Panels can then be sent to an image model one by one, with bubbles rendered as interactive overlays on top of the generated artwork.

**Stack:** Vite 5 · React 18 · Tailwind CSS 3 · Zustand 4 · OpenAI Responses API + Images API

---

## Current State (what works)

### Layout & Navigation
- Top bar: File / View menus, Style / Characters quick buttons, ✨ AI Fill button, double-click title to rename
- Left sidebar: page thumbnails (add / delete), page count footer
- Main canvas: A4-ratio comic page with CSS Grid panels
- Right sidebar: tabbed Panel / Style / Characters properties panel

### Pages & Panels
- Add / remove / duplicate pages
- Panel count presets: 1 2 3 4 5 6 9 per page
- Panel grid uses `colSizes` / `rowSizes` (fr fractions) per page
- **Drag resize handles** between panels to change relative widths/heights
- Last panel auto-spans leftover columns (3/5-panel layouts)

### Images
- Generate per-panel image via OpenAI `gpt-image-2`
- Style references (uploaded images) + character reference images passed to the API via the Responses API with `input_image` blocks
- Character descriptions included in the image prompt
- Images always generated without text/bubbles (prompt enforces this)
- **Drag image inside panel** to reframe/crop via `object-position`
- ↺ Reset crop button appears when image is panned
- Image preview in right sidebar with hover-to-clear

### Bubbles
- 6 types: Speech (rounded + tail) · Thought (oval + dotted + dot trail) · Shout (spiky clip-path starburst) · Whisper (thin dashed ellipse) · Caption (blue flat box) · Narration (amber flat box)
- Bubbles shown as overlays on the canvas — NOT baked into images
- Click any bubble on the canvas → opens the Panel Editor modal with that bubble pre-selected
- Panel Editor modal: drag bubbles to reposition, edit text, change type, adjust width slider, add/remove bubbles, click empty canvas to place a bubble
- Panel Editor shows the generated image as the background
- Bubble width stored as percentage; position as x/y percentage of the panel

### Characters
- Character roster: name, color swatch, description, reference image (upload)
- Character picker in Panel tab: colored chip buttons — click to toggle which characters appear in a panel
- Shows how many characters + reference images will be sent with the image generation call

### AI Fill (OpenAI)
- **API key** stored in `localStorage` (never proxied)
- **Text models** (selectable): GPT-5.5 · GPT-5.4 · GPT-5.4 mini · GPT-5.4 nano
- **Image model** (selectable): GPT Image 2
- **Image quality**: low / medium / high
- Two-step generation flow:
  1. Write a concept (1–2 sentences) → **Generate Script** button → AI expands to full scene-by-scene script
  2. Edit script → **Generate Comic** button → AI returns structured JSON with pages, panels, bubbles, character assignments, camera angles
- Character names in AI response are resolved to roster IDs via 3-tier fuzzy matching (exact → substring → word overlap)
- Apply mode: Replace all pages OR Append to existing
- Pages: 1–12 slider · Panels per page: 1–9 slider

### Style
- Global style fields: art style, genre, mood, color palette, line weight, world/setting
- Style reference images: upload any number; shown as 2-col thumbnail grid with label editor
- All style fields prepended to every image generation prompt

### Save / Load
- **Save to browser**: localStorage JSON (Ctrl+S)
- **Load from browser**: localStorage
- **Export JSON**: downloads `{title}.json`
- **Load from JSON file**: file picker, validates `pages` array, restores full state

---

## Things to Add

### High priority
- [ ] **Undo / Redo** — No history at all right now. Zustand middleware (`zustand/middleware` immer or temporal) could handle this.
- [ ] **Batch image generation** — "Generate all panels" button that queues panel-by-panel generation with a progress bar and cancellation
- [ ] **PNG / PDF export** — Menu items exist but are disabled. Use `html2canvas` + `jsPDF` or a canvas-drawing pass that composites image + bubbles per panel.
- [ ] **Drag to reorder pages** in the left sidebar
- [ ] **Panel reordering** within a page (drag-and-drop panels inside the grid)

### Medium priority
- [ ] **Bubble tail direction** — Currently the tail always points down-left. Add a direction selector (left, right, none) with a CSS triangle positioned accordingly.
- [ ] **Font customization** for bubbles — family, size, bold/italic toggles per bubble
- [ ] **Custom panel layout editor** — Let users set arbitrary row/col spans per panel (comic panels rarely fit a pure grid)
- [ ] **Page templates** — Predefined interesting layouts (e.g., splash page, action spread, 3-tier)
- [ ] **Streaming output** for script and comic generation — show tokens as they arrive instead of waiting for the full response
- [ ] **Character assignment from the canvas** — drag a character chip from the sidebar onto a panel

### Lower priority
- [ ] **Zoom controls** for the canvas (currently fixed at 620×877px)
- [ ] **Dark/light mode** for the comic page itself (editorial preview vs. dark bg)
- [ ] **Per-panel style override** — currently the field exists in the data model but is never used in the UI
- [ ] **Image zoom/scale** per panel (in addition to crop pan)
- [ ] **Story script autosave** — currently the script is in Zustand but not always saved to JSON export
- [ ] **Collaboration / cloud save** — completely out of scope for now

---

## Things to Improve

### UX
- The Panel Editor modal opens to a fixed 580×435 canvas regardless of panel aspect ratio; tall/wide panels look stretched. Should match the actual panel's aspect ratio.
- The page navigator thumbnails don't update to show image backgrounds — they only show the panel grid lines.
- The "Characters in panel" chip list has no visual feedback when the generated image actually used those characters.
- The AI Fill modal's right-side settings pane is long; consider collapsing infrequently-changed sections.
- The "generate script" and "generate comic" buttons are both blue/indigo — clearer visual hierarchy would help distinguish the two steps.

### Performance
- Every `updatePanel` call replaces the entire `pages` array (deep copies). With many large base64 image strings this causes large React re-renders. Images should be stored in a separate ref/map keyed by panel ID, with the panel only holding the key.
- The `ResizeHandle` drag calls `updatePage` on every `mousemove` event, causing a store update + re-render on every pixel. Throttle to ~60fps or defer to `mouseup`.
- `BubbleShape` components re-render on every parent re-render. Wrap in `React.memo`.

### Code quality
- `AIFillModal.jsx` is very long (~400 lines). Split into `StoryEditor`, `GenerateSettings`, and `ModelPicker` sub-components.
- `PropertiesPanel.jsx` mixes 3 independent tabs in one file; split into `PanelTab.jsx`, `StyleTab.jsx`, `CharactersTab.jsx`.
- The `callOpenAI` and `callGenerateScript` API functions in `AIFillModal.jsx` should move to `src/utils/aiApi.js` for testability.

---

## Known Bugs / Possible Errors to Check

### Critical
1. **localStorage quota** — Storing base64 images in localStorage will silently fail once the ~5 MB limit is hit. The `save` action has no `try/catch` around the `localStorage.setItem` call. Wrap it and show a warning if storage fails.

2. **Responses API response shape** — The code parses `data.output?.find(b => b.type === 'message')?.content?.find(b => b.type === 'output_text')?.text`. If OpenAI changes the response shape (or for models that return differently) this silently returns `undefined` and throws "Empty response from AI". Add defensive logging.

3. **JSON load missing fields** — If a user loads a JSON that was saved before `imageOffsetX`, `colSizes`, `imageUrl`, etc. were added to the schema, those fields will be `undefined`. The canvas handles this with `?? 0` fallbacks but some code paths may not. Run a migration step in the load action.

### Medium
4. **Shout bubble clip-path** in `BubbleShapes.jsx` — The `SPIKY` polygon uses percentage clip-path. On very small bubbles (narrow panels, small `width%`) the spiky shape may clip the text. Test at widths below 80px.

5. **Circular import risk** — `useComicStore.js` imports `getGridDims` from `defaults.js`. `defaults.js` is also imported by `ComicCanvas.jsx`, `PropertiesPanel.jsx`, etc. Currently fine, but if `defaults.js` ever imports from the store it will create a cycle.

6. **`useComicStore` inside `ResizeHandle`** — `ResizeHandle` is a non-exported component defined inside `ComicCanvas.jsx` and calls `useComicStore`. This is valid React but means every panel re-render recreates the component definition. Move `ResizeHandle` outside the module scope (already defined at module level, so this is fine — just verify).

7. **`panelEditModalInitialBubbleId` not cleared on close** — `closePanelEditModal` does reset it (`panelEditModalInitialBubbleId: null`). But if the modal is closed by clicking the backdrop (which calls `closePanelEditModal`), the `useEffect` in `PanelEditModal` fires and sets `selectedBubbleId = null` on the next open. Verify the effect runs after `panelEditModalOpen` toggles to `true`, not `false`.

8. **Image drag and panel click conflict** — `handleMouseDown` in `ComicPanel` always attaches `mousemove` and `mouseup` to `document`. If the user right-clicks or uses keyboard shortcuts while dragging, the cleanup `onMouseUp` may not fire, leaking the listeners. Add `{ once: true }` or check `e.buttons` in `onMouseMove` to abort if the button is released.

9. **AI character name fuzzy matching** — The word-overlap tier (Tier 3) can produce false positives. For example, character "King" could match AI-returned "King Cobra" or "Cooking". Consider adding a minimum word length of 4 instead of 2 to reduce noise.

10. **`callGenerateScript` and `callOpenAI` both use `fetch` directly** — There is no timeout or abort controller. A hung API request will block the UI indefinitely. Add `AbortController` with a reasonable timeout (e.g., 120 seconds).

### Low
11. The `TopBar` `handleAction` function is wrapped in `useCallback` with `[toggleLeftSidebar, toggleRightSidebar]` as deps, but `handleAction` also references `useComicStore.getState()` and `setComicTitle` (via closure from top scope). This is fine because `getState()` is always fresh, but the dep array is incomplete by React rules. Either add `exhaustive-deps` ESLint rule or restructure.

12. The `applyResult` function in `AIFillModal.jsx` calls `useComicStore.getState()` — valid outside React. But it also calls `useComicStore.setState()` directly. If `applyResult` is ever moved into a React render path, this would break. Keep it outside components.

---

## File Structure

```
src/
├── App.jsx
├── index.css
├── main.jsx
├── components/
│   ├── AIFill/
│   │   └── AIFillModal.jsx       ← concept → script → comic generation
│   ├── Canvas/
│   │   └── ComicCanvas.jsx       ← page + panel grid, resize handles, image crop
│   ├── LeftSidebar/
│   │   └── PageNavigator.jsx     ← page thumbnails
│   ├── PanelModal/
│   │   ├── BubbleShapes.jsx      ← 6 SVG/CSS bubble types
│   │   └── PanelEditModal.jsx    ← bubble drag editor, image background
│   ├── RightSidebar/
│   │   └── PropertiesPanel.jsx   ← Panel / Style / Characters tabs
│   └── TopBar/
│       └── TopBar.jsx            ← menus, title, AI Fill button
├── store/
│   └── useComicStore.js          ← Zustand store, all state & actions
└── utils/
    ├── defaults.js               ← constants, getGridDims, uid
    └── imageGen.js               ← OpenAI image generation with ref images
```
