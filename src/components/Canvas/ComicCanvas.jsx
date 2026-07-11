import React, { useCallback, useEffect, useRef, useState } from 'react'
import useComicStore from '../../store/useComicStore'
import { BubbleShape } from '../PanelModal/BubbleShapes'
import { getPanelLayout, getPanelPlacement } from '../../utils/defaults'
import PanelImage from '../PanelImage'
import { clampPanelImageOffset, MIN_PANEL_IMAGE_SCALE, MAX_PANEL_IMAGE_SCALE } from '../../utils/panelImageTransform'
import { logEvent, describeTarget } from '../../utils/debugLog'
import { putImageAsset } from '../../utils/imageStore'

// ─── Shared: read a dropped/picked file as a data URL ────────────

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ─── Draggable bubble on the main canvas ─────────────────────────
// Drag → reposition.  Click (no drag) → open modal for that bubble.

function CanvasBubble({ bubble, panelRef, onDragUpdate, onOpenModal }) {
  const dragState = useRef(null)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)

          const handlePointerDown = (e) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.preventDefault()

    const panelEl   = panelRef.current
    const panelRect = panelEl.getBoundingClientRect()
    const panelLeft = panelRect.left + panelEl.clientLeft
    const panelTop  = panelRect.top  + panelEl.clientTop
    const panelW    = panelEl.clientWidth
    const panelH    = panelEl.clientHeight

    dragState.current = {
      grabOffsetX: e.clientX - panelLeft - (bubble.x / 100) * panelW,
      grabOffsetY: e.clientY - panelTop  - (bubble.y / 100) * panelH,
      panelLeft, panelTop, panelW, panelH,
      moved: false,
      historySnapshot: getHistorySnapshot(),
    }

    const onPointerMove = (ev) => {
      if (!dragState.current) return
      if (Math.abs(ev.clientX - e.clientX) > 4 || Math.abs(ev.clientY - e.clientY) > 4)
        dragState.current.moved = true
      if (!dragState.current.moved) return
      const { panelLeft, panelTop, panelW, panelH, grabOffsetX, grabOffsetY } = dragState.current
      onDragUpdate(bubble.id, {
        x: Math.max(0, Math.min(85, ((ev.clientX - panelLeft - grabOffsetX) / panelW) * 100)),
        y: Math.max(0, Math.min(88, ((ev.clientY - panelTop  - grabOffsetY) / panelH) * 100)),
      })
    }

    const onPointerUp = () => {
      if (!dragState.current?.moved) onOpenModal(bubble.id)
      else commitHistorySnapshot(dragState.current.historySnapshot)
      dragState.current = null
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <div
      className="touch-none"
      style={{
        position: 'absolute',
        left:   `${bubble.x}%`,
        top:    `${bubble.y}%`,
        width:  `${bubble.width ?? 35}%`,
        height: bubble.height ? `${bubble.height}%` : undefined,
        cursor: 'grab',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
      title="Drag to move · Click to edit"
      onPointerDown={handlePointerDown}
    >
      <BubbleShape bubble={bubble} />
    </div>
  )
}

// ─── Grid helpers ──────────────────────────────────────────────

function makeTemplate(sizes, count) {
  if (!sizes || sizes.length !== count) return `repeat(${count}, 1fr)`
  return sizes.map(s => `${s}fr`).join(' ')
}

// Positions (% of page div) where divider handles should sit
function dividerPositions(sizes) {
  if (!sizes || sizes.length < 2) return []
  const total = sizes.reduce((a, b) => a + b, 0)
  let cum = 0
  return sizes.slice(0, -1).map(s => { cum += s; return (cum / total) * 100 })
}

function getPlacementStyle(placement) {
  const colSpan = placement.colSpan ?? 1
  const rowSpan = placement.rowSpan ?? 1
  return {
    gridColumn: `${placement.col} / span ${colSpan}`,
    gridRow: `${placement.row} / span ${rowSpan}`,
  }
}

// ─── Panel / row resize handle ───────────────────────────────────

function PanelImageInteractionLayer({ panel, panelRef, onSelect }) {
  const layerRef = useRef(null)
  const dragRef = useRef(null)
  const wheelSnapshotRef = useRef(null)
  const wheelTimerRef = useRef(null)
  const updatePanelLive = useComicStore(s => s.updatePanelLive)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)

  const commitWheelZoom = useCallback(() => {
    if (wheelTimerRef.current) {
      clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = null
    }
    if (!wheelSnapshotRef.current) return
    commitHistorySnapshot(wheelSnapshotRef.current)
    wheelSnapshotRef.current = null
  }, [commitHistorySnapshot])

  useEffect(() => {
    return () => {
      commitWheelZoom()
    }
  }, [commitWheelZoom])

  // React attaches its onWheel prop as a passive listener, so e.preventDefault()
  // there silently fails and the outer canvas scrolls while the image zooms.
  // Attach a native, non-passive listener instead so zoom doesn't leak into scroll.
  useEffect(() => {
    const el = layerRef.current
    logEvent('canvas:layer-effect-mount', {
      panelId: panel.id,
      layerFound: Boolean(el),
      computedPointerEvents: el ? getComputedStyle(el).pointerEvents : null,
      computedZIndex: el ? getComputedStyle(el).zIndex : null,
    })
    if (!el) return undefined

    const handleWheel = (e) => {
      logEvent('canvas:wheel-handler-fired', { panelId: panel.id, deltaY: e.deltaY, target: describeTarget(e.target) })
      e.preventDefault()
      e.stopPropagation()
      onSelect(panel.id)

      if (!wheelSnapshotRef.current) wheelSnapshotRef.current = getHistorySnapshot()
      const currentScale = Number.isFinite(panel.imageScale) ? panel.imageScale : 1
      const nextScale = Math.max(MIN_PANEL_IMAGE_SCALE, Math.min(MAX_PANEL_IMAGE_SCALE, currentScale * (e.deltaY < 0 ? 1.08 : 0.92)))

      const rect = panelRef.current?.getBoundingClientRect()
      const imgEl = panelRef.current?.querySelector('img')
      const clamped = clampPanelImageOffset({
        frameWidth: rect?.width,
        frameHeight: rect?.height,
        naturalWidth: imgEl?.naturalWidth,
        naturalHeight: imgEl?.naturalHeight,
        scale: nextScale,
        offsetX: panel.imageOffsetX ?? 0,
        offsetY: panel.imageOffsetY ?? 0,
      })

      logEvent('canvas:wheel-computed', {
        panelId: panel.id, currentScale, nextScale, clamped,
        imgFound: Boolean(imgEl), natural: imgEl ? { w: imgEl.naturalWidth, h: imgEl.naturalHeight } : null,
        frame: rect ? { w: rect.width, h: rect.height } : null,
      })

      updatePanelLive(panel.id, {
        imageScale: Number(nextScale.toFixed(3)),
        imageOffsetX: clamped.offsetX,
        imageOffsetY: clamped.offsetY,
      })
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(commitWheelZoom, 350)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [commitWheelZoom, getHistorySnapshot, onSelect, panel.id, panel.imageScale, panel.imageOffsetX, panel.imageOffsetY, updatePanelLive])

  // Pointer Events (not plain mouse events) so a single handler covers
  // mouse AND touch drags. This layer previously used mouse events; that
  // wasn't what caused the pan/zoom bug (a ResizeObserver timing issue in
  // PanelImage, fixed separately) — the real hazard is that sibling
  // buttons (zoom controls, replace-image) must stop propagation of
  // pointerdown too, not just mousedown, or their taps would also start a
  // drag here. See the onPointerDown={e => e.stopPropagation()} guards below.
  const handlePointerDown = (e) => {
    logEvent('canvas:layer-pointerdown-fired', { panelId: panel.id, button: e.button, x: e.clientX, y: e.clientY, target: describeTarget(e.target) })
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    commitWheelZoom()
    onSelect(panel.id)

    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) {
      logEvent('canvas:layer-pointerdown-abort-no-rect', { panelId: panel.id })
      return
    }
    const imgEl = panelRef.current?.querySelector('img')
    logEvent('canvas:layer-pointerdown-start', {
      panelId: panel.id, rect: { w: rect.width, h: rect.height },
      imgFound: Boolean(imgEl), natural: imgEl ? { w: imgEl.naturalWidth, h: imgEl.naturalHeight } : null,
    })

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: panel.imageOffsetX ?? 0,
      startOffsetY: panel.imageOffsetY ?? 0,
      width: rect.width,
      height: rect.height,
      naturalWidth: imgEl?.naturalWidth,
      naturalHeight: imgEl?.naturalHeight,
      scale: Number.isFinite(panel.imageScale) ? panel.imageScale : 1,
      moved: false,
      historySnapshot: getHistorySnapshot(),
    }

    const onPointerMove = (ev) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const wasMoved = dragRef.current.moved
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true
      if (!wasMoved && dragRef.current.moved) {
        logEvent('canvas:layer-drag-threshold-crossed', { panelId: panel.id, dx, dy })
      }
      if (!dragRef.current.moved) return
      const clamped = clampPanelImageOffset({
        frameWidth: dragRef.current.width,
        frameHeight: dragRef.current.height,
        naturalWidth: dragRef.current.naturalWidth,
        naturalHeight: dragRef.current.naturalHeight,
        scale: dragRef.current.scale,
        offsetX: dragRef.current.startOffsetX + (dx / dragRef.current.width) * 100,
        offsetY: dragRef.current.startOffsetY + (dy / dragRef.current.height) * 100,
      })
      updatePanelLive(panel.id, {
        imageOffsetX: clamped.offsetX,
        imageOffsetY: clamped.offsetY,
      })
    }

    const onPointerUp = () => {
      const drag = dragRef.current
      logEvent('canvas:layer-pointerup', { panelId: panel.id, moved: drag?.moved ?? false })
      if (drag?.moved) commitHistorySnapshot(drag.historySnapshot)
      dragRef.current = null
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <div
      ref={layerRef}
      data-no-export
      className="absolute inset-0 touch-none"
      style={{ zIndex: 1, cursor: 'grab' }}
      title="Drag to reframe - Scroll to zoom"
      onPointerDown={handlePointerDown}
    />
  )
}

