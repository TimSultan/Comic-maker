import React, { useRef, useState } from 'react'
import useComicStore from '../../store/useComicStore'
import StoredImage from '../StoredImage'
import {
  PERSPECTIVES,
  PANEL_COUNTS,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  MAX_REFERENCE_IMAGES,
  getGridDims,
  getLayoutsForPanelCount,
  getPanelPlacement,
  uid,
} from '../../utils/defaults'
import { generatePanelImage, getDefaultCharacterPortraitPrompt } from '../../utils/imageGen'
import { deleteImageAsset, putImageAsset, resolveImageUrl } from '../../utils/imageStore'
import { downloadDataUrlImage } from '../../utils/downloadImage'

// ─── Compute the best API size/ratio for the current panel ───────
// Page canvas: 620×877px total, 10px padding each side, 6px gap between cells
const PAGE_INNER_W = 600
const PAGE_INNER_H = 857

function getPanelAspectSize(panel, page, imageModel) {
  if (panel?.imageSize && panel.imageSize !== 'auto') return panel.imageSize
  if (!panel || !page) return '3:4'
  const { cols, rows } = getGridDims(page.panelCount, page.layoutId)
  const colSizes  = page.colSizes?.length === cols  ? page.colSizes  : Array(cols).fill(1)
  const rowSizes  = page.rowSizes?.length === rows  ? page.rowSizes  : Array(rows).fill(1)
  const totalColFr = colSizes.reduce((a, b) => a + b, 0)
  const totalRowFr = rowSizes.reduce((a, b) => a + b, 0)

  const idx = page.panels.findIndex(p => p.id === panel.id)
  if (idx < 0) return '3:4'

  const placement = getPanelPlacement(page.panelCount, page.layoutId, idx)
  const colSpan = placement.colSpan ?? 1
  const rowSpan = placement.rowSpan ?? 1
  const widthFr = colSizes
    .slice(placement.col - 1, placement.col - 1 + colSpan)
    .reduce((a, b) => a + b, 0)
  const heightFr = rowSizes
    .slice(placement.row - 1, placement.row - 1 + rowSpan)
    .reduce((a, b) => a + b, 0)

  const panelW = (widthFr / totalColFr) * (PAGE_INNER_W - (cols - 1) * 6) + (colSpan - 1) * 6
  const panelH = (heightFr / totalRowFr) * (PAGE_INNER_H - (rows - 1) * 6) + (rowSpan - 1) * 6
  const ratio  = panelW / panelH

  const isGoogle = imageModel?.startsWith('gemini-') || imageModel?.startsWith('imagen-')

  if (isGoogle) {
    const opts = { '1:1': 1, '3:4': 0.75, '4:3': 1.333, '9:16': 0.5625, '16:9': 1.778 }
    return Object.entries(opts).reduce((best, [k, v]) =>
      Math.abs(ratio - v) < Math.abs(ratio - opts[best]) ? k : best, '3:4')
  }
  const opts = { '1024x1024': 1, '1024x1536': 0.667, '1536x1024': 1.5, '1024x1792': 0.571, '1792x1024': 1.75 }
  return Object.entries(opts).reduce((best, [k, v]) =>
    Math.abs(ratio - v) < Math.abs(ratio - opts[best]) ? k : best, '1024x1536')
}

function getImageSizeOptions(imageModel) {
  const selectedModel = IMAGE_MODELS.find(m => m.value === imageModel)
  const sizes = selectedModel?.sizes?.length
    ? selectedModel.sizes
    : ['1024x1024', '1024x1536', '1536x1024', '1024x1792', '1792x1024']

  return [
    { value: 'auto', label: 'Auto' },
    ...sizes.map(size => ({ value: size, label: size })),
  ]
}

function getImageResolutionOptions(imageModel) {
  if (imageModel === 'gemini-3.1-flash-lite-image') {
    return ['1K']
  }
  if (imageModel?.startsWith('gemini-')) {
    return ['512', '1K', '2K', '4K']
  }
  return []
}

// ─── Shared: image upload helper ────────────────────────────────

function ImageUploadButton({ onImage, label = '+ Add Image' }) {
  const ref = useRef()
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onImage(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        onClick={() => ref.current.click()}
      >
        {label}
      </button>
    </>
  )
}

function LayoutPreviewButton({ layout, active, onClick }) {
  return (
    <button
      className={`rounded-md border p-1.5 transition-all ${
        active
          ? 'border-purple-500 bg-purple-950/40'
          : 'border-gray-700 bg-gray-800 hover:border-gray-500'
      }`}
      onClick={onClick}
      title={layout.label}
    >
      <div className="h-14 w-full bg-gray-950 rounded-sm p-0.5">
        <div
          className="grid h-full w-full gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          }}
        >
          {layout.panels.map((placement, idx) => (
            <div
              key={idx}
              className={active ? 'bg-purple-400' : 'bg-gray-500'}
              style={{
                gridColumn: `${placement.col} / span ${placement.colSpan ?? 1}`,
                gridRow: `${placement.row} / span ${placement.rowSpan ?? 1}`,
              }}
            />
          ))}
        </div>
      </div>
      <span className={`mt-1 block truncate text-xs ${active ? 'text-purple-200' : 'text-gray-500'}`}>
        {layout.label}
      </span>
    </button>
  )
}

