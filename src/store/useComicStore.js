import { create } from 'zustand'
import { uid, getGridDims, getDefaultLayoutId } from '../utils/defaults'

// ─── Factory functions ───────────────────────────────────────────

export function createBubble(overrides = {}) {
  return {
    id: uid(),
    type: 'speech',      // speech | thought | shout | whisper | caption | narration
    style: 'classic-comic',
    text: '',
    x: 20,              // percent from left
    y: 10,              // percent from top
    width: 40,          // percent
    height: null,       // percent; null = auto height from content/style
    tail: {
      enabled: true,
      side: 'bottom-left',
      targetX: 18,
      targetY: 86,
      bend: -10,
      baseWidth: 16,
    },
    typography: {
      fontSize: 13,
      weight: 800,
      uppercase: true,
      italic: false,
      align: 'center',
      fontSizeLocked: false,
    },
    appearance: {
      fill: '#ffffff',
      stroke: '#111111',
      strokeWidth: 3,
    },
    ...overrides,
  }
}

export function createPanel(overrides = {}) {
  return {
    id: uid(),
    prompt: '',
    perspective: 'medium-shot',
    styleOverride: null,   // null = inherit global style
    characters: [],         // array of character IDs assigned to this panel
    bubbles: [],            // array of bubble objects
    notes: '',
    imageUrl: null,         // legacy inline/base64 generated panel image
    imageAssetId: null,     // IndexedDB image asset id for generated panel image
    imageOffsetX: 0,        // crop pan offset (% of panel width)
    imageOffsetY: 0,
    imageScale: 1,          // zoom multiplier, 1 = no extra zoom
    imageSize: 'auto',
    imageResolution: '1K',
    referencePrompt: '',
    referenceImageIds: [],
    editPrompt: '',
    geminiInteractionId: null,  // Gemini Interactions API id for multi-turn editing
    characterLooks: {},     // { [characterId]: lookId } — preset/look override per character in this panel
    ...overrides,
  }
}

export function createCharacterLook(overrides = {}) {
  return {
    id: uid(),
    name: 'New Look',
    imageUrl: null,
    prompt: '',
    referenceImageIds: [],   // up to MAX_LOOK_REFERENCE_IMAGES asset ids used when generating this look
    ...overrides,
  }
}

export function createPage(overrides = {}) {
  const panelCount = overrides.panelCount ?? 3
  const layoutId = overrides.layoutId ?? getDefaultLayoutId(panelCount)
  const { cols, rows } = getGridDims(panelCount, layoutId)
  return {
    id: uid(),
    title: 'Page',
    panelCount,
    layoutId,
    colSizes: Array(cols).fill(1),
    rowSizes: Array(rows).fill(1),
    panels: Array.from({ length: panelCount }, () => createPanel()),
    ...overrides,
  }
}

// ─── Initial state ───────────────────────────────────────────────

const initialPage = createPage({ title: 'Page 1' })

const PROJECT_STATE_KEYS = [
  'comicTitle',
  'storyScript',
  'imageModel',
  'imageQuality',
  'geminiApiKey',
  'globalStyle',
  'pages',
  'selectedPageId',
  'selectedPanelId',
  'characters',
  'styleReferences',
  'projectImages',
]

function cloneProjectState(state) {
  return PROJECT_STATE_KEYS.reduce((snapshot, key) => {
    snapshot[key] = JSON.parse(JSON.stringify(state[key]))
    return snapshot
  }, {})
}

function sameProjectState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ─── Store ───────────────────────────────────────────────────────

