// --- Perspective options ---------------------------------------------
export const PERSPECTIVES = [
  { value: 'close-up', label: 'Close-Up' },
  { value: 'medium-shot', label: 'Medium Shot' },
  { value: 'wide-shot', label: 'Wide Shot' },
  { value: "bird's-eye", label: "Bird's Eye" },
  { value: "worm's-eye", label: "Worm's Eye" },
  { value: 'over-shoulder', label: 'Over Shoulder' },
  { value: 'dutch-angle', label: 'Dutch Angle' },
  { value: 'establishing', label: 'Establishing' },
]

// --- Panel count presets --------------------------------------------
export const PANEL_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// --- Page layout presets --------------------------------------------
// Panel positions are 1-based CSS grid lines.
export const PANEL_LAYOUTS = {
  1: [
    {
      id: 'single',
      label: 'Single',
      cols: 1,
      rows: 1,
      panels: [{ col: 1, row: 1 }],
    },
  ],
  2: [
    {
      id: 'two-vertical',
      label: 'Vertical',
      cols: 2,
      rows: 1,
      panels: [{ col: 1, row: 1 }, { col: 2, row: 1 }],
    },
    {
      id: 'two-horizontal',
      label: 'Horizontal',
      cols: 1,
      rows: 2,
      panels: [{ col: 1, row: 1 }, { col: 1, row: 2 }],
    },
  ],
  3: [
    {
      id: 'three-bottom',
      label: '2 + 1',
      cols: 2,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2, colSpan: 2 },
      ],
    },
    {
      id: 'three-top',
      label: '1 + 2',
      cols: 2,
      rows: 2,
      panels: [
        { col: 1, row: 1, colSpan: 2 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
      ],
    },
    {
      id: 'three-left',
      label: '1 | 2',
      cols: 2,
      rows: 2,
      panels: [
        { col: 1, row: 1, rowSpan: 2 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
      ],
    },
    {
      id: 'three-right',
      label: '2 | 1',
      cols: 2,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 1, rowSpan: 2 },
      ],
    },
    {
      id: 'three-columns',
      label: '1 + 1 + 1',
      cols: 3,
      rows: 1,
      panels: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }],
    },
    {
      id: 'three-rows',
      label: 'Stacked',
      cols: 1,
      rows: 3,
      panels: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }],
    },
  ],
  4: [
    {
      id: 'four-grid',
      label: '2 x 2',
      cols: 2,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
      ],
    },
    {
      id: 'four-columns',
      label: 'Columns',
      cols: 4,
      rows: 1,
      panels: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }],
    },
    {
      id: 'four-rows',
      label: 'Rows',
      cols: 1,
      rows: 4,
      panels: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }, { col: 1, row: 4 }],
    },
    {
      id: 'four-left-feature',
      label: '1 | 3',
      cols: 2,
      rows: 3,
      panels: [
        { col: 1, row: 1, rowSpan: 3 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
        { col: 2, row: 3 },
      ],
    },
    {
      id: 'four-top-feature',
      label: '1 + 3',
      cols: 3,
      rows: 2,
      panels: [
        { col: 1, row: 1, colSpan: 3 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
  ],
  5: [
    {
      id: 'five-bottom-wide',
      label: '3 + 2',
      cols: 3,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2, colSpan: 2 },
      ],
    },
    {
      id: 'five-top-wide',
      label: '2 + 3',
      cols: 3,
      rows: 2,
      panels: [
        { col: 1, row: 1, colSpan: 2 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
    {
      id: 'five-left-feature',
      label: '1 | 4',
      cols: 3,
      rows: 2,
      panels: [
        { col: 1, row: 1, rowSpan: 2 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
    {
      id: 'five-top-feature',
      label: '1 + 4',
      cols: 2,
      rows: 3,
      panels: [
        { col: 1, row: 1, colSpan: 2 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
      ],
    },
  ],
  6: [
    {
      id: 'six-3x2',
      label: '3 x 2',
      cols: 3,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
    {
      id: 'six-2x3',
      label: '2 x 3',
      cols: 2,
      rows: 3,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
      ],
    },
    {
      id: 'six-top-feature',
      label: '1 + 5',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1, colSpan: 3 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3, colSpan: 2 },
      ],
    },
  ],
  7: [
    {
      id: 'seven-bottom-wide',
      label: '3 + 3 + 1',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 1, row: 3, colSpan: 3 },
      ],
    },
    {
      id: 'seven-top-feature',
      label: '1 + 6',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1, colSpan: 3 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ],
    },
    {
      id: 'seven-left-feature',
      label: '1 | 6',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1, rowSpan: 3 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ],
    },
  ],
  8: [
    {
      id: 'eight-bottom-pair',
      label: '3 + 3 + 2',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3, colSpan: 2 },
      ],
    },
    {
      id: 'eight-top-feature',
      label: '1 + 7',
      cols: 4,
      rows: 3,
      panels: [
        { col: 1, row: 1, colSpan: 4 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 4, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
        { col: 3, row: 3, colSpan: 2 },
      ],
    },
    {
      id: 'eight-4x2',
      label: '4 x 2',
      cols: 4,
      rows: 2,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 4, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 4, row: 2 },
      ],
    },
  ],
  9: [
    {
      id: 'nine-grid',
      label: '3 x 3',
      cols: 3,
      rows: 3,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ],
    },
    {
      id: 'nine-feature-center',
      label: 'Center',
      cols: 4,
      rows: 4,
      panels: [
        { col: 1, row: 1 },
        { col: 2, row: 1, colSpan: 2 },
        { col: 4, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2, colSpan: 2, rowSpan: 2 },
        { col: 4, row: 2 },
        { col: 1, row: 3 },
        { col: 4, row: 3 },
        { col: 1, row: 4, colSpan: 4 },
      ],
    },
  ],
}