function PageLayoutSection({ page, pageLayouts, onPanelCount, onPageLayout }) {
  if (!page) return null

  return (
    <section>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        Panels on This Page
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PANEL_COUNTS.map(n => (
          <button
            key={n}
            className={`w-9 h-9 text-sm rounded-md border font-medium transition-all ${
              page.panelCount === n
                ? 'border-purple-500 bg-purple-950 text-purple-200'
                : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
            onClick={() => onPanelCount(page.id, n)}
            title={`${n} panel${n !== 1 ? 's' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-1">Existing content is preserved when increasing.</p>

      {pageLayouts.length > 1 && (
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Arrangement
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {pageLayouts.map(layout => (
              <LayoutPreviewButton
                key={layout.id}
                layout={layout}
                active={(page.layoutId ?? pageLayouts[0].id) === layout.id}
                onClick={() => onPageLayout(page.id, layout.id)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export function collectProjectImages({ pages, characters, styleReferences, projectImages }) {
  const images = []

  ;(projectImages || []).forEach(image => {
    if (image.imageUrl || image.imageAssetId) {
      images.push({
        id: `project:${image.id}`,
        url: image.imageUrl,
        assetId: image.imageAssetId,
        label: image.name || 'Project image',
        source: 'Project',
      })
    }
  })

  characters.forEach(char => {
    // Every image ever uploaded/generated for this character (not just the
    // current main one) is a valid reference candidate elsewhere in the app.
    const galleryImages = char.images && char.images.length > 0
      ? char.images
      : (char.imageUrl ? [{ id: 'legacy-main', imageUrl: char.imageUrl }] : [])
    const mainId = char.mainImageId ?? galleryImages[0]?.id
    galleryImages.forEach(img => {
      if (!img.imageUrl) return
      const isMain = img.id === mainId
      images.push({
        // Keep the main image's id stable as `character:<id>` for backward
        // compatibility with projects saved before the gallery existed.
        id: isMain ? `character:${char.id}` : `characterImage:${char.id}:${img.id}`,
        url: img.imageUrl,
        label: isMain ? (char.name || 'Character') : `${char.name || 'Character'} (alt)`,
        source: 'Character',
      })
    })
    ;(char.looks || []).forEach(look => {
      if (look.imageUrl) {
        images.push({
          id: `characterLook:${char.id}:${look.id}`,
          url: look.imageUrl,
          label: `${char.name || 'Character'} - ${look.name || 'Look'}`,
          source: 'Character look',
        })
      }
    })
  })

  styleReferences.forEach(ref => {
    if (ref.url) {
      images.push({
        id: `style:${ref.id}`,
        url: ref.url,
        label: ref.name || 'Style reference',
        source: 'Style',
      })
    }
  })

  pages.forEach((page, pageIdx) => {
    page.panels.forEach((panel, panelIdx) => {
      if (panel.imageUrl || panel.imageAssetId) {
        images.push({
          id: `panel:${panel.id}`,
          url: panel.imageUrl,
          assetId: panel.imageAssetId,
          label: `${page.title || `Page ${pageIdx + 1}`} - Panel ${panelIdx + 1}`,
          source: 'Panel',
        })
      }
    })
  })

  return images
}

// ─── Resolve a per-panel character look (preset) override ─────────

function resolveCharacterLook(character, panel) {
  const lookId = panel?.characterLooks?.[character.id]
  if (!lookId) return null
  return character.looks?.find(look => look.id === lookId) ?? null
}

function resolveCharacterForPanel(character, panel) {
  const look = resolveCharacterLook(character, panel)
  if (!look) return character
  return {
    ...character,
    imageUrl: look.imageUrl || character.imageUrl,
    description: [character.description, look.name ? `Look: ${look.name}` : ''].filter(Boolean).join(' — '),
  }
}

export function ReferenceImagePicker({ open, images, selectedIds, onToggle, onClose, maxSelected = null }) {
  if (!open) return null

  const limitReached = maxSelected != null && selectedIds.length >= maxSelected

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[680px] max-w-[92vw] max-h-[82vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-white">Select Reference Images</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedIds.length}{maxSelected != null ? ` / ${maxSelected}` : ''} selected
            </p>
          </div>
          <button
            className="w-8 h-8 rounded-md text-gray-400 hover:bg-gray-800 hover:text-white"
            onClick={onClose}
          >
            X
          </button>
        </div>

        {images.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            No images in this project yet. Add character references, style references, or generate panels first.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-3 overflow-y-auto">
            {images.map(image => {
              const selected = selectedIds.includes(image.id)
              const disabled = !selected && limitReached
              return (
                <button
                  key={image.id}
                  disabled={disabled}
                  className={`text-left rounded-md border overflow-hidden transition-all ${
                    selected
                      ? 'border-purple-500 bg-purple-950/40'
                      : disabled
                      ? 'border-gray-800 bg-gray-800/50 opacity-40 cursor-not-allowed'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                  }`}
                  onClick={() => onToggle(image.id)}
                >
                  <div className="relative aspect-square bg-gray-950 flex items-center justify-center">
                    <StoredImage src={image.url} assetId={image.assetId} alt="" className="max-w-full max-h-full object-contain" />
                    {selected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-200 truncate">{image.label}</div>
                    <div className="text-xs text-gray-500">{image.source}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            className="px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Panel Tab
// ═══════════════════════════════════════════════════════════════

function PanelTab() {
  const pages            = useComicStore(s => s.pages)
  const selectedPageId   = useComicStore(s => s.selectedPageId)
  const selectedPanelId  = useComicStore(s => s.selectedPanelId)
  const globalStyle      = useComicStore(s => s.globalStyle)
  const imageModel       = useComicStore(s => s.imageModel)
  const imageQuality     = useComicStore(s => s.imageQuality)
  const allCharacters    = useComicStore(s => s.characters)
  const styleReferences  = useComicStore(s => s.styleReferences)
  const projectImages    = useComicStore(s => s.projectImages)
  const { updatePanel, setPanelCount, setPageLayout, openPanelEditModal, setImageModel, setImageQuality, setPanelCharacterLook } = useComicStore()

  const [genState, setGenState] = useState({ loading: false, error: '' })
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)

  const page = pages.find(p => p.id === selectedPageId) ?? pages[0] ?? null
  const panel = page?.panels.find(p => p.id === selectedPanelId) ?? null
  const pageLayouts = page ? getLayoutsForPanelCount(page.panelCount) : []
  const assetImages = collectProjectImages({ pages, characters: allCharacters, styleReferences, projectImages })
  const selectedReferenceIds = panel?.referenceImageIds ?? []
  const selectedReferenceImages = assetImages.filter(image => selectedReferenceIds.includes(image.id))
  const supportsReferenceImages = imageModel.startsWith('gemini-')
  const hasPanelImage = Boolean(panel?.imageUrl || panel?.imageAssetId)
  const isEditingExistingImage = hasPanelImage
  const imageSizeOptions = getImageSizeOptions(imageModel)
  const imageResolutionOptions = getImageResolutionOptions(imageModel)
  const activeImageResolution = imageResolutionOptions.includes(panel?.imageResolution)
    ? panel.imageResolution
    : imageResolutionOptions[0] ?? '1K'
  const emptyPanelsToGenerate = page?.panels.filter(p =>
    !(p.imageUrl || p.imageAssetId) && p.prompt?.trim()
  ) ?? []
  const generateDisabled = genState.loading || (
    isEditingExistingImage
      ? !(panel.prompt?.trim() || panel.editPrompt?.trim())
      : !panel?.prompt?.trim()
  )

  const handleReferenceToggle = (imageId) => {
    if (!panel) return
    const current = panel.referenceImageIds ?? []
    updatePanel(panel.id, {
      referenceImageIds: current.includes(imageId)
        ? current.filter(id => id !== imageId)
        : [...current, imageId],
    })
  }

  const generateImageForPanel = async (targetPanel, targetPage, { apiKey, geminiApiKey, imageSize, imageResolution }) => {
    const generationPanel = {
      ...targetPanel,
      imageSize: imageSize ?? targetPanel.imageSize,
      imageResolution: imageResolution ?? targetPanel.imageResolution,
    }
    const isEditingExistingImage = Boolean(targetPanel.imageUrl || targetPanel.imageAssetId)
    const selectedChars = allCharacters
      .filter(c => targetPanel.characters?.includes(c.id))
      .map(c => resolveCharacterForPanel(c, targetPanel))
    const selectedPanelReferenceImages = assetImages.filter(image => (targetPanel.referenceImageIds ?? []).includes(image.id))
    const currentPanelImageUrl = await resolveImageUrl(targetPanel.imageUrl, targetPanel.imageAssetId)
    const currentImageReference = isEditingExistingImage && currentPanelImageUrl
        ? [{
            url: currentPanelImageUrl,
            name: 'Current panel image to edit',
            type: 'current-panel',
          }]
        : []
    const selectedImageReferences = (await Promise.all(selectedPanelReferenceImages.map(async image => ({
        url: await resolveImageUrl(image.url, image.assetId),
        name: `${image.source} reference: ${image.label}`,
        type: 'selected',
      })))).filter(image => image.url)
    const editInstructions = targetPanel.editPrompt?.trim()
    const referenceInstructions = [
        isEditingExistingImage
          ? editInstructions
            ? `Edit the current panel image with this request: ${editInstructions}`
            : 'Edit the current panel image using the panel prompt. Preserve the existing composition and identity unless the prompt says otherwise.'
          : '',
        selectedImageReferences.length > 0 ? targetPanel.referencePrompt ?? '' : '',
      ].filter(Boolean).join(' ')
    const generationPrompt = isEditingExistingImage && editInstructions
      ? `${targetPanel.prompt?.trim() ? `${targetPanel.prompt.trim()}\n\n` : ''}Edit request: ${editInstructions}`
      : targetPanel.prompt
    const targetResolution = imageResolutionOptions.includes(generationPanel.imageResolution)
      ? generationPanel.imageResolution
      : imageResolutionOptions[0] ?? '1K'
    const size = getPanelAspectSize(generationPanel, targetPage, imageModel)
    const { imageUrl, interactionId } = await generatePanelImage({
        prompt: generationPrompt,
        perspective: targetPanel.perspective,
        globalStyle,
        characters: selectedChars,
        styleReferences,
        imageReferences: [...currentImageReference, ...selectedImageReferences],
        referencePrompt: referenceInstructions,
        apiKey,
        geminiApiKey,
        imageModel,
        quality: imageQuality,
        size,
        imageResolution: targetResolution,
        previousInteractionId: targetPanel.geminiInteractionId ?? null,
      })
    // Always write a fresh asset id (never reuse targetPanel.imageAssetId):
    // PanelImage/StoredImage only re-fetch from IndexedDB when the
    // imageUrl/assetId props they receive change, so overwriting the same
    // id in place left the canvas showing the stale cached image after an
    // edit. Reusing the id here was pointless anyway — multi-turn edit
    // continuity is tracked separately via geminiInteractionId.
    const previousAssetId = targetPanel.imageAssetId
    const imageAssetId = await putImageAsset({
        dataUrl: imageUrl,
        source: 'panel',
        label: `${targetPage.title || 'Page'} - panel`,
      })
    updatePanel(targetPanel.id, {
      imageUrl: null,
      imageAssetId,
      imageOffsetX: 0,
      imageOffsetY: 0,
      imageScale: 1,
      imageSize: generationPanel.imageSize ?? 'auto',
      imageResolution: targetResolution,
      geminiInteractionId: interactionId,
    })
    if (previousAssetId && previousAssetId !== imageAssetId) {
      await deleteImageAsset(previousAssetId)
    }

    if (useComicStore.getState().autoSaveImages) {
      const idx = targetPage.panels.findIndex(p => p.id === targetPanel.id)
      const slug = (targetPage.title || 'page').replace(/\s+/g, '-').toLowerCase()
      downloadDataUrlImage(imageUrl, `${slug}-panel-${idx + 1}-${Date.now()}.png`)
    }
  }

  const handleGenerateImage = async () => {
    const apiKey       = localStorage.getItem('comic-oai-key')    ?? ''
    const geminiApiKey = localStorage.getItem('comic-gemini-key') ?? ''
    setGenState({ loading: true, error: '', mode: 'single' })
    try {
      await generateImageForPanel(panel, page, { apiKey, geminiApiKey })
      setGenState({ loading: false, error: '' })
    } catch (e) {
      setGenState({ loading: false, error: e.message })
    }
  }

  const handleGenerateEmptyPagePanels = async () => {
    if (!page || emptyPanelsToGenerate.length === 0) return
    const apiKey       = localStorage.getItem('comic-oai-key')    ?? ''
    const geminiApiKey = localStorage.getItem('comic-gemini-key') ?? ''
    let completed = 0
    setGenState({ loading: true, error: '', mode: 'page', done: 0, total: emptyPanelsToGenerate.length })
    try {
      for (let i = 0; i < emptyPanelsToGenerate.length; i += 1) {
        setGenState({ loading: true, error: '', mode: 'page', done: i, total: emptyPanelsToGenerate.length })
        await generateImageForPanel(emptyPanelsToGenerate[i], page, { apiKey, geminiApiKey })
        completed = i + 1
      }
      setGenState({ loading: false, error: '', mode: 'page', done: emptyPanelsToGenerate.length, total: emptyPanelsToGenerate.length })
    } catch (e) {
      setGenState({
        loading: false,
        error: e.message,
        mode: 'page',
        done: completed,
        total: emptyPanelsToGenerate.length,
      })
    }
  }

  const pageGenerateButton = (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 space-y-1.5">
      <button
        className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${
          genState.loading || emptyPanelsToGenerate.length === 0
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-purple-700 hover:bg-purple-600 text-white'
        }`}
        onClick={handleGenerateEmptyPagePanels}
        disabled={genState.loading || emptyPanelsToGenerate.length === 0}
        title={
          emptyPanelsToGenerate.length === 0
            ? 'No empty prompted panels on this page'
            : 'Generate images only for panels on this page that do not already have an image'
        }
      >
        {genState.loading && genState.mode === 'page'
          ? `Generating page ${genState.done ?? 0}/${genState.total ?? emptyPanelsToGenerate.length}`
          : `Generate Empty Panels on Page (${emptyPanelsToGenerate.length})`}
      </button>
      <p className="text-xs text-gray-600 leading-relaxed">
        Skips panels that already have an image. Panels without prompts are left empty.
      </p>
    </div>
  )

  if (!panel) {
    return (
      <div className="p-3 space-y-4">
        <PageLayoutSection
          page={page}
          pageLayouts={pageLayouts}
          onPanelCount={setPanelCount}
          onPageLayout={setPageLayout}
        />
        {pageGenerateButton}
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center border-t border-gray-800">
          <span className="text-4xl opacity-20 select-none">▭</span>
          <p className="text-xs text-gray-500">Select a panel in the canvas to edit its properties</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4">
      {/* ── Prompt ── */}
      <section>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Image Prompt
        </label>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200
            resize-none focus:outline-none focus:border-purple-500 transition-colors leading-relaxed"
          rows={5}
          placeholder="Describe what happens in this panel…"
          value={panel.prompt}
          onChange={e => updatePanel(panel.id, { prompt: e.target.value })}
        />
      </section>

      {/* ── Perspective ── */}
      <section>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Shot / Perspective
        </label>
        <div className="grid grid-cols-2 gap-1">
          {PERSPECTIVES.map(({ value, label }) => (
            <button
              key={value}
              className={`text-xs py-1.5 px-2 rounded-md border transition-all text-center ${
                panel.perspective === value
                  ? 'border-purple-500 bg-purple-950 text-purple-200 font-medium'
                  : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}
              onClick={() => updatePanel(panel.id, { perspective: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Bubbles ── */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bubbles</span>
          <span className="text-xs text-gray-600">{panel.bubbles?.length ?? 0} placed</span>
        </div>
        <button
          className="w-full py-2 text-xs rounded-lg border border-gray-700 text-gray-400
            hover:border-purple-500 hover:text-purple-300 transition-colors"
          onClick={() => openPanelEditModal(panel.id)}
        >
          🗨 Edit Bubbles &amp; Layout →
        </button>
      </section>

      {/* ── Characters in panel ── */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Characters in Panel
          </span>
          {(panel.characters?.length ?? 0) > 0 && (
            <button
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              onClick={() => updatePanel(panel.id, { characters: [] })}
            >
              Clear all
            </button>
          )}
        </div>

        {allCharacters.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-2 leading-relaxed">
            Add characters in the Characters tab, then assign them here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allCharacters.map(char => {
              const selected = panel.characters?.includes(char.id) ?? false
              const hasLooks = (char.looks?.length ?? 0) > 0
              const currentLookId = panel.characterLooks?.[char.id] ?? ''
              return (
                <div key={char.id} className="flex items-center gap-1">
                  <button
                    title={char.description || char.name}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all border ${
                      selected
                        ? 'border-transparent font-semibold text-white'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                    }`}
                    style={selected ? { background: char.color ?? '#8b5cf6' } : {}}
                    onClick={() => {
                      const current = panel.characters ?? []
                      updatePanel(panel.id, {
                        characters: selected
                          ? current.filter(id => id !== char.id)
                          : [...current, char.id],
                      })
                    }}
                  >
                    {char.imageUrl ? (
                      <img src={char.imageUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-3 h-3 rounded-full shrink-0 inline-block" style={{ background: char.color ?? '#8b5cf6' }} />
                    )}
                    {char.name}
                  </button>
                  {selected && hasLooks && (
                    <select
                      className="text-xs bg-gray-800 border border-gray-700 rounded-md px-1 py-1 text-gray-300 focus:outline-none focus:border-purple-500 transition-colors"
                      value={currentLookId}
                      onChange={e => setPanelCharacterLook(panel.id, char.id, e.target.value || null)}
                      title="Pick a saved look/preset for this character in this panel"
                    >
                      <option value="">Default look</option>
                      {char.looks.map(look => (
                        <option key={look.id} value={look.id}>{look.name || 'Look'}</option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Show summary of what gets sent to the image API */}
        {(panel.characters?.length ?? 0) > 0 && (() => {
          const selectedCharacters = allCharacters.filter(c => panel.characters?.includes(c.id))
          const withRef = selectedCharacters.filter(c => resolveCharacterForPanel(c, panel).imageUrl).length
          return (
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              {panel.characters.length} character{panel.characters.length !== 1 ? 's' : ''}
              {withRef > 0 && ` + ${withRef} ref image${withRef !== 1 ? 's' : ''}`} will be sent with the image prompt.
            </p>
          )
        })()}
      </section>

      {/* ── Director Notes ── */}
      <section>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Director Notes
        </label>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200
            resize-none focus:outline-none focus:border-purple-500 transition-colors leading-relaxed"
          rows={2}
          placeholder="Private notes for this panel…"
          value={panel.notes ?? ''}
          onChange={e => updatePanel(panel.id, { notes: e.target.value })}
        />
      </section>

      <div className="border-t border-gray-800" />

      {/* ── Panel Image ── */}
      <section>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Panel Image
        </label>

        {/* Model + Quality row */}
        {(() => {
          const selectedModel = IMAGE_MODELS.find(m => m.value === imageModel)
          const isGoogle = imageModel.startsWith('gemini-') || imageModel.startsWith('imagen-')
          return (
            <div className="flex gap-1.5 mb-2">
              <div className="flex-1 min-w-0">
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200
                    focus:outline-none focus:border-purple-500 transition-colors"
                  value={imageModel}
                  onChange={e => setImageModel(e.target.value)}
                  title={selectedModel?.desc ?? ''}
                >
                  {IMAGE_MODELS.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}{m.badge ? ` (${m.badge})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!isGoogle && (
                <div className="w-20 shrink-0">
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-1.5 py-1.5 text-xs text-gray-200
                      focus:outline-none focus:border-purple-500 transition-colors"
                    value={imageQuality}
                    onChange={e => setImageQuality(e.target.value)}
                    title="Image quality"
                  >
                    {IMAGE_QUALITIES.map(q => (
                      <option key={q.value} value={q.value}>{q.value.charAt(0).toUpperCase() + q.value.slice(1)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })()}

        <div className="mb-2">
          {pageGenerateButton}
        </div>

        <div className="mb-2">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Aspect Ratio
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {imageSizeOptions.map(option => (
              <button
                key={option.value}
                className={`text-xs px-2 py-1.5 rounded-md border transition-colors ${
                  (panel.imageSize ?? 'auto') === option.value
                    ? 'border-purple-500 bg-purple-950 text-purple-200'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                }`}
                onClick={() => updatePanel(panel.id, { imageSize: option.value })}
                title={option.value === 'auto' ? 'Match the generated size to the current panel shape' : `Generate ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {(panel.imageSize ?? 'auto') === 'auto' && (
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              Auto matches the current panel shape, so wide panels request wide images.
            </p>
          )}
        </div>

        {imageResolutionOptions.length > 0 && (
          <div className="mb-2">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Resolution
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {imageResolutionOptions.map(option => (
                <button
                  key={option}
                  className={`text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    activeImageResolution === option
                      ? 'border-purple-500 bg-purple-950 text-purple-200'
                      : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                  }`}
                  onClick={() => updatePanel(panel.id, { imageResolution: option })}
                  title={`Generate at ${option} resolution`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preview / placeholder */}
        {hasPanelImage ? (
          <div className="relative group rounded-lg overflow-hidden border border-gray-700 mb-2">
            <StoredImage src={panel.imageUrl} assetId={panel.imageAssetId} alt="Panel" className="w-full" />
            <button
              className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-red-700/80
                hover:bg-red-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={async () => {
                await deleteImageAsset(panel.imageAssetId)
                updatePanel(panel.id, { imageUrl: null, imageAssetId: null, geminiInteractionId: null })
              }}
              title="Clear image and reset edit chain"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-gray-700 bg-gray-800 mb-2">
            <p className="text-xs text-gray-600">No image generated yet</p>
          </div>
        )}

        {/* Multi-turn edit indicator */}
        {panel.geminiInteractionId && hasPanelImage && (
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <span>⟆</span> Multi-turn edit active
            </span>
            <button
              className="text-xs text-gray-600 hover:text-red-400 transition-colors"
              title="Clear edit chain — next generation starts fresh"
              onClick={() => updatePanel(panel.id, { geminiInteractionId: null })}
            >
              reset chain
            </button>
          </div>
        )}

        <div className="mb-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              className="text-xs px-2.5 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
              onClick={() => setReferencePickerOpen(true)}
            >
              Add selected project images as references
            </button>
            <span className="text-xs text-gray-500 shrink-0">{selectedReferenceImages.length} selected</span>
          </div>

          {selectedReferenceImages.length > 0 && (
            <>
              <textarea
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-purple-500"
                rows={2}
                placeholder="Optional: describe what to use from the selected reference images"
                value={panel.referencePrompt ?? ''}
                onChange={e => updatePanel(panel.id, { referencePrompt: e.target.value })}
              />

              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {selectedReferenceImages.map(image => (
                  <button
                    key={image.id}
                    className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-700 shrink-0"
                    title={`Remove ${image.label}`}
                    onClick={() => handleReferenceToggle(image.id)}
                  >
                    <StoredImage src={image.url} assetId={image.assetId} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] leading-4">remove</span>
                  </button>
                ))}
              </div>

              {!supportsReferenceImages && (
                <p className="text-xs text-yellow-600 leading-relaxed">
                  Image references are sent as image input only for Gemini image models.
                </p>
              )}
            </>
          )}

          <p className="text-xs text-gray-600 leading-relaxed">
            Character reference images assigned above are automatically sent when available.
          </p>
        </div>

        {isEditingExistingImage && (
          <div className="mb-2 space-y-1.5">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Edit Prompt
            </label>
            <textarea
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-purple-500"
              rows={3}
              placeholder="Describe what to change in the existing panel image"
              value={panel.editPrompt ?? ''}
              onChange={e => updatePanel(panel.id, { editPrompt: e.target.value })}
            />
          </div>
        )}

        <button
          className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors ${
            generateDisabled
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : hasPanelImage
              ? 'bg-indigo-700 hover:bg-indigo-600 text-white'
              : 'bg-green-700 hover:bg-green-600 text-white'
          }`}
          onClick={handleGenerateImage}
          disabled={generateDisabled}
          title={generateDisabled ? 'Write a prompt first' : hasPanelImage ? 'Edit using current image and prompt' : ''}
        >
          {genState.loading
            ? '⏳ Generating…'
            : hasPanelImage
            ? '✏️ Edit Image'
            : '🎨 Generate Image'}
        </button>

        {genState.error && (
          <div className="mt-1.5 p-2 rounded-lg bg-red-950/50 border border-red-800">
            <p className="text-xs text-red-300 font-semibold mb-0.5">Generation failed</p>
            <p className="text-xs text-red-400 leading-relaxed break-words">{genState.error}</p>
            {genState.error.includes('not found') && (
              <p className="text-xs text-red-500/70 mt-1">
                Try switching to a different image model in the AI Fill settings (✨ button).
              </p>
            )}
          </div>
        )}
        {generateDisabled && !genState.loading && (
          <p className="text-xs text-gray-600 mt-1 text-center">
            {hasPanelImage ? 'Write a panel prompt or edit prompt to enable editing.' : 'Write a prompt above to enable generation.'}
          </p>
        )}
      </section>

      <ReferenceImagePicker
        open={referencePickerOpen}
        images={assetImages}
        selectedIds={selectedReferenceIds}
        onToggle={handleReferenceToggle}
        onClose={() => setReferencePickerOpen(false)}
      />

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Style Tab
// ═══════════════════════════════════════════════════════════════

const STYLE_FIELDS = [
  { key: 'artStyle',     label: 'Art Style',     placeholder: 'e.g. manga, western, watercolor, noir' },
  { key: 'genre',        label: 'Genre',         placeholder: 'e.g. action, romance, sci-fi, fantasy' },
  { key: 'mood',         label: 'Mood',          placeholder: 'e.g. dark, cheerful, mysterious, epic' },
  { key: 'colorPalette', label: 'Color Palette', placeholder: 'e.g. full-color, monochrome, sepia' },
  { key: 'lineWeight',   label: 'Line Weight',   placeholder: 'e.g. thin, medium, bold, brushstroke' },
  { key: 'setting',      label: 'World / Setting', placeholder: 'e.g. feudal Japan, cyberpunk megacity' },
]

function StyleTab() {
  const globalStyle      = useComicStore(s => s.globalStyle)
  const styleReferences  = useComicStore(s => s.styleReferences)
  const { updateGlobalStyle, addStyleReference, removeStyleReference, updateStyleReference } = useComicStore()

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Global Comic Style</div>
      <p className="text-xs text-gray-600 leading-relaxed">
        These settings are prepended to every panel prompt when generating images.
      </p>

      {STYLE_FIELDS.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-xs text-gray-400 mb-1">{label}</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-200
              focus:outline-none focus:border-purple-500 transition-colors"
            value={globalStyle[key] ?? ''}
            placeholder={placeholder}
            onChange={e => updateGlobalStyle({ [key]: e.target.value })}
          />
        </div>
      ))}

      <div className="border-t border-gray-800 pt-3">
        {/* ── Style reference images ── */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Style References</span>
          <ImageUploadButton
            label="+ Add"
            onImage={url => addStyleReference({ url, name: 'Reference' })}
          />
        </div>

        {styleReferences.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4 leading-relaxed">
            Upload reference images to guide the AI art style.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {styleReferences.map(ref => (
              <div key={ref.id} className="relative group rounded-lg overflow-hidden border border-gray-700">
                <img src={ref.url} alt={ref.name} className="w-full h-20 object-cover" />
                <input
                  className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5
                    border-0 outline-none placeholder-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  value={ref.name}
                  placeholder="Label…"
                  onChange={e => updateStyleReference(ref.id, { name: e.target.value })}
                />
                <button
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-700
                    hover:bg-red-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeStyleReference(ref.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Characters Tab
// ═══════════════════════════════════════════════════════════════

function CharacterCard({ char, onUpdate, onRemove, onManageLooks }) {
  const globalStyle = useComicStore(s => s.globalStyle)
  const imageModel = useComicStore(s => s.imageModel)
  const imageQuality = useComicStore(s => s.imageQuality)
  const allCharacters = useComicStore(s => s.characters)
  const pages = useComicStore(s => s.pages)
  const styleReferences = useComicStore(s => s.styleReferences)
  const projectImages = useComicStore(s => s.projectImages)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)

  const assetImages = collectProjectImages({ pages, characters: allCharacters, styleReferences, projectImages })

  // Every image ever uploaded or generated for this character is kept here
  // so past attempts aren't lost — one of them is picked as the active
  // "main" reference (character.imageUrl, read everywhere else in the app).
  const storedImages = char.images ?? []
  const currentUrlTracked = char.imageUrl && storedImages.some(img => img.imageUrl === char.imageUrl)
  const images = char.imageUrl && !currentUrlTracked
    ? [...storedImages, { id: char.mainImageId || 'external-main', imageUrl: char.imageUrl }]
    : storedImages
  const mainId = char.mainImageId ?? images.find(img => img.imageUrl === char.imageUrl)?.id ?? images[0]?.id ?? null
  const mainImage = images.find(img => img.id === mainId) ?? null

  const referenceIds = char.referenceImageIds ?? []
  const referenceImages = assetImages.filter(img => referenceIds.includes(img.id))

  const toggleReference = (imageId) => {
    if (referenceIds.includes(imageId)) {
      onUpdate({ referenceImageIds: referenceIds.filter(id => id !== imageId) })
      return
    }
    if (referenceIds.length >= MAX_REFERENCE_IMAGES) return
    onUpdate({ referenceImageIds: [...referenceIds, imageId] })
  }

  const selectMain = (img) => {
    onUpdate({ images, mainImageId: img.id, imageUrl: img.imageUrl })
  }

  const deleteImage = (imgId) => {
    const nextImages = images.filter(img => img.id !== imgId)
    const nextMain = imgId === mainId ? nextImages[0] ?? null : images.find(img => img.id === mainId)
    onUpdate({
      images: nextImages,
      mainImageId: nextMain?.id ?? null,
      imageUrl: nextMain?.imageUrl ?? null,
    })
  }

  const addImage = (imageUrl) => {
    const newImg = { id: uid(), imageUrl }
    onUpdate({ images: [...images, newImg], mainImageId: newImg.id, imageUrl: newImg.imageUrl })
  }

  const handleGeneratePortrait = async () => {
    const apiKey = localStorage.getItem('comic-oai-key') ?? ''
    const geminiApiKey = localStorage.getItem('comic-gemini-key') ?? ''
    setGenerating(true)
    setGenError('')
    try {
      const resolvedRefs = (await Promise.all(referenceImages.map(async img => ({
        url: await resolveImageUrl(img.url, img.assetId),
        name: `${img.source} reference: ${img.label}`,
        type: 'selected',
      })))).filter(ref => ref.url)
      const prompt = char.prompt?.trim() || getDefaultCharacterPortraitPrompt(char)
      const { imageUrl } = await generatePanelImage({
        prompt,
        globalStyle,
        imageReferences: resolvedRefs,
        apiKey,
        geminiApiKey,
        imageModel,
        quality: imageQuality,
        size: '1:1',
      })
      addImage(imageUrl)
      if (useComicStore.getState().autoSaveImages) {
        const slug = (char.name || 'character').replace(/\s+/g, '-').toLowerCase()
        downloadDataUrlImage(imageUrl, `${slug}-portrait-${Date.now()}.png`)
      }
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      {/* Main reference image — shown in full (no crop); click to expand/minimize */}
      {mainImage ? (
        <div
          className={`relative group bg-gray-950 flex items-center justify-center overflow-hidden cursor-zoom-in transition-[height] duration-200 ${expanded ? 'h-96' : 'h-44'}`}
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Click to minimize' : 'Click to expand'}
        >
          <img src={mainImage.imageUrl} alt={char.name} className="max-w-full max-h-full object-contain" />
          <button
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-red-700/80
              hover:bg-red-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); deleteImage(mainImage.id) }}
            title="Delete this image"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center border-b border-dashed border-gray-700 bg-gray-900/40">
          <p className="text-xs text-gray-600 px-2.5 text-center leading-relaxed">No reference image yet</p>
        </div>
      )}

      {/* Gallery of every uploaded/generated image — click one to make it the main reference */}
      {images.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 border-b border-dashed border-gray-700 bg-gray-900/40">
          {images.map(img => (
            <div
              key={img.id}
              className={`relative group w-10 h-10 rounded-md overflow-hidden border-2 shrink-0 bg-gray-950 transition-colors ${
                img.id === mainId ? 'border-purple-500' : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <button
                className="w-full h-full flex items-center justify-center"
                onClick={() => selectMain(img)}
                title={img.id === mainId ? 'Main reference' : 'Set as main reference'}
              >
                <img src={img.imageUrl} alt="" className="max-w-full max-h-full object-contain" />
              </button>
              <button
                className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-red-700/90
                  hover:bg-red-600 text-white text-[10px] leading-none rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => { e.stopPropagation(); deleteImage(img.id) }}
                title="Delete this image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload / Generate — always available, whether or not an image already exists */}
      <div className="border-b border-dashed border-gray-700">
        <div className="flex items-center">
          <label className="flex-1 flex items-center justify-center gap-2 h-9
            cursor-pointer hover:bg-gray-700/40 transition-colors">
            <span className="text-xs text-gray-500">📷 Upload</span>
            <input
              type="file" accept="image/*" className="hidden"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => addImage(ev.target.result)
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
          </label>
          <div className="w-px self-stretch bg-gray-700" />
          <button
            className="flex-1 flex items-center justify-center gap-2 h-9 text-xs text-gray-500
              hover:bg-gray-700/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleGeneratePortrait}
            disabled={generating}
            title="Generate a reference portrait with AI, using the prompt (set in Manage Looks) and any images added below"
          >
            {generating ? '⏳ Generating…' : mainImage ? '🪄 Regenerate' : '🪄 Generate'}
          </button>
        </div>
        {!mainImage && (
          <p className="text-xs text-yellow-600 px-2.5 py-1.5 leading-relaxed">
            No reference image — this character's appearance may drift between panels.
          </p>
        )}
        {genError && <p className="text-xs text-red-400 px-2.5 pb-1.5 leading-relaxed">{genError}</p>}
      </div>

      {/* Reference images fed to the AI when generating this character's look */}
      <div className="border-b border-dashed border-gray-700 p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            className="text-xs px-2 py-1 rounded-md bg-gray-900 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
            onClick={() => setReferencePickerOpen(true)}
          >
            + Add reference
          </button>
          <span className="text-xs text-gray-500 shrink-0">{referenceIds.length}/{MAX_REFERENCE_IMAGES}</span>
        </div>
        {referenceImages.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {referenceImages.map(img => (
              <button
                key={img.id}
                className="relative w-9 h-9 rounded-md overflow-hidden border border-gray-700 shrink-0 bg-gray-950 flex items-center justify-center"
                title={`Remove ${img.label}`}
                onClick={() => toggleReference(img.id)}
              >
                <StoredImage src={img.url} assetId={img.assetId} alt="" className="max-w-full max-h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      <ReferenceImagePicker
        open={referencePickerOpen}
        images={assetImages}
        selectedIds={referenceIds}
        onToggle={toggleReference}
        onClose={() => setReferencePickerOpen(false)}
        maxSelected={MAX_REFERENCE_IMAGES}
      />

      {/* Name row */}
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
        <input
          type="color"
          className="w-6 h-6 rounded-full border-0 cursor-pointer shrink-0 p-0 bg-transparent"
          value={char.color ?? '#8b5cf6'}
          onChange={e => onUpdate({ color: e.target.value })}
          title="Character color"
        />
        <input
          className="flex-1 bg-transparent text-sm text-gray-100 font-semibold outline-none
            border-b border-transparent focus:border-purple-500 transition-colors"
          value={char.name}
          placeholder="Character name"
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <button
          className="text-gray-600 hover:text-red-400 transition-colors text-base leading-none"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {/* Description */}
      <div className="px-2.5 pb-2.5 space-y-2">
        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-400
            resize-none focus:outline-none focus:border-purple-500 transition-colors mt-1"
          rows={2}
          placeholder="Description, traits, appearance…"
          value={char.description ?? ''}
          onChange={e => onUpdate({ description: e.target.value })}
        />
        <button
          className="w-full py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400
            hover:border-purple-500 hover:text-purple-300 transition-colors"
          onClick={onManageLooks}
        >
          🎭 Manage Looks {(char.looks?.length ?? 0) > 0 ? `(${char.looks.length})` : ''} →
        </button>
      </div>
    </div>
  )
}

function CharactersTab() {
  const characters = useComicStore(s => s.characters)
  const { addCharacter, removeCharacter, updateCharacter, openCharacterManager } = useComicStore()

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Characters</span>
        <button
          className="text-xs px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
          onClick={() => addCharacter()}
        >
          + Add
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="text-4xl opacity-20 select-none">👤</span>
          <p className="text-xs text-gray-500">
            No characters yet.<br />Add characters and assign them to panels.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {characters.map(char => (
            <CharacterCard
              key={char.id}
              char={char}
              onUpdate={u => updateCharacter(char.id, u)}
              onRemove={() => removeCharacter(char.id)}
              onManageLooks={() => openCharacterManager(char.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main PropertiesPanel
// ═══════════════════════════════════════════════════════════════

function AssetCard({ image, editable = false, onRename, onRemove, onOpenPanel }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 overflow-hidden">
      <div className="aspect-square bg-gray-800">
        <StoredImage src={image.url || image.imageUrl} assetId={image.assetId || image.imageAssetId} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="p-2 space-y-1.5">
        {editable ? (
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
            value={image.name || ''}
            onChange={e => onRename?.(e.target.value)}
          />
        ) : (
          <div className="text-xs font-medium text-gray-200 truncate" title={image.label}>{image.label}</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{image.source}</span>
          {onOpenPanel && (
            <button className="text-xs text-purple-300 hover:text-purple-200" onClick={onOpenPanel}>
              Open
            </button>
          )}
          {editable && (
            <button className="text-xs text-red-400 hover:text-red-300" onClick={onRemove}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AssetsTab() {
  const pages = useComicStore(s => s.pages)
  const characters = useComicStore(s => s.characters)
  const styleReferences = useComicStore(s => s.styleReferences)
  const projectImages = useComicStore(s => s.projectImages || [])
  const { addProjectImage, removeProjectImage, updateProjectImage, selectPage, selectPanel, setRightSidebarTab } = useComicStore()
  const uploadRef = useRef(null)

  const generatedPanelImages = []
  pages.forEach((page, pageIdx) => {
    page.panels.forEach((panel, panelIdx) => {
      if (panel.imageUrl || panel.imageAssetId) {
        generatedPanelImages.push({
          id: panel.id,
          pageId: page.id,
          panelId: panel.id,
          url: panel.imageUrl,
          assetId: panel.imageAssetId,
          label: `${page.title || `Page ${pageIdx + 1}`} - Panel ${panelIdx + 1}`,
          source: 'Panel',
        })
      }
    })
  })

  const characterImages = characters
    .filter(char => char.imageUrl)
    .map(char => ({ id: char.id, url: char.imageUrl, label: char.name || 'Character', source: 'Character' }))
  const styleImages = styleReferences
    .filter(ref => ref.url)
    .map(ref => ({ id: ref.id, url: ref.url, label: ref.name || 'Style reference', source: 'Style' }))

  const handleUpload = (e) => {
    const files = [...(e.target.files || [])]
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = async ev => {
        const imageAssetId = await putImageAsset({
          dataUrl: ev.target.result,
          source: 'project',
          label: file.name,
        })
        addProjectImage({ name: file.name.replace(/\.[^.]+$/, ''), imageAssetId })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const openPanel = (image) => {
    selectPage(image.pageId)
    selectPanel(image.panelId)
    setRightSidebarTab('properties')
  }

  return (
    <div className="p-3 space-y-4">
      <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Asset Library</span>
        <button
          className="text-xs px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
          onClick={() => uploadRef.current?.click()}
        >
          + Upload
        </button>
      </div>

      <section className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Images</div>
        {projectImages.length === 0 ? (
          <p className="text-xs text-gray-600 leading-relaxed">Upload reusable references here. They appear in panel reference selection.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {projectImages.map(image => (
              <AssetCard
                key={image.id}
                image={{ ...image, source: 'Project' }}
                editable
                onRename={name => updateProjectImage(image.id, { name })}
                onRemove={async () => {
                  await deleteImageAsset(image.imageAssetId)
                  removeProjectImage(image.id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated Panels</div>
        {generatedPanelImages.length === 0 ? (
          <p className="text-xs text-gray-600">No generated panel images yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {generatedPanelImages.map(image => (
              <AssetCard key={image.id} image={image} onOpenPanel={() => openPanel(image)} />
            ))}
          </div>
        )}
      </section>

      {(characterImages.length > 0 || styleImages.length > 0) && (
        <section className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference Images</div>
          <div className="grid grid-cols-2 gap-2">
            {[...characterImages, ...styleImages].map(image => (
              <AssetCard key={`${image.source}:${image.id}`} image={image} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const TABS = [
  { id: 'properties', label: 'Panel' },
  { id: 'style',      label: 'Style' },
  { id: 'characters', label: 'Characters' },
  { id: 'assets',     label: 'Assets' },
]

export default function PropertiesPanel() {
  const rightSidebarTab = useComicStore(s => s.rightSidebarTab)
  const setRightSidebarTab = useComicStore(s => s.setRightSidebarTab)
  const toggleRightSidebar = useComicStore(s => s.toggleRightSidebar)

  return (
    <div className="absolute inset-0 z-30 md:static md:z-auto w-full md:w-72 shrink-0 flex flex-col bg-gray-900 border-l border-gray-700">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-gray-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              rightSidebarTab === tab.id
                ? 'text-purple-300 border-b-2 border-purple-500 bg-gray-800'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setRightSidebarTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button
          className="md:hidden shrink-0 w-9 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          onClick={toggleRightSidebar}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {rightSidebarTab === 'properties' && <PanelTab />}
        {rightSidebarTab === 'style'      && <StyleTab />}
        {rightSidebarTab === 'characters' && <CharactersTab />}
        {rightSidebarTab === 'assets'     && <AssetsTab />}
      </div>
    </div>
  )
}