const useComicStore = create((set, get) => {
  const trackedSet = (partial, replace) => {
    const before = cloneProjectState(get())
    set(partial, replace)
    const state = get()
    const after = cloneProjectState(state)
    if (state.historyApplying || sameProjectState(before, after)) return
    set({
      undoStack: [...state.undoStack.slice(-49), before],
      redoStack: [],
    })
  }

  return ({
  // ── Comic meta ─────────────────────────────────────────────────
  comicTitle: 'My Comic',
  storyScript: '',       // master story / script the user writes
  imageModel: 'gemini-3.1-flash-image',
  imageQuality: 'medium',
  geminiApiKey: '',
  // On by default; remembers the user's choice once they've touched it.
  autoSaveImages: (() => {
    try {
      const saved = localStorage.getItem('comic-auto-save-images')
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })(),

  // ── Global style (applies to all panels unless overridden) ─────
  globalStyle: {
    artStyle: 'manga',
    colorPalette: 'full-color',
    lineWeight: 'medium',
    mood: 'adventure',
    genre: 'action',
    setting: '',
  },

  // ── Pages ──────────────────────────────────────────────────────
  pages: [initialPage],
  selectedPageId: initialPage.id,
  selectedPanelId: null,

  // ── Characters ─────────────────────────────────────────────────
  characters: [],

  // ── Style references ──────────────────────────────────────────
  styleReferences: [],   // { id, name, url }
  projectImages: [],      // { id, name, imageUrl, imageAssetId }

  // ── UI state ───────────────────────────────────────────────────
  rightSidebarTab: 'properties',   // 'properties' | 'style' | 'characters'
  showLeftSidebar: true,
  showRightSidebar: true,

  // ── Panel edit modal ─────────────────────────────────────────
  panelEditModalOpen: false,
  panelEditModalPanelId: null,
  panelEditModalInitialBubbleId: null,

  // ── Character studio modal ───────────────────────────────────
  characterManagerOpen: false,
  characterManagerCharacterId: null,

  undoStack: [],
  redoStack: [],
  historyApplying: false,

  getHistorySnapshot: () => cloneProjectState(get()),

  commitHistorySnapshot: (before) => {
    if (!before) return
    const state = get()
    const after = cloneProjectState(state)
    if (sameProjectState(before, after)) return
    set({
      undoStack: [...state.undoStack.slice(-49), before],
      redoStack: [],
    })
  },

  undo: () => {
    const state = get()
    const previous = state.undoStack.at(-1)
    if (!previous) return
    const current = cloneProjectState(state)
    set({
      ...previous,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [current, ...state.redoStack].slice(0, 50),
      historyApplying: false,
      panelEditModalOpen: false,
      panelEditModalPanelId: null,
      panelEditModalInitialBubbleId: null,
    })
  },

  redo: () => {
    const state = get()
    const next = state.redoStack[0]
    if (!next) return
    const current = cloneProjectState(state)
    set({
      ...next,
      undoStack: [...state.undoStack, current].slice(-50),
      redoStack: state.redoStack.slice(1),
      historyApplying: false,
      panelEditModalOpen: false,
      panelEditModalPanelId: null,
      panelEditModalInitialBubbleId: null,
    })
  },

  // ═══ Page actions ══════════════════════════════════════════════

  addPage: () => trackedSet((state) => {
    const page = createPage({ title: `Page ${state.pages.length + 1}` })
    return { pages: [...state.pages, page], selectedPageId: page.id, selectedPanelId: null }
  }),

  removePage: (pageId) => trackedSet((state) => {
    if (state.pages.length <= 1) return {}
    const pages = state.pages.filter(p => p.id !== pageId)
    const selectedPageId = state.selectedPageId === pageId ? pages[0].id : state.selectedPageId
    return { pages, selectedPageId, selectedPanelId: null }
  }),

  duplicatePage: (pageId) => trackedSet((state) => {
    const src = state.pages.find(p => p.id === pageId)
    if (!src) return {}
    const copy = {
      ...src,
      id: uid(),
      title: src.title + ' (copy)',
      panels: src.panels.map(p => ({
        ...p,
        id: uid(),
        bubbles: p.bubbles.map(b => ({ ...b, id: uid() })),
      })),
    }
    const idx = state.pages.findIndex(p => p.id === pageId)
    const pages = [...state.pages.slice(0, idx + 1), copy, ...state.pages.slice(idx + 1)]
    return { pages }
  }),

  selectPage: (pageId) => set({ selectedPageId: pageId, selectedPanelId: null }),

  updatePage: (pageId, updates) => trackedSet((state) => ({
    pages: state.pages.map(p => (p.id === pageId ? { ...p, ...updates } : p)),
  })),

  updatePageLive: (pageId, updates) => set((state) => ({
    pages: state.pages.map(p => (p.id === pageId ? { ...p, ...updates } : p)),
  })),

  setPanelCount: (pageId, count) => trackedSet((state) => {
    const page = state.pages.find(p => p.id === pageId)
    if (!page) return {}
    const current = page.panels
    const panels =
      count > current.length
        ? [...current, ...Array.from({ length: count - current.length }, () => createPanel())]
        : current.slice(0, count)
    const selectedPanelId = panels.some(panel => panel.id === state.selectedPanelId)
      ? state.selectedPanelId
      : null
    const layoutId = getDefaultLayoutId(count)
    const { cols, rows } = getGridDims(count, layoutId)
    return {
      pages: state.pages.map(p => (p.id === pageId ? {
        ...p,
        panelCount: count,
        layoutId,
        panels,
        colSizes: Array(cols).fill(1),
        rowSizes: Array(rows).fill(1),
      } : p)),
      selectedPanelId,
    }
  }),

  setPageLayout: (pageId, layoutId) => trackedSet((state) => ({
    pages: state.pages.map(page => {
      if (page.id !== pageId) return page

      const { cols, rows } = getGridDims(page.panelCount, layoutId)
      const colSizes = page.colSizes?.length === cols ? page.colSizes : Array(cols).fill(1)
      const rowSizes = page.rowSizes?.length === rows ? page.rowSizes : Array(rows).fill(1)

      return { ...page, layoutId, colSizes, rowSizes }
    }),
  })),

  // ═══ Panel actions ═════════════════════════════════════════════

  selectPanel: (panelId) => set({ selectedPanelId: panelId }),

  updatePanel: (panelId, updates) => trackedSet((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId ? { ...panel, ...updates } : panel,
      ),
    })),
  })),

  updatePanelLive: (panelId, updates) => set((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId ? { ...panel, ...updates } : panel,
      ),
    })),
  })),

  // ═══ Bubble actions ════════════════════════════════════════════

  addBubble: (panelId, overrides = {}) => trackedSet((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId
          ? { ...panel, bubbles: [...panel.bubbles, createBubble(overrides)] }
          : panel,
      ),
    })),
  })),

  updateBubble: (panelId, bubbleId, updates) => trackedSet((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId
          ? {
              ...panel,
              bubbles: panel.bubbles.map(b => (b.id === bubbleId ? { ...b, ...updates } : b)),
            }
          : panel,
      ),
    })),
  })),

  removeBubble: (panelId, bubbleId) => trackedSet((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId
          ? {
              ...panel,
              bubbles: panel.bubbles.filter(b => b.id !== bubbleId),
            }
          : panel,
      ),
    })),
  })),

  updateBubbleLive: (panelId, bubbleId, updates) => set((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel =>
        panel.id === panelId
          ? {
              ...panel,
              bubbles: panel.bubbles.map(b => (b.id === bubbleId ? { ...b, ...updates } : b)),
            }
          : panel,
      ),
    })),
  })),

  // ═══ Style actions ═════════════════════════════════════════════

  updateGlobalStyle: (updates) => trackedSet((state) => ({
    globalStyle: { ...state.globalStyle, ...updates },
  })),

  setComicTitle: (title) => trackedSet({ comicTitle: title }),

  // ═══ Character actions ══════════════════════════════════════════

  addCharacter: (data = {}) => trackedSet((state) => ({
    characters: [
      ...state.characters,
      {
        id: uid(),
        name: 'New Character',
        description: '',
        imageUrl: null,
        color: '#8b5cf6',
        looks: [],
        ...data,
      },
    ],
  })),

  removeCharacter: (id) => trackedSet((state) => ({
    characters: state.characters.filter(c => c.id !== id),
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel => {
        if (!panel.characterLooks || !(id in panel.characterLooks)) return panel
        const characterLooks = { ...panel.characterLooks }
        delete characterLooks[id]
        return { ...panel, characterLooks }
      }),
    })),
  })),

  updateCharacter: (id, updates) => trackedSet((state) => ({
    characters: state.characters.map(c => (c.id === id ? { ...c, ...updates } : c)),
  })),

  // ═══ Character look (preset) actions ═════════════════════════════

  addCharacterLook: (characterId, data = {}) => trackedSet((state) => ({
    characters: state.characters.map(c => (c.id === characterId
      ? { ...c, looks: [...(c.looks || []), createCharacterLook(data)] }
      : c)),
  })),

  updateCharacterLook: (characterId, lookId, updates) => trackedSet((state) => ({
    characters: state.characters.map(c => (c.id === characterId
      ? { ...c, looks: (c.looks || []).map(l => (l.id === lookId ? { ...l, ...updates } : l)) }
      : c)),
  })),

  removeCharacterLook: (characterId, lookId) => trackedSet((state) => ({
    characters: state.characters.map(c => (c.id === characterId
      ? { ...c, looks: (c.looks || []).filter(l => l.id !== lookId) }
      : c)),
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel => {
        if (panel.characterLooks?.[characterId] !== lookId) return panel
        const characterLooks = { ...panel.characterLooks }
        delete characterLooks[characterId]
        return { ...panel, characterLooks }
      }),
    })),
  })),

  setPanelCharacterLook: (panelId, characterId, lookId) => trackedSet((state) => ({
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel => {
        if (panel.id !== panelId) return panel
        const characterLooks = { ...(panel.characterLooks || {}) }
        if (lookId) characterLooks[characterId] = lookId
        else delete characterLooks[characterId]
        return { ...panel, characterLooks }
      }),
    })),
  })),

  // ═══ Style reference actions ══════════════════════════════════

  addStyleReference: (ref) => trackedSet((state) => ({
    styleReferences: [...state.styleReferences, { id: uid(), name: 'Reference', ...ref }],
  })),

  removeStyleReference: (id) => trackedSet((state) => ({
    styleReferences: state.styleReferences.filter(r => r.id !== id),
  })),

  updateStyleReference: (id, updates) => trackedSet((state) => ({
    styleReferences: state.styleReferences.map(r => (r.id === id ? { ...r, ...updates } : r)),
  })),

  addProjectImage: (image) => trackedSet((state) => ({
    projectImages: [...state.projectImages, { id: uid(), name: 'Project image', imageUrl: null, imageAssetId: null, ...image }],
  })),

  removeProjectImage: (id) => trackedSet((state) => ({
    projectImages: state.projectImages.filter(image => image.id !== id),
    pages: state.pages.map(page => ({
      ...page,
      panels: page.panels.map(panel => ({
        ...panel,
        referenceImageIds: (panel.referenceImageIds || []).filter(refId => refId !== `project:${id}`),
      })),
    })),
  })),

  updateProjectImage: (id, updates) => trackedSet((state) => ({
    projectImages: state.projectImages.map(image => (image.id === id ? { ...image, ...updates } : image)),
  })),

  // ═══ UI actions ════════════════════════════════════════════

  toggleLeftSidebar: () => set((s) => ({ showLeftSidebar: !s.showLeftSidebar })),
  toggleRightSidebar: () => set((s) => ({ showRightSidebar: !s.showRightSidebar })),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),

  openStylePanel: () => set({ showRightSidebar: true, rightSidebarTab: 'style' }),
  openCharactersPanel: () => set({ showRightSidebar: true, rightSidebarTab: 'characters' }),
  openAssetsPanel: () => set({ showRightSidebar: true, rightSidebarTab: 'assets' }),

  openPanelEditModal: (panelId, bubbleId = null) => set({
    panelEditModalOpen: true,
    panelEditModalPanelId: panelId,
    panelEditModalInitialBubbleId: bubbleId,
  }),
  closePanelEditModal: () => set({ panelEditModalOpen: false, panelEditModalPanelId: null, panelEditModalInitialBubbleId: null }),

  openCharacterManager: (characterId = null) => set({ characterManagerOpen: true, characterManagerCharacterId: characterId }),
  closeCharacterManager: () => set({ characterManagerOpen: false }),
  setCharacterManagerCharacterId: (characterId) => set({ characterManagerCharacterId: characterId }),

  // ═══ AI fill modal ════════════════════════════════════════════

  aiFillModalOpen: false,
  openAIFillModal: () => set({ aiFillModalOpen: true }),
  closeAIFillModal: () => set({ aiFillModalOpen: false }),
  setStoryScript: (text) => trackedSet({ storyScript: text }),
  setImageModel: (v) => trackedSet({ imageModel: v }),
  setImageQuality: (v) => trackedSet({ imageQuality: v }),
  setGeminiApiKey: (v) => trackedSet({ geminiApiKey: v }),
  setAutoSaveImages: (v) => {
    try { localStorage.setItem('comic-auto-save-images', String(v)) } catch { /* ignore */ }
    trackedSet({ autoSaveImages: v })
  },
  })
})

export default useComicStore