export function getLayoutsForPanelCount(panelCount) {
  return PANEL_LAYOUTS[panelCount] ?? PANEL_LAYOUTS[1]
}

export function getDefaultLayoutId(panelCount) {
  return getLayoutsForPanelCount(panelCount)[0].id
}

export function getPanelLayout(panelCount, layoutId) {
  const layouts = getLayoutsForPanelCount(panelCount)
  return layouts.find(layout => layout.id === layoutId) ?? layouts[0]
}

export function getPanelPlacement(panelCount, layoutId, idx) {
  const layout = getPanelLayout(panelCount, layoutId)
  return layout.panels[idx] ?? { col: 1, row: 1 }
}

// --- Bubble types ---------------------------------------------------
export const BUBBLE_TYPES = [
  { value: 'speech',    label: 'Speech' },
  { value: 'thought',   label: 'Thought' },
  { value: 'shout',     label: 'Shout' },
  { value: 'whisper',   label: 'Whisper' },
  { value: 'caption',   label: 'Caption' },
  { value: 'narration', label: 'Narration' },
]

export const BUBBLE_STYLE_PRESETS = [
  {
    value: 'classic-comic',
    label: 'Classic Speech',
    type: 'speech',
  },
  {
    value: 'manga-dialogue',
    label: 'Manga Dialogue',
    type: 'speech',
  },
  {
    value: 'thought-soft',
    label: 'Thought',
    type: 'thought',
  },
  {
    value: 'shout-burst',
    label: 'Shout Burst',
    type: 'shout',
  },
  {
    value: 'whisper-dashed',
    label: 'Whisper',
    type: 'whisper',
  },
  {
    value: 'caption-box',
    label: 'Caption Box',
    type: 'caption',
  },
  {
    value: 'narration-box',
    label: 'Narration Box',
    type: 'narration',
  },
  {
    value: 'radio-electric',
    label: 'Radio / Tech',
    type: 'speech',
  },
  {
    value: 'sfx-impact',
    label: 'SFX Impact',
    type: 'sfx',
  },
]

// --- Style presets --------------------------------------------------
export const ART_STYLES = [
  'manga', 'western comic', 'watercolor', 'sketch',
  'cartoon', 'realistic', 'noir', 'chibi', 'indie comic',
]

export const GENRES = [
  'action', 'romance', 'comedy', 'drama',
  'sci-fi', 'fantasy', 'horror', 'mystery', 'slice of life',
]

export const MOODS = [
  'dark', 'cheerful', 'mysterious', 'tense',
  'epic', 'melancholic', 'whimsical', 'gritty', 'romantic',
]

// --- Text / reasoning models (AI Fill: story -> script) ------------
// Source: developers.openai.com/api/docs/models (updated 2026-07)
export const TEXT_MODELS = [
  {
    value: 'gpt-5.5',
    label: 'GPT-5.5',
    desc: 'Flagship - best reasoning, coding & creative writing',
    badge: 'Best',
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    desc: 'Strong quality at lower cost than 5.5',
    badge: null,
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    desc: 'Fast & affordable - great for most comic scripts',
    badge: 'Recommended',
  },
  {
    value: 'gpt-5.4-nano',
    label: 'GPT-5.4 nano',
    desc: 'Fastest & cheapest - simple stories',
    badge: null,
  },
]

// --- Image generation models (panel image generation) --------------
// Google Gemini image models via generateContent endpoint
export const IMAGE_MODELS = [
  {
    value: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    provider: 'google',
    desc: 'Balanced - 4K generation, multi-reference, text rendering (recommended)',
    badge: 'Recommended',
    sizes: ['1:1', '3:4', '9:16', '4:3', '16:9'],
    defaultSize: '3:4',
  },
  {
    value: 'gemini-3.1-flash-lite-image',
    label: 'Nano Banana 2 Lite',
    provider: 'google',
    desc: 'Fastest and cheapest - best for speed and scale',
    badge: 'Fast',
    sizes: ['1:1', '3:4', '9:16', '4:3', '16:9'],
    defaultSize: '3:4',
  },
  {
    value: 'gemini-3-pro-image',
    label: 'Nano Banana Pro',
    provider: 'google',
    desc: 'Premium - highest world knowledge, brand consistency, creative precision',
    badge: 'Pro',
    sizes: ['1:1', '3:4', '9:16', '4:3', '16:9'],
    defaultSize: '3:4',
  },
]

// --- Image quality options ------------------------------------------
export const IMAGE_QUALITIES = [
  { value: 'low',    label: 'Low - fastest & cheapest' },
  { value: 'medium', label: 'Medium - balanced' },
  { value: 'high',   label: 'High - best detail' },
]

// --- Grid dimensions from panel count ------------------------------
export function getGridDims(panelCount, layoutId = null) {
  const layout = getPanelLayout(panelCount, layoutId)
  return { cols: layout.cols, rows: layout.rows }
}

// --- Tiny unique ID (non-cryptographic) ----------------------------
export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}