// ─── Visible zoom controls (discoverable alternative to scroll-to-zoom) ──

function PanelZoomControls({ panel, panelRef, onSelect }) {
  const updatePanel = useComicStore(s => s.updatePanel)

  const applyZoom = (factor) => {
    logEvent('canvas:zoom-button-click', { panelId: panel.id, factor })
    onSelect(panel.id)
    const rect = panelRef.current?.getBoundingClientRect()
    const imgEl = panelRef.current?.querySelector('img')
    const currentScale = Number.isFinite(panel.imageScale) ? panel.imageScale : 1
    const nextScale = Math.max(MIN_PANEL_IMAGE_SCALE, Math.min(MAX_PANEL_IMAGE_SCALE, currentScale * factor))
    const clamped = clampPanelImageOffset({
      frameWidth: rect?.width,
      frameHeight: rect?.height,
      naturalWidth: imgEl?.naturalWidth,
      naturalHeight: imgEl?.naturalHeight,
      scale: nextScale,
      offsetX: panel.imageOffsetX ?? 0,
      offsetY: panel.imageOffsetY ?? 0,
    })
    logEvent('canvas:zoom-computed', {
      panelId: panel.id, currentScale, nextScale, clamped,
      rectFound: Boolean(rect), imgFound: Boolean(imgEl),
      rect: rect ? { w: rect.width, h: rect.height } : null,
      natural: imgEl ? { w: imgEl.naturalWidth, h: imgEl.naturalHeight } : null,
    })
    updatePanel(panel.id, {
      imageScale: Number(nextScale.toFixed(3)),
      imageOffsetX: clamped.offsetX,
      imageOffsetY: clamped.offsetY,
    })
    const after = useComicStore.getState().pages.flatMap(p => p.panels).find(p => p.id === panel.id)
    logEvent('canvas:zoom-readback', {
      panelId: panel.id,
      storedScale: after?.imageScale, storedOffsetX: after?.imageOffsetX, storedOffsetY: after?.imageOffsetY,
    })
  }

  const resetView = () => {
    logEvent('canvas:reset-button-click', { panelId: panel.id })
    onSelect(panel.id)
    updatePanel(panel.id, { imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })
  }

  return (
    <div
      data-no-export
      className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1 py-1"
      style={{ zIndex: 4 }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        title="Zoom out"
        className="w-5 h-5 flex items-center justify-center text-white text-xs leading-none rounded hover:bg-white/20"
        onClick={() => applyZoom(1 / 1.2)}
      >
        −
      </button>
      <button
        type="button"
        title="Reset pan & zoom"
        className="w-5 h-5 flex items-center justify-center text-white text-xs leading-none rounded hover:bg-white/20"
        onClick={resetView}
      >
        ⟲
      </button>
      <button
        type="button"
        title="Zoom in"
        className="w-5 h-5 flex items-center justify-center text-white text-xs leading-none rounded hover:bg-white/20"
        onClick={() => applyZoom(1.2)}
      >
        +
      </button>
    </div>
  )
}

function ResizeHandle({ direction, position, idx, sizes, pageId, pageRef }) {
  const updatePageLive = useComicStore(s => s.updatePageLive)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)
  const isCol = direction === 'col'

  const handlePointerDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect       = pageRef.current.getBoundingClientRect()
    const pad        = 10
    const totalPx    = (isCol ? rect.width : rect.height) - pad * 2
    const startMouse = isCol ? e.clientX : e.clientY
    const startSizes = [...sizes]
    const totalFr    = startSizes.reduce((a, b) => a + b, 0)
    const pairTotal  = startSizes[idx] + startSizes[idx + 1]
    const minFr      = pairTotal * 0.08
    const historySnapshot = getHistorySnapshot()

    const onMove = (ev) => {
      const dFr = ((isCol ? ev.clientX : ev.clientY) - startMouse) / totalPx * totalFr
      const newSizes = [...startSizes]
      newSizes[idx]     = Math.max(minFr, Math.min(pairTotal - minFr, startSizes[idx] + dFr))
      newSizes[idx + 1] = pairTotal - newSizes[idx]
      updatePageLive(pageId, isCol ? { colSizes: newSizes } : { rowSizes: newSizes })
    }
    const onUp = () => {
      commitHistorySnapshot(historySnapshot)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      data-no-export
      className={`absolute z-20 group touch-none ${isCol ? 'cursor-col-resize' : 'cursor-row-resize'}`}
      style={
        isCol
          ? { left: `${position}%`, top: 0, bottom: 0, width: 14, transform: 'translateX(-50%)' }
          : { top: `${position}%`, left: 0, right: 0, height: 14, transform: 'translateY(-50%)' }
      }
      onPointerDown={handlePointerDown}
    >
      <div className={`bg-purple-400 opacity-0 group-hover:opacity-90 transition-opacity duration-100
        ${isCol ? 'w-0.5 h-full mx-auto' : 'h-0.5 w-full my-auto'}`}
      />
      {/* Grip pill */}
      <div className={`absolute bg-purple-500 rounded-full
        opacity-0 group-hover:opacity-100 transition-opacity
        ${isCol
          ? 'w-1.5 h-7 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
          : 'h-1.5 w-7 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}`}
      />
    </div>
  )
}

