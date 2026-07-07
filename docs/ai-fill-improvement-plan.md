# Story & AI Fill — process notes and improvement plan

This documents how "Story & AI Fill" works, end to end, and the changes made
to it to produce more compelling stories and clearer comics (readable
dialogue, purposeful visuals, varied pacing). **Status: implemented** — see
"Changes made" below for what shipped and why.

## How generation works

### 1. Concept → Script (optional)

UI: the "Story Concept" textarea + "Generate Script" button in
`AIFillModal.jsx`. This step is optional — a user can skip it entirely and
write or paste a full script straight into the "Story Script" box.

Calls `callGenerateScript({ concept, globalStyle, characters, pageCount, apiKey, model })`.
The system prompt asks GPT to expand the one-or-two-sentence concept into
"a rich, detailed scene-by-scene comic book script," written as flowing
prose, and gives it:

- the full character roster (exact names + descriptions), with a hard
  instruction to never invent new names or refer to characters by pronoun,
- `globalStyle` (`artStyle`, `colorPalette`, `lineWeight`, `mood`, `genre`,
  `setting`) as clearly labeled, separate lines (via the shared
  `formatStyleContext()` helper) rather than one blob mislabeled "Art style,"
- story-craft guidance: give the point-of-view character a clear want and
  obstacle, escalate stakes across scenes, land a real turn/payoff, and shape
  the scene sequence to the target `pageCount` (early scenes establish,
  middle scenes escalate, final scene(s) resolve).

Output is raw prose, written into `storyScript` via `setStoryScript`.

### 2. Script → Structured comic (JSON)

UI: the "Generate Comic" button. Calls `callOpenAI({ storyScript, globalStyle,
characters, pageCount, panelsPerPage, apiKey, model })`.

The system prompt requests a JSON tree of `pageCount` pages. `panelsPerPage`
is a *target/average*, not a fixed count — the model chooses each page's
actual panel count (1-9) and a named `layout` id individually, based on
pacing:

- a single "splash" panel for a big reveal or page-ending cliffhanger,
- a "feature" layout (one large panel + several smaller ones) when one beat
  matters more than the rest on that page,
- more small, even panels to speed pacing up for action/rapid dialogue,
- fewer, larger panels to slow pacing down for quiet/atmospheric beats.

The valid `layout` ids offered to the model are generated at request time
straight from `PANEL_LAYOUTS` (via `formatLayoutCatalog()`) — the same
catalog the canvas itself renders from — so the prompt can never drift out of
sync with what layouts actually exist. For each panel it asks for:

- `prompt` — the image-generation text; must reflect the emotional tone of
  that panel's own dialogue (a panel with a frightened line needs a
  frightened pose/expression — the two are generated together but nothing
  used to connect them),
- `perspective` — one of 8 shot types, with an explicit instruction to vary
  shot type across consecutive panels rather than defaulting to
  `medium-shot`,
- `bubbles[]` — `{ type, style, text, x, y, width }`, now with explicit
  semantics for when to use each `type` (speech = actual spoken words only;
  thought = sparing interior monologue; caption/narration = exposition and
  scene-setting instead of stuffing it into dialogue; shout/sfx = genuine
  high-impact beats only), a ~15–20 word cap per bubble (split longer lines
  into multiple bubbles), and a requirement to order multiple bubbles in
  natural reading order (top-to-bottom, left-to-right),
- `characters[]` — exact roster names present in the scene,
- `notes` — a private director's note (shown in the panel editor sidebar,
  never used again downstream).

Requested via OpenAI's Responses API in loose `json_object` mode (not the
stricter, schema-validated `json_schema` structured-output mode) — a
malformed `type`/`style` enum value or missing field isn't caught here, it
just flows through to `applyResult`'s defensive fallbacks (see below).

### 3. Apply to store

`applyResult(result, mergeMode)` walks the returned pages/panels:

- Character names are resolved to internal character IDs by `resolveChars()`,
  a three-tier fuzzy match (exact case-insensitive → substring containment →
  shared significant word). Anything that still doesn't match is silently
  dropped rather than creating a phantom character.
- Each panel is built fresh: new `id`, no image yet (`imageUrl` /
  `imageAssetId` both `null`), `imageSize: 'auto'`, blank `editPrompt` /
  `referencePrompt` / `referenceImageIds`. Panels are clamped to at most 9
  (the largest defined layout); a page that ends up with zero panels is
  dropped rather than stored empty.
- Each page's `layout` is resolved via `getPanelLayout(panelCount, pg.layout)`,
  which already falls back to that panel count's default layout whenever the
  requested id doesn't exist or doesn't match the actual panel count
  returned — so a hallucinated or mismatched layout id degrades gracefully
  instead of breaking the page.
- `mergeMode` is `'replace'` (discard existing pages) or `'append'`.
- One `useComicStore.setState(...)` call applies everything; the first new
  page is auto-selected.

At this point every panel has a prompt and dialogue, but no artwork.

### 4. Panel → Image

Triggered per-panel (Properties panel "Generate" button) or in bulk via
"Generate Empty Panels on Page" (skips panels that already have an image or
have no prompt).

`generateImageForPanel()` in `PropertiesPanel.jsx` gathers the panel's prompt
(or edit instructions, if regenerating an existing image), the character
objects assigned to the panel — including each character's own `imageUrl` if
they have a reference portrait — plus any selected reference images, and the
current image model/quality/size settings.

