import React, { useCallback, useEffect, useRef, useState } from 'react'
import useComicStore from '../../store/useComicStore'
import { BUBBLE_STYLE_PRESETS, PERSPECTIVES, getGridDims, getPanelPlacement, uid } from '../../utils/defaults'
import { BubbleShape, getBubblePresetDefaults, getBubbleTailBasePoint } from './BubbleShapes'
import PanelImage from '../PanelImage'
import { clampPanelImageOffset, MIN_PANEL_IMAGE_SCALE, MAX_PANEL_IMAGE_SCALE } from '../../utils/panelImageTransform'
import { logEvent, describeTarget } from '../../utils/debugLog'

const PAGE_INNER_W = 600
const PAGE_INNER_H = 857
const PANEL_GAP = 6
const STYLE_DEFAULTS_KEY = 'comic-bubble-style-defaults'
const DEFAULT_STYLE_KEY = 'comic-default-bubble-style'

const QUICK_BUBBLE_COLORS = [
  '#ffffff', '#111111', '#f8fafc', '#fde047',
  '#fca5a5', '#fbcfe8', '#e9d5ff', '#bae6fd',
  '#bbf7d0', '#fdba74',
]

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function applyBubbleStyle(style) {
  const preset = getBubblePresetDefaults(style)
  return {
    style,
    type: preset.type,
    tail: { ...preset.tail },
    typography: { ...preset.typography },
    appearance: { ...preset.appearance },
  }
}

function mergeStyleData(base, custom = {}) {
  return {
    ...base,
    ...custom,
    tail: { ...(base.tail || {}), ...(custom.tail || {}) },
    typography: { ...(base.typography || {}), ...(custom.typography || {}) },
    appearance: { ...(base.appearance || {}), ...(custom.appearance || {}) },
  }
}

function extractBubbleStyle(bubble) {
  const style = getStyleFromBubble(bubble)
  return {
    style,
    type: bubble.type,
    width: bubble.width,
    height: bubble.height,
    tail: deepClone(bubble.tail || {}),
    typography: deepClone(bubble.typography || {}),
    appearance: deepClone(bubble.appearance || {}),
  }
}