// ─── Single panel ──────────────────────────────────────────────

function ComicPanel({ panel, idx, placement, isSelected, onSelect, onBubbleClick, onBubbleDrag }) {
  const panelRef = useRef(null)
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const updatePanel = useComicStore(s => s.updatePanel)
  const hasImage = Boolean(panel.imageUrl || panel.imageAssetId)

  useEffect(() => {
    logEvent('canvas:panel-mount', {
      panelId: panel.id, idx, hasImage,
      hasImageUrl: Boolean(panel.imageUrl), hasImageAssetId: Boolean(panel.imageAssetId),
      bubbleCount: panel.bubbles?.length ?? 0,
    })
  }, [panel.id, hasImage])

  const applyImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await readImageFileAsDataUrl(file)
    const imageAssetId = await putImageAsset({ dataUrl, source: 'panel', label: `${panel.id} uploaded image` })
    updatePanel(panel.id, {
      imageUrl: null,
      imageAssetId,
      imageOffsetX: 0,
      imageOffsetY: 0,
      imageScale: 1,
      geminiInteractionId: null,
    })
  }

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsDragOver(false)
  }
  const handleDrop = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setIsDragOver(false)
    onSelect(panel.id)
    applyImageFile([...e.dataTransfer.files].find(f => f.type.startsWith('image/')))
  }

  return (
    <div
      ref={panelRef}
      data-comic-panel
      className="relative overflow-hidden"
      style={{
        background: hasImage ? '#111' : '#f8f8f8',
        border: isSelected ? '2px solid #8b5cf6' : '2px solid #1f2937',
        boxShadow: isSelected ? '0 0 0 2px #8b5cf6aa' : 'none',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
        ...getPlacementStyle(placement),
      }}
      onMouseDown={e => { if (e.button === 0) onSelect(panel.id) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {hasImage && (
        <PanelImage
          src={panel.imageUrl}
          assetId={panel.imageAssetId}
          offsetX={panel.imageOffsetX ?? 0}
          offsetY={panel.imageOffsetY ?? 0}
          scale={panel.imageScale ?? 1}
        />
      )}

      {hasImage && (
        <PanelImageInteractionLayer
          panel={panel}
          panelRef={panelRef}
          onSelect={onSelect}
        />
      )}

      {hasImage && (
        <PanelZoomControls
          panel={panel}
          panelRef={panelRef}
          onSelect={onSelect}
        />
      )}

      {/* No-image: prompt text or placeholder */}
      {!hasImage && (
        <div className="absolute inset-0 flex flex-col pointer-events-none">
          <span className="absolute top-1.5 left-2 text-xs font-bold" style={{ color: '#9ca3af' }}>{idx + 1}</span>
          {panel.perspective && panel.perspective !== 'medium-shot' && (
            <span className="absolute top-1.5 right-2 text-xs px-1.5 py-0.5 rounded capitalize"
              style={{ background: '#ede9fe', color: '#7c3aed' }}>
              {panel.perspective.replace(/-/g, ' ')}
            </span>
          )}
          <div className="flex-1 flex items-center justify-center px-4 py-6">
            {panel.prompt
              ? <p className="text-xs text-center text-gray-500 leading-relaxed"
                  style={{ display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {panel.prompt}
                </p>
              : <div className="text-center">
                  <div className="text-3xl opacity-10 mb-1">▭</div>
                  <p className="text-xs" style={{ color: '#d1d5db' }}>Click to edit</p>
                </div>}
          </div>
        </div>
      )}

      {/* Panel # badge over image */}
      {hasImage && (
        <span className="absolute top-1.5 left-2 text-xs font-bold px-1.5 py-0.5 rounded select-none"
          data-no-export
          style={{ color: '#fff', background: 'rgba(0,0,0,0.50)', zIndex: 2, pointerEvents: 'none' }}>
          {idx + 1}
        </span>
      )}

      {/* Hidden file input backing the replace/add-image button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          applyImageFile(file)
          e.target.value = ''
        }}
      />

      {/* Add/replace image — same target as drag-and-drop */}
      <button
        type="button"
        data-no-export
        title={hasImage ? 'Replace image' : 'Add image'}
        className="absolute bottom-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded-md
          bg-black/60 text-white text-xs hover:bg-black/80 transition-colors"
        style={{ zIndex: 4 }}
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onSelect(panel.id); fileInputRef.current?.click() }}
      >
        📁
      </button>

      {/* Drag-over indicator */}
      {isDragOver && (
        <div
          data-no-export
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 6,
            pointerEvents: 'none',
            background: 'rgba(139, 92, 246, 0.25)',
            border: '2px dashed #a78bfa',
          }}
        >
          <span className="text-xs font-semibold px-2 py-1 rounded bg-black/70 text-white">
            Drop to {hasImage ? 'replace' : 'add'} image
          </span>
        </div>
      )}

      {/* Bubble overlays: drag to move, click to open modal */}
      {panel.bubbles?.length > 0 && (
        <div data-bubble-layer style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
          {panel.bubbles.map(bubble => (
            <CanvasBubble
              key={bubble.id}
              bubble={bubble}
              panelRef={panelRef}
              onDragUpdate={(bubbleId, updates) => onBubbleDrag(panel.id, bubbleId, updates)}
              onOpenModal={(bubbleId) => onBubbleClick(panel.id, bubbleId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ComicCanvas ──────────────────────────────────────────────

export default function ComicCanvas() {
  const pages              = useComicStore(s => s.pages)
  const selectedPageId     = useComicStore(s => s.selectedPageId)
  const selectedPanelId    = useComicStore(s => s.selectedPanelId)
  const selectPanel        = useComicStore(s => s.selectPanel)
  const openPanelEditModal = useComicStore(s => s.openPanelEditModal)
  const updatePanel        = useComicStore(s => s.updatePanel)
  const updateBubble       = useComicStore(s => s.updateBubble)
  const updateBubbleLive   = useComicStore(s => s.updateBubbleLive)

  const pageRef = useRef(null)
  const page = pages.find(p => p.id === selectedPageId) ?? pages[0] ?? null

  if (!page) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-800">
        <p className="text-sm text-gray-500">No pages yet — click + in the Pages sidebar.</p>
      </div>
    )
  }

  const layout = getPanelLayout(page.panelCount, page.layoutId)
  const { cols, rows } = layout
  const colSizes    = page.colSizes?.length === cols ? page.colSizes : Array(cols).fill(1)
  const rowSizes    = page.rowSizes?.length === rows ? page.rowSizes : Array(rows).fill(1)
  const colDividers = dividerPositions(colSizes)
  const rowDividers = dividerPositions(rowSizes)

  return (
    <div
      className="flex-1 overflow-auto bg-gray-800 flex items-start justify-center py-8"
      onClick={e => { if (e.target === e.currentTarget) selectPanel(null) }}
    >
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="text-xs text-gray-500 font-medium tracking-wide select-none">{page.title}</div>

        {/* The comic page */}
        <div
          ref={pageRef}
          data-comic-page
          className="relative shadow-2xl shrink-0"
          onMouseDown={e => {
            if (e.target === e.currentTarget) selectPanel(null)
          }}
          style={{
            width: 620, height: 877,
            background: 'white',
            padding: 10,
            display: 'grid',
            gap: 6,
            gridTemplateColumns: makeTemplate(colSizes, cols),
            gridTemplateRows:    makeTemplate(rowSizes, rows),
          }}
        >
          {page.panels.map((panel, idx) => (
            <ComicPanel
              key={panel.id}
              panel={panel}
              idx={idx}
              placement={getPanelPlacement(page.panelCount, page.layoutId, idx)}
              isSelected={selectedPanelId === panel.id}
              onSelect={selectPanel}
              onBubbleDrag={(panelId, bubbleId, updates) => updateBubbleLive(panelId, bubbleId, updates)}
              onBubbleClick={(panelId, bubbleId) => {
                selectPanel(panelId)
                openPanelEditModal(panelId, bubbleId)
              }}
            />
          ))}

          {/* Column resize handles */}
          {cols > 1 && colDividers.map((pos, i) => (
            <ResizeHandle key={`col-${i}`} direction="col" position={pos} idx={i}
              sizes={colSizes} pageId={page.id} pageRef={pageRef} />
          ))}

          {/* Row resize handles */}
          {rows > 1 && rowDividers.map((pos, i) => (
            <ResizeHandle key={`row-${i}`} direction="row" position={pos} idx={i}
              sizes={rowSizes} pageId={page.id} pageRef={pageRef} />
          ))}
        </div>

        {(cols > 1 || rows > 1 || page.panels.some(panel => panel.imageUrl || panel.imageAssetId)) && (
          <p className="text-xs text-gray-600 select-none">
            Hover between panels to resize · Drag image to reframe
            <br />
            Scroll or use the +/− buttons to zoom
          </p>
        )}
      </div>
    </div>
  )
}