`targetPanel.perspective` is now passed through into `generatePanelImage()`.
Previously the shot type chosen in step 2 (or manually, via the
Shot/Perspective button grid in the panel editor) was stored on the panel and
shown as UI state but never reached image generation at all.

`generatePanelImage()` in `imageGen.js` builds the final prompt via
`buildPrompt()`: the style context + an explicit shot/framing line (from
`perspective`, via a small `PERSPECTIVE_FRAMING` lookup — e.g. "Shot:
close-up - tight framing on the subject's face and upper body...") + named
style-reference labels + character names/descriptions + a reference-image
usage note + the panel's own prompt text + a fixed closing instruction:

> "Comic book panel artwork. No speech bubbles, no thought bubbles, no
> captions, no text or lettering of any kind in the image."

That closing instruction is deliberate and correct — bubbles are never baked
into the artwork (see step 5), so the image model must never draw its own.

Routing is by model-name prefix: Gemini (`gemini-*`, tries the Interactions
API first for multi-turn edits, falls back to `generateContent`), Imagen
(`imagen-*`, `predict` endpoint), or OpenAI (`images/generations`). The result
is stored as an IndexedDB asset (`imageAssetId`) via `putImageAsset`, not as a
raw data URL on the panel, to keep the store itself small.

### 5. Bubbles render independently of the image

`bubbles[]` from step 2 are never sent to the image model — they're rendered
afterward as a separate HTML/SVG layer (`BubbleShape`) positioned on top of
the finished artwork by the stored `x` / `y` / `width` percentages. This is
exactly why the image prompt explicitly forbids the model from drawing its
own text.

---

## Changes made

### A. Story & script prompts (`callGenerateScript`, `callOpenAI` in `AIFillModal.jsx`)

1. **Narrative-craft guidance**, replacing the vague "be cinematic and
   emotionally engaging": a clear want/obstacle for the point-of-view
   character, escalating stakes rather than a flat sequence of scenes, and a
   real turn/payoff by the end.
2. **Pacing-by-page-position guidance.** The model is told the scene/page
   sequence should establish early, escalate through the middle, and turn/
   resolve by the final page(s), scaled to the chosen `pageCount`.
3. **Fixed the `globalStyle` labeling** via a shared `formatStyleContext()`
   helper used by both AI calls — genre/mood/setting/art-style/color/line
   weight are now separate labeled lines instead of one blob mislabeled "Art
   style."
4. **Bubble-type semantics** — explicit rules for when to use `speech` vs.
   `thought` vs. `caption`/`narration` vs. `shout`/`sfx`, instead of an
   unexplained enum.
5. **Dialogue length and reading-order rules** — bubbles capped at roughly
   15–20 words (split longer lines instead of one dense block), ordered in
   natural reading order when a panel has more than one. (Explicitly *not*
   requiring bubbles to be positioned near the speaking character — dropped
   per review, since the model has no reliable way to know exactly where a
   character will land in the generated artwork.)
6. **Tied dialogue tone to the visual prompt** — the panel's `prompt` must
   now reflect the emotional content of that panel's own dialogue.
7. **Perspective-variety guidance** — vary shot type across consecutive
   panels, matched to narrative function (close-ups for emotional beats,
   wide/establishing for transitions).
8. **Page layout is now AI-driven.** `panelsPerPage` became a target/average
   rather than a hard per-page count. For every page, the model picks its own
   panel count (1–9) and a named `layout` id — generated at request time from
   `PANEL_LAYOUTS` via `formatLayoutCatalog()`, so the offered options can
   never drift from what the canvas actually supports — guided by explicit
   pacing rules (splash panel for a big beat, feature layout when one panel
   matters more than the rest, small even grids for fast action, fewer larger
   panels to slow down). `applyResult` resolves and validates the chosen
   layout per page, with a graceful fallback to that panel count's default
   layout if the id is invalid or doesn't match the panel count returned.

### B. `perspective` now actually reaches image generation (`imageGen.js`, `PropertiesPanel.jsx`)

9. **Threaded `panel.perspective` into `buildPrompt()`.** `generateImageForPanel()`
   now passes it to `generatePanelImage()`, which folds it into the built
   prompt as an explicit framing line via a `PERSPECTIVE_FRAMING` lookup
   (e.g. "Shot: close-up - tight framing on the subject's face and upper
   body."). Previously this field was generated, editable in the UI, and
   otherwise completely inert.

### C. Character visual consistency (`PropertiesPanel.jsx` Characters tab)

10. **Reference-portrait nudge + one-click generation.** A character card
    with no reference image now shows an explicit warning ("this character's
    appearance may drift between panels") alongside the existing upload
    option, plus a "🪄 Generate" button that calls the same
    `generatePanelImage()` pipeline with a dedicated portrait prompt (bust-up,
    plain background, consistent reference framing) and saves the result as
    the character's `imageUrl`.

### Deferred (bigger, separate follow-up — not in this pass)

- **Structured output / schema validation for `callOpenAI`.** Move from loose
  `json_object` mode to a strict `json_schema` response format (or add
  post-parse validation) so a hallucinated enum value or missing field is
  caught and corrected rather than relying on defensive fallbacks downstream.

### What was already working well (kept as-is)

- The "no text/lettering" instruction in the image prompt — correct, since
  bubbles are a separate overlay.
- Character reference images, when present, are already passed through to
  image generation for consistency.
- The three-tier fuzzy character-name matching in `resolveChars()` is a
  reasonable, low-risk way to tolerate small AI naming drift without creating
  phantom characters.