function loadStyleDefaults() {
  try {
    return JSON.parse(localStorage.getItem(STYLE_DEFAULTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadDefaultStyle() {
  return localStorage.getItem(DEFAULT_STYLE_KEY) || 'classic-comic'
}

function patchNested(obj, key, updates) {
  return { [key]: { ...(obj[key] || {}), ...updates } }
}

function getStyleFromBubble(bubble) {
  if (bubble.style) return bubble.style
  return {
    speech: 'classic-comic',
    thought: 'thought-soft',
    shout: 'shout-burst',
    whisper: 'whisper-dashed',
    caption: 'caption-box',
    narration: 'narration-box',
    sfx: 'sfx-impact',
  }[bubble.type] || 'classic-comic'
}

function getPanelPreviewSize(page, panelIdx) {
  const { cols, rows } = getGridDims(page.panelCount, page.layoutId)
  const colSizes = page.colSizes?.length === cols ? page.colSizes : Array(cols).fill(1)
  const rowSizes = page.rowSizes?.length === rows ? page.rowSizes : Array(rows).fill(1)
  const placement = getPanelPlacement(page.panelCount, page.layoutId, panelIdx)
  const colSpan = placement.colSpan ?? 1
  const rowSpan = placement.rowSpan ?? 1
  const colTotal = colSizes.reduce((sum, value) => sum + value, 0)
  const rowTotal = rowSizes.reduce((sum, value) => sum + value, 0)
  const colFr = colSizes.slice(placement.col - 1, placement.col - 1 + colSpan).reduce((sum, value) => sum + value, 0)
  const rowFr = rowSizes.slice(placement.row - 1, placement.row - 1 + rowSpan).reduce((sum, value) => sum + value, 0)
  const width = (colFr / colTotal) * (PAGE_INNER_W - (cols - 1) * PANEL_GAP) + (colSpan - 1) * PANEL_GAP
  const height = (rowFr / rowTotal) * (PAGE_INNER_H - (rows - 1) * PANEL_GAP) + (rowSpan - 1) * PANEL_GAP
  return { width, height }
}

function supportsBubbleTail(bubble) {
  const noTailStyles = ['caption-box', 'narration-box', 'shout-burst', 'whisper-dashed', 'sfx-impact']
  return !noTailStyles.includes(getStyleFromBubble(bubble))
}

function getTailBaseHandle(bubble = {}) {
  const tail = bubble.tail || {}
  if (Number.isFinite(tail.baseX) && Number.isFinite(tail.baseY)) {
    return { x: tail.baseX, y: tail.baseY, automatic: false }
  }
  const [x, y] = getBubbleTailBasePoint(bubble)
  return {
    x,
    y,
    automatic: true,
  }
}

function DraggableBubble({ bubble, isSelected, onSelect, onMove, onTailUpdate, onResize, onDelete }) {
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)

  const handlePointerDown = useCallback((e) => {
    e.stopPropagation()
    onSelect(bubble.id)

    const panelEl = e.currentTarget.closest('[data-panel-canvas]')
    if (!panelEl) return

    const panelRect = panelEl.getBoundingClientRect()
    const panelLeft = panelRect.left + panelEl.clientLeft
    const panelTop = panelRect.top + panelEl.clientTop
    const panelW = panelEl.clientWidth
    const panelH = panelEl.clientHeight
    const grabOffsetX = e.clientX - panelLeft - (bubble.x / 100) * panelW
    const grabOffsetY = e.clientY - panelTop - (bubble.y / 100) * panelH
    const historySnapshot = getHistorySnapshot()

    const onPointerMove = (ev) => {
      const newX = ((ev.clientX - panelLeft - grabOffsetX) / panelW) * 100
      const newY = ((ev.clientY - panelTop - grabOffsetY) / panelH) * 100
      onMove(bubble.id, {
        x: Math.max(0, Math.min(85, newX)),
        y: Math.max(0, Math.min(88, newY)),
      })
    }

    const onPointerUp = () => {
      commitHistorySnapshot(historySnapshot)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }, [bubble.id, bubble.x, bubble.y, commitHistorySnapshot, getHistorySnapshot, onSelect, onMove])

  const handleTailPointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(bubble.id)

    const bubbleEl = e.currentTarget.parentElement
    const rect = bubbleEl.getBoundingClientRect()
    const historySnapshot = getHistorySnapshot()

    const updateTarget = (ev) => {
      onTailUpdate(bubble.id, {
        tail: {
          ...(bubble.tail || {}),
          targetX: Math.max(-80, Math.min(180, ((ev.clientX - rect.left) / rect.width) * 100)),
          targetY: Math.max(-80, Math.min(180, ((ev.clientY - rect.top) / rect.height) * 100)),
        },
      })
    }

    const onPointerUp = () => {
      commitHistorySnapshot(historySnapshot)
      document.removeEventListener('pointermove', updateTarget)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', updateTarget)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }, [bubble.id, bubble.tail, commitHistorySnapshot, getHistorySnapshot, onSelect, onTailUpdate])

  const handleBasePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(bubble.id)

    const bubbleEl = e.currentTarget.parentElement
    const rect = bubbleEl.getBoundingClientRect()
    const historySnapshot = getHistorySnapshot()

    const updateBase = (ev) => {
      onTailUpdate(bubble.id, {
        tail: {
          ...(bubble.tail || {}),
          baseX: Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)),
          baseY: Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)),
        },
      })
    }

    const onPointerUp = () => {
      commitHistorySnapshot(historySnapshot)
      document.removeEventListener('pointermove', updateBase)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', updateBase)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }, [bubble.id, bubble.tail, commitHistorySnapshot, getHistorySnapshot, onSelect, onTailUpdate])

  const handleResizePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(bubble.id)

    const panelEl = e.currentTarget.closest('[data-panel-canvas]')
    if (!panelEl) return

    const panelRect = panelEl.getBoundingClientRect()
    const panelLeft = panelRect.left + panelEl.clientLeft
    const panelTop = panelRect.top + panelEl.clientTop
    const panelW = panelEl.clientWidth
    const panelH = panelEl.clientHeight
    const startWidth = bubble.width ?? 35
    const startHeight = bubble.height ?? Math.max(8, (e.currentTarget.parentElement.getBoundingClientRect().height / panelH) * 100)
    const startFontSize = bubble.typography?.fontSize ?? 13
    const fontSizeLocked = bubble.typography?.fontSizeLocked === true
    const historySnapshot = getHistorySnapshot()

    const onPointerMove = (ev) => {
      const rightEdgePct = ((ev.clientX - panelLeft) / panelW) * 100
      const bottomEdgePct = ((ev.clientY - panelTop) / panelH) * 100
      const nextWidth = Math.max(10, Math.min(95 - (bubble.x ?? 0), rightEdgePct - (bubble.x ?? 0)))
      const nextHeight = Math.max(5, Math.min(95 - (bubble.y ?? 0), bottomEdgePct - (bubble.y ?? 0)))
      const updates = { width: nextWidth, height: nextHeight }
      if (!fontSizeLocked) {
        const ratio = Math.sqrt((nextWidth / startWidth) * (nextHeight / startHeight))
        updates.typography = {
          ...(bubble.typography || {}),
          fontSize: Math.max(8, Math.min(32, Math.round(startFontSize * ratio))),
          fontSizeLocked: false,
        }
      }
      onResize(bubble.id, updates)
    }

    const onPointerUp = () => {
      commitHistorySnapshot(historySnapshot)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }, [bubble.height, bubble.id, bubble.typography, bubble.width, bubble.x, bubble.y, commitHistorySnapshot, getHistorySnapshot, onResize, onSelect])

  const tail = bubble.tail || {}
  const showTailHandle = isSelected && supportsBubbleTail(bubble) && tail.enabled !== false
  const baseHandle = getTailBaseHandle(bubble)

  return (
    <div
      className="touch-none"
      style={{
        position: 'absolute',
        left: `${bubble.x}%`,
        top: `${bubble.y}%`,
        width: `${bubble.width ?? 35}%`,
        height: bubble.height ? `${bubble.height}%` : undefined,
        cursor: 'grab',
        userSelect: 'none',
        zIndex: isSelected ? 10 : 5,
        outline: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
        outlineOffset: 3,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
      onPointerDown={handlePointerDown}
    >
      <BubbleShape bubble={bubble} />
      {showTailHandle && (
        <>
          <div
            className="absolute w-3 h-3 rounded-full bg-sky-400 border-2 border-white shadow cursor-crosshair touch-none"
            style={{
              left: `${baseHandle.x}%`,
              top: `${baseHandle.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
            }}
            title={baseHandle.automatic ? 'Drag tail base (auto)' : 'Drag tail base'}
            onPointerDown={handleBasePointerDown}
          />
          <div
            className="absolute w-3 h-3 rounded-full bg-purple-400 border-2 border-white shadow cursor-crosshair touch-none"
            style={{
              left: `${tail.targetX ?? 18}%`,
              top: `${tail.targetY ?? 94}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
            }}
            title="Drag tail target"
            onPointerDown={handleTailPointerDown}
          />
        </>
      )}
      {isSelected && (
        <div
          className="absolute w-3.5 h-3.5 bg-purple-500 border-2 border-white shadow cursor-nwse-resize touch-none"
          style={{
            right: -7,
            bottom: -7,
            zIndex: 21,
          }}
          title="Drag to resize bubble"
          onPointerDown={handleResizePointerDown}
        />
      )}
      {isSelected && (
        <button
          type="button"
          className="absolute w-5 h-5 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500 border-2 border-white shadow text-white text-xs leading-none transition-colors"
          style={{
            right: -9,
            top: -9,
            zIndex: 21,
          }}
          title="Delete bubble"
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(bubble.id) }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function PanelImageInteractionLayer({ panel, canvasRef, onClickPoint }) {
  const layerRef = useRef(null)
  const dragRef = useRef(null)
  const wheelSnapshotRef = useRef(null)
  const wheelTimerRef = useRef(null)
  const updatePanelLive = useComicStore(s => s.updatePanelLive)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    }
  }, [])

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
    const wheelTarget = canvasRef.current
    logEvent('modal:layer-effect-mount', {
      panelId: panel.id,
      canvasFound: Boolean(wheelTarget),
    })
    if (!wheelTarget) return undefined

    const handleWheel = (e) => {
      if (e.target?.closest?.('input, textarea, select, button')) return
      logEvent('modal:wheel-handler-fired', { panelId: panel.id, deltaY: e.deltaY, target: describeTarget(e.target) })
      e.preventDefault()
      e.stopPropagation()
      if (!wheelSnapshotRef.current) wheelSnapshotRef.current = getHistorySnapshot()
      const currentScale = Number.isFinite(panel.imageScale) ? panel.imageScale : 1
      const nextScale = Math.max(MIN_PANEL_IMAGE_SCALE, Math.min(MAX_PANEL_IMAGE_SCALE, currentScale * (e.deltaY < 0 ? 1.08 : 0.92)))

      const rect = canvasRef.current?.getBoundingClientRect()
      const imgEl = canvasRef.current?.querySelector('img')
      const clamped = clampPanelImageOffset({
        frameWidth: rect?.width,
        frameHeight: rect?.height,
        naturalWidth: imgEl?.naturalWidth,
        naturalHeight: imgEl?.naturalHeight,
        scale: nextScale,
        offsetX: panel.imageOffsetX ?? 0,
        offsetY: panel.imageOffsetY ?? 0,
      })

      updatePanelLive(panel.id, {
        imageScale: Number(nextScale.toFixed(3)),
        imageOffsetX: clamped.offsetX,
        imageOffsetY: clamped.offsetY,
      })
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(commitWheelZoom, 350)
    }

    wheelTarget.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => wheelTarget.removeEventListener('wheel', handleWheel, true)
  }, [canvasRef, commitWheelZoom, getHistorySnapshot, panel.id, panel.imageScale, panel.imageOffsetX, panel.imageOffsetY, updatePanelLive])

  // Pointer Events (not plain mouse events) so this works with touch drags
  // too. This layer previously used mouse events; that wasn't what caused
  // the pan/zoom bug (a ResizeObserver timing issue in PanelImage, fixed
  // separately) — the real hazard is that sibling buttons (zoom controls)
  // must stop propagation of pointerdown too, not just mousedown, or their
  // taps would also start a drag here. See the guards in
  // PanelImageZoomControls below.
  const handlePointerDown = (e) => {
    logEvent('modal:layer-pointerdown-fired', { panelId: panel.id, button: e.button, x: e.clientX, y: e.clientY, target: describeTarget(e.target) })
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    commitWheelZoom()

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      logEvent('modal:layer-pointerdown-abort-no-rect', { panelId: panel.id })
      return
    }
    const imgEl = canvasRef.current?.querySelector('img')
    logEvent('modal:layer-pointerdown-start', {
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
        logEvent('modal:layer-drag-threshold-crossed', { panelId: panel.id, dx, dy })
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

    const onPointerUp = (ev) => {
      const drag = dragRef.current
      logEvent('modal:layer-pointerup', { panelId: panel.id, moved: drag?.moved ?? false })
      if (drag?.moved) commitHistorySnapshot(drag.historySnapshot)
      else onClickPoint(ev.clientX, ev.clientY)
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
      className="absolute inset-0 touch-none"
      style={{ zIndex: 1, cursor: 'grab' }}
      title="Drag to reframe - Wheel to zoom - Click to place bubble"
      onPointerDown={handlePointerDown}
    />
  )
}

// ─── Visible zoom controls (discoverable alternative to scroll-to-zoom) ──

function PanelImageZoomControls({ panel, canvasRef }) {
  const updatePanel = useComicStore(s => s.updatePanel)

  const applyZoom = (factor) => {
    logEvent('modal:zoom-button-click', { panelId: panel.id, factor })
    const rect = canvasRef.current?.getBoundingClientRect()
    const imgEl = canvasRef.current?.querySelector('img')
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
    updatePanel(panel.id, {
      imageScale: Number(nextScale.toFixed(3)),
      imageOffsetX: clamped.offsetX,
      imageOffsetY: clamped.offsetY,
    })
  }

  const resetView = () => {
    logEvent('modal:reset-button-click', { panelId: panel.id })
    updatePanel(panel.id, { imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })
  }

  return (
    <div
      className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1 py-1"
      style={{ zIndex: 6 }}
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

function ToggleButton({ active, title, children, onClick, className = '' }) {
  return (
    <button
      className={`text-xs rounded border py-1 transition-colors ${className} ${
        active
          ? 'border-purple-500 bg-purple-950 text-purple-200'
          : 'border-gray-700 text-gray-500 hover:text-gray-300'
      }`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function BubbleRow({ bubble, idx, isSelected, onSelect, onUpdate, onRemove, onDuplicate, makeBubbleStyle }) {
  const style = getStyleFromBubble(bubble)
  const noTailStyles = ['caption-box', 'narration-box', 'shout-burst', 'whisper-dashed', 'sfx-impact']
  const supportsTail = !noTailStyles.includes(style)
  const typography = {
    fontSize: 13,
    weight: 800,
    uppercase: true,
    italic: false,
    align: 'center',
    fontSizeLocked: false,
    ...(bubble.typography || {}),
  }
  const appearance = {
    fill: '#ffffff',
    stroke: '#111111',
    strokeWidth: 3,
    ...(bubble.appearance || {}),
  }
  const tail = {
    enabled: supportsTail,
    side: 'bottom-left',
    targetX: 18,
    targetY: 94,
    bend: -10,
    baseWidth: 16,
    ...(bubble.tail || {}),
  }
  const baseHandle = getTailBaseHandle({ ...bubble, tail })

  return (
    <div
      className={`rounded-lg border p-2.5 space-y-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-purple-500 bg-purple-950/20'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
      }`}
      onClick={() => onSelect(bubble.id)}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-mono shrink-0">#{idx + 1}</span>
        <select
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
          value={style}
          onChange={e => onUpdate(bubble.id, makeBubbleStyle(e.target.value))}
          onClick={e => e.stopPropagation()}
        >
          {BUBBLE_STYLE_PRESETS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          className="text-gray-600 hover:text-gray-300 transition-colors leading-none text-xs px-1"
          title="Duplicate bubble"
          onClick={e => { e.stopPropagation(); onDuplicate(bubble) }}
        >
          copy
        </button>
        <button
          className="text-gray-600 hover:text-red-400 transition-colors leading-none text-base px-0.5"
          title="Delete bubble"
          onClick={e => { e.stopPropagation(); onRemove(bubble.id) }}
        >
          X
        </button>
      </div>

      <textarea
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-purple-500 transition-colors"
        rows={2}
        placeholder="Bubble text..."
        value={bubble.text}
        onChange={e => onUpdate(bubble.id, { text: e.target.value })}
        onClick={e => e.stopPropagation()}
      />

      <div className="grid grid-cols-3 gap-1">
        <ToggleButton
          active={typography.weight >= 800}
          title="Bold"
          onClick={e => {
            e.stopPropagation()
            onUpdate(bubble.id, patchNested(bubble, 'typography', { weight: typography.weight >= 800 ? 600 : 900 }))
          }}
        >
          B
        </ToggleButton>
        <ToggleButton
          active={typography.italic}
          title="Italic"
          className="italic"
          onClick={e => {
            e.stopPropagation()
            onUpdate(bubble.id, patchNested(bubble, 'typography', { italic: !typography.italic }))
          }}
        >
          I
        </ToggleButton>
        <ToggleButton
          active={typography.uppercase}
          title="Uppercase"
          onClick={e => {
            e.stopPropagation()
            onUpdate(bubble.id, patchNested(bubble, 'typography', { uppercase: !typography.uppercase }))
          }}
        >
          Aa
        </ToggleButton>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {['left', 'center', 'right'].map(align => (
          <ToggleButton
            key={align}
            active={typography.align === align}
            title={`${align} align`}
            className="capitalize"
            onClick={e => {
              e.stopPropagation()
              onUpdate(bubble.id, patchNested(bubble, 'typography', { align }))
            }}
          >
            {align}
          </ToggleButton>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-14">Font</span>
        <input
          type="range"
          min={8}
          max={28}
          step={1}
          className="flex-1 accent-purple-500"
          value={typography.fontSize}
          onChange={e => onUpdate(bubble.id, patchNested(bubble, 'typography', { fontSize: Number(e.target.value), fontSizeLocked: true }))}
          onClick={e => e.stopPropagation()}
        />
        <span className="w-6 text-right text-gray-400">{typography.fontSize}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-14">Width</span>
        <input
          type="range"
          min={10}
          max={80}
          step={5}
          className="flex-1 accent-purple-500"
          value={bubble.width ?? 35}
          onChange={e => onUpdate(bubble.id, { width: Number(e.target.value) })}
          onClick={e => e.stopPropagation()}
        />
        <span className="w-6 text-right text-gray-400">{bubble.width ?? 35}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-14">Height</span>
        <input
          type="range"
          min={5}
          max={80}
          step={1}
          className="flex-1 accent-purple-500"
          value={bubble.height ?? 14}
          onChange={e => onUpdate(bubble.id, { height: Number(e.target.value) })}
          onClick={e => e.stopPropagation()}
        />
        <span className="w-6 text-right text-gray-400">{bubble.height ?? 'auto'}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <label className="flex items-center gap-2">
          <span>Fill</span>
          <input
            type="color"
            className="w-8 h-6 bg-transparent border-0 p-0 cursor-pointer"
            value={appearance.fill}
            onChange={e => onUpdate(bubble.id, patchNested(bubble, 'appearance', { fill: e.target.value }))}
            onClick={e => e.stopPropagation()}
          />
        </label>
        <label className="flex items-center gap-2">
          <span>Stroke</span>
          <input
            type="color"
            className="w-8 h-6 bg-transparent border-0 p-0 cursor-pointer"
            value={appearance.stroke}
            onChange={e => onUpdate(bubble.id, patchNested(bubble, 'appearance', { stroke: e.target.value }))}
            onClick={e => e.stopPropagation()}
          />
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-14">Stroke</span>
        <input
          type="range"
          min={0}
          max={6}
          step={0.5}
          className="flex-1 accent-purple-500"
          value={appearance.strokeWidth}
          onChange={e => onUpdate(bubble.id, patchNested(bubble, 'appearance', { strokeWidth: Number(e.target.value) }))}
          onClick={e => e.stopPropagation()}
        />
        <span className="w-6 text-right text-gray-400">{appearance.strokeWidth}</span>
      </div>

      {supportsTail && (
        <div className="rounded-md border border-gray-700 bg-gray-900/70 p-2 space-y-2" onClick={e => e.stopPropagation()}>
          <label className="flex items-center justify-between gap-2 text-xs text-gray-400">
            <span>Tail</span>
            <input
              type="checkbox"
              className="accent-purple-500"
              checked={tail.enabled}
              onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { enabled: e.target.checked }))}
            />
          </label>
          {tail.enabled && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>Base point {Number.isFinite(tail.baseX) && Number.isFinite(tail.baseY) ? 'manual' : 'auto'}</span>
                <button
                  className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  onClick={() => onUpdate(bubble.id, {
                    tail: {
                      ...tail,
                      baseX: undefined,
                      baseY: undefined,
                    },
                  })}
                >
                  auto
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Base</span>
                <input
                  type="range"
                  min={4}
                  max={40}
                  step={1}
                  className="flex-1 accent-purple-500"
                  value={tail.baseWidth ?? 16}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { baseWidth: Number(e.target.value) }))}
                />
                <span className="w-6 text-right text-gray-400">{tail.baseWidth ?? 16}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Base X</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1 accent-sky-500"
                  value={Number.isFinite(tail.baseX) ? tail.baseX : Math.round(baseHandle.x)}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { baseX: Number(e.target.value), baseY: Number.isFinite(tail.baseY) ? tail.baseY : Math.round(baseHandle.y) }))}
                />
                <span className="w-6 text-right text-gray-400">{Number.isFinite(tail.baseX) ? tail.baseX : Math.round(baseHandle.x)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Base Y</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1 accent-sky-500"
                  value={Number.isFinite(tail.baseY) ? tail.baseY : Math.round(baseHandle.y)}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { baseX: Number.isFinite(tail.baseX) ? tail.baseX : Math.round(baseHandle.x), baseY: Number(e.target.value) }))}
                />
                <span className="w-6 text-right text-gray-400">{Number.isFinite(tail.baseY) ? tail.baseY : Math.round(baseHandle.y)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Target X</span>
                <input
                  type="range"
                  min={-80}
                  max={180}
                  step={1}
                  className="flex-1 accent-purple-500"
                  value={tail.targetX}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { targetX: Number(e.target.value) }))}
                />
                <span className="w-6 text-right text-gray-400">{tail.targetX}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Target Y</span>
                <input
                  type="range"
                  min={-80}
                  max={180}
                  step={1}
                  className="flex-1 accent-purple-500"
                  value={tail.targetY}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { targetY: Number(e.target.value) }))}
                />
                <span className="w-6 text-right text-gray-400">{tail.targetY}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-14">Curve</span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={1}
                  className="flex-1 accent-purple-500"
                  value={tail.bend ?? 0}
                  onChange={e => onUpdate(bubble.id, patchNested(bubble, 'tail', { bend: Number(e.target.value) }))}
                />
                <span className="w-6 text-right text-gray-400">{tail.bend ?? 0}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function PanelEditModal() {
  const panelEditModalOpen = useComicStore(s => s.panelEditModalOpen)
  const panelEditModalPanelId = useComicStore(s => s.panelEditModalPanelId)
  const panelEditModalInitialBubble = useComicStore(s => s.panelEditModalInitialBubbleId)
  const closePanelEditModal = useComicStore(s => s.closePanelEditModal)
  const pages = useComicStore(s => s.pages)
  const { updatePanel, updatePage, addBubble, updateBubble, updateBubbleLive, removeBubble } = useComicStore()

  const [selectedBubbleId, setSelectedBubbleId] = useState(null)
  const [styleClipboard, setStyleClipboard] = useState(null)
  const [styleDefaults, setStyleDefaults] = useState(loadStyleDefaults)
  const [defaultBubbleStyle, setDefaultBubbleStyle] = useState(loadDefaultStyle)
  const [quickAddFill, setQuickAddFill] = useState(QUICK_BUBBLE_COLORS[0])
  const canvasRef = useRef(null)

  useEffect(() => {
    if (panelEditModalOpen) {
      setSelectedBubbleId(panelEditModalInitialBubble ?? null)
    }
  }, [panelEditModalOpen, panelEditModalInitialBubble])

  useEffect(() => {
    localStorage.setItem(STYLE_DEFAULTS_KEY, JSON.stringify(styleDefaults))
  }, [styleDefaults])

  useEffect(() => {
    localStorage.setItem(DEFAULT_STYLE_KEY, defaultBubbleStyle)
  }, [defaultBubbleStyle])

  useEffect(() => {
    if (!panelEditModalOpen) return undefined
    const isEditableTarget = (target) => {
      const tag = target?.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
    }
    const onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return
      const activePanel = pages.flatMap(pg => pg.panels).find(p => p.id === panelEditModalPanelId)
      if (!e.ctrlKey) return
      const activeBubble = activePanel?.bubbles.find(b => b.id === selectedBubbleId)
      if (e.key.toLowerCase() === 'c' && activeBubble) {
        e.preventDefault()
        setStyleClipboard(extractBubbleStyle(activeBubble))
      }
      if (e.key.toLowerCase() === 'v' && activeBubble && styleClipboard) {
        e.preventDefault()
        updateBubble(activePanel.id, activeBubble.id, deepClone(styleClipboard))
        setDefaultBubbleStyle(styleClipboard.style)
        setStyleDefaults(current => ({ ...current, [styleClipboard.style]: deepClone(styleClipboard) }))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [panelEditModalOpen, pages, panelEditModalPanelId, selectedBubbleId, styleClipboard, updateBubble])

  if (!panelEditModalOpen) return null

  let panel = null
  let page = null
  let panelIdx = -1
  for (const pg of pages) {
    const idx = pg.panels.findIndex(p => p.id === panelEditModalPanelId)
    if (idx !== -1) {
      panel = pg.panels[idx]
      page = pg
      panelIdx = idx
      break
    }
  }
  if (!panel || !page) return null

  const previewSize = getPanelPreviewSize(page, panelIdx)
  const selectedBubble = panel.bubbles.find(b => b.id === selectedBubbleId) ?? null
  const hasPanelImage = Boolean(panel.imageUrl || panel.imageAssetId)

  const rememberStyle = (bubbleLike) => {
    const snapshot = extractBubbleStyle(bubbleLike)
    setDefaultBubbleStyle(snapshot.style)
    setStyleDefaults(current => ({
      ...current,
      [snapshot.style]: snapshot,
    }))
  }

  const makeBubbleStyle = (style = defaultBubbleStyle) => {
    const base = applyBubbleStyle(style)
    const saved = styleDefaults[style]
    return deepClone(saved ? mergeStyleData(base, saved) : base)
  }

  const handleBubbleUpdate = (bubble, updates) => {
    const nextBubble = mergeStyleData({ ...bubble, ...updates }, updates)
    updateBubble(panel.id, bubble.id, updates)
    rememberStyle(nextBubble)
  }

  const handleBubbleLiveUpdate = (bubble, updates) => {
    const nextBubble = mergeStyleData({ ...bubble, ...updates }, updates)
    updateBubbleLive(panel.id, bubble.id, updates)
    rememberStyle(nextBubble)
  }

  const selectBubble = (bubbleId) => {
    setSelectedBubbleId(bubbleId)
  }

  const copySelectedStyle = () => {
    if (!selectedBubble) return
    setStyleClipboard(extractBubbleStyle(selectedBubble))
  }

  const pasteStyleToSelected = () => {
    if (!selectedBubble || !styleClipboard) return
    const style = deepClone(styleClipboard)
    updateBubble(panel.id, selectedBubble.id, style)
    rememberStyle(style)
  }

  const applySelectedStyleToPage = () => {
    if (!selectedBubble) return
    const style = extractBubbleStyle(selectedBubble)
    updatePage(page.id, {
      panels: page.panels.map(pgPanel => ({
        ...pgPanel,
        bubbles: pgPanel.bubbles.map(bubble => ({
          ...bubble,
          ...deepClone(style),
          id: bubble.id,
          text: bubble.text,
          x: bubble.x,
          y: bubble.y,
        })),
      })),
    })
    rememberStyle(style)
  }

  const addBubbleAtPoint = (clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    const id = uid()
    addBubble(panel.id, {
      id,
      x: Math.max(0, x - 17),
      y: Math.max(0, y - 5),
      ...makeBubbleStyle(defaultBubbleStyle),
    })
    selectBubble(id)
  }

  const handleCanvasClick = (e) => {
    if (e.target !== e.currentTarget) return
    addBubbleAtPoint(e.clientX, e.clientY)
  }

  const handleDuplicateBubble = (bubble) => {
    const { id, ...copy } = bubble
    const nextId = uid()
    addBubble(panel.id, {
      id: nextId,
      ...copy,
      x: Math.min(85, (bubble.x ?? 20) + 4),
      y: Math.min(88, (bubble.y ?? 10) + 4),
    })
    selectBubble(nextId)
  }

  const handleRemoveBubble = (bubbleId) => {
    removeBubble(panel.id, bubbleId)
    if (selectedBubbleId === bubbleId) setSelectedBubbleId(null)
  }

  const handleQuickAddShape = (styleValue) => {
    const id = uid()
    const base = makeBubbleStyle(styleValue)
    addBubble(panel.id, {
      id,
      x: 20,
      y: 12,
      ...base,
      appearance: { ...base.appearance, fill: quickAddFill },
    })
    setDefaultBubbleStyle(styleValue)
    selectBubble(id)
  }

  const handleQuickColor = (color) => {
    setQuickAddFill(color)
    if (selectedBubble) {
      handleBubbleUpdate(selectedBubble, patchNested(selectedBubble, 'appearance', { fill: color }))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) closePanelEditModal() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '96vw', maxWidth: 1160, height: '94vh' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Panel {panelIdx + 1} - {page.title}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
              Click the canvas to place a bubble. Drag bubbles to reposition.
            </p>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-xl transition-colors"
            onClick={closePanelEditModal}
          >
            X
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div className="flex-1 min-h-0 bg-gray-800 flex items-center justify-center overflow-auto p-3 sm:p-6">
            <div
              ref={canvasRef}
              data-panel-canvas
              className="relative select-none"
              style={{
                width: previewSize.width,
                height: previewSize.height,
                maxWidth: '100%',
                maxHeight: '100%',
                background: hasPanelImage ? '#000' : '#f8f8f8',
                border: '3px solid #1f2937',
                cursor: 'crosshair',
                flexShrink: 0,
                overflow: 'hidden',
              }}
              onClick={handleCanvasClick}
            >
              {hasPanelImage && (
                <PanelImage
                  src={panel.imageUrl}
                  assetId={panel.imageAssetId}
                  offsetX={panel.imageOffsetX ?? 0}
                  offsetY={panel.imageOffsetY ?? 0}
                  scale={panel.imageScale ?? 1}
                />
              )}

              {hasPanelImage && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
              )}

              {hasPanelImage && (
                <PanelImageInteractionLayer
                  panel={panel}
                  canvasRef={canvasRef}
                  onClickPoint={addBubbleAtPoint}
                />
              )}

              {hasPanelImage && (
                <PanelImageZoomControls panel={panel} canvasRef={canvasRef} />
              )}

              {!hasPanelImage && (
                panel.prompt ? (
                  <p
                    className="absolute inset-0 flex items-center justify-center text-xs text-center leading-relaxed pointer-events-none px-6"
                    style={{ color: '#bbb' }}
                  >
                    {panel.prompt}
                  </p>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                    <span style={{ fontSize: 48, opacity: 0.05 }}>IMG</span>
                    <p className="text-xs" style={{ color: '#ccc' }}>Click to place a bubble</p>
                  </div>
                )
              )}

              <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
                {panel.bubbles.map(bubble => (
                  <DraggableBubble
                    key={bubble.id}
                    bubble={bubble}
                    isSelected={selectedBubbleId === bubble.id}
                    onSelect={selectBubble}
                    onMove={(bubbleId, pos) => updateBubbleLive(panel.id, bubbleId, pos)}
                    onTailUpdate={(bubbleId, updates) => handleBubbleLiveUpdate(bubble, updates)}
                    onResize={(bubbleId, updates) => handleBubbleLiveUpdate(bubble, updates)}
                    onDelete={handleRemoveBubble}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="w-full md:w-80 h-[45vh] md:h-auto shrink-0 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col bg-gray-900 overflow-hidden">
            <div className="p-3 border-b border-gray-700 space-y-2 shrink-0">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Panel Prompt
              </label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-200 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                rows={4}
                placeholder="Describe this panel..."
                value={panel.prompt}
                onChange={e => updatePanel(panel.id, { prompt: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-1">
                {PERSPECTIVES.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`text-xs py-1 px-1.5 rounded border transition-all ${
                      panel.perspective === value
                        ? 'border-purple-500 bg-purple-950 text-purple-200'
                        : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                    }`}
                    onClick={() => updatePanel(panel.id, { perspective: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Bubbles {panel.bubbles.length > 0 ? `(${panel.bubbles.length})` : ''}
                </span>
                <button
                  className="text-xs px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
                  onClick={() => {
                    const id = uid()
                    addBubble(panel.id, { id, x: 10, y: 10, ...makeBubbleStyle(defaultBubbleStyle) })
                    selectBubble(id)
                  }}
                >
                  + Add
                </button>
              </div>

              <div className="rounded-md border border-gray-800 bg-gray-950/40 p-2 space-y-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Add</span>

                <div className="grid grid-cols-5 gap-1.5">
                  {QUICK_BUBBLE_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`aspect-square rounded-full border-2 transition-transform ${
                        quickAddFill === color ? 'border-purple-400 scale-110' : 'border-gray-700 hover:border-gray-500'
                      }`}
                      style={{ background: color }}
                      title={selectedBubble ? `Set bubble color` : `Use this color for the next bubble`}
                      onClick={() => handleQuickColor(color)}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {BUBBLE_STYLE_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      className="flex flex-col items-center gap-1 rounded border border-gray-700 bg-gray-900 hover:border-purple-500 transition-colors p-1"
                      title={`Add ${preset.label} bubble`}
                      onClick={() => handleQuickAddShape(preset.value)}
                    >
                      <div style={{ width: 44, height: 32 }}>
                        <BubbleShape bubble={{
                          style: preset.value,
                          text: 'Aa',
                          appearance: { fill: quickAddFill },
                          tail: { enabled: false },
                          height: 40,
                        }} />
                      </div>
                      <span className="text-[10px] text-gray-500 leading-none text-center">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedBubble && (
                <div className="grid grid-cols-3 gap-1.5 rounded-md border border-gray-800 bg-gray-950/40 p-2">
                  <button
                    className="text-xs rounded border border-gray-700 px-1.5 py-1 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    onClick={copySelectedStyle}
                    title="Copy selected bubble style. Ctrl+C also works when not editing text."
                  >
                    Copy
                  </button>
                  <button
                    className="text-xs rounded border border-gray-700 px-1.5 py-1 text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-40"
                    onClick={pasteStyleToSelected}
                    disabled={!styleClipboard}
                    title="Paste copied bubble style. Ctrl+V also works when not editing text."
                  >
                    Paste
                  </button>
                  <button
                    className="text-xs rounded border border-purple-700/70 px-1.5 py-1 text-purple-300 hover:bg-purple-950/40"
                    onClick={applySelectedStyleToPage}
                    title="Apply selected bubble style to every bubble on this page."
                  >
                    Page
                  </button>
                </div>
              )}

              {panel.bubbles.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-6 leading-relaxed">
                  Click the canvas to place bubbles,<br />or use + Add.
                </p>
              )}

              {panel.bubbles.map((bubble, idx) => (
                <BubbleRow
                  key={bubble.id}
                  bubble={bubble}
                  idx={idx}
                  isSelected={selectedBubbleId === bubble.id}
                  onSelect={selectBubble}
                  onUpdate={(id, updates) => handleBubbleUpdate(bubble, updates)}
                  onRemove={handleRemoveBubble}
                  onDuplicate={handleDuplicateBubble}
                  makeBubbleStyle={makeBubbleStyle}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
