import React, { useRef } from 'react'
import useComicStore from '../../store/useComicStore'
import { BubbleShape } from '../PanelModal/BubbleShapes'
import { getPanelLayout, getPanelPlacement } from '../../utils/defaults'
import PanelImage from '../PanelImage'

// ─── Draggable bubble on the main canvas ─────────────────────────
// Drag → reposition.  Click (no drag) → open modal for that bubble.

function CanvasBubble({ bubble, panelRef, onDragUpdate, onOpenModal }) {
  const dragState = useRef(null)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)

  const handleMouseDown = (e) => {
    e.stopPropagation()
    if (e.button !== 0) return

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

    const onMouseMove = (ev) => {
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

    const onMouseUp = () => {
      if (!dragState.current?.moved) onOpenModal(bubble.id)
      else commitHistorySnapshot(dragState.current.historySnapshot)
      dragState.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
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
      onMouseDown={handleMouseDown}
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

function ResizeHandle({ direction, position, idx, sizes, pageId, pageRef }) {
  const updatePageLive = useComicStore(s => s.updatePageLive)
  const getHistorySnapshot = useComicStore(s => s.getHistorySnapshot)
  const commitHistorySnapshot = useComicStore(s => s.commitHistorySnapshot)
  const isCol = direction === 'col'

  const handleMouseDown = (e) => {
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
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      data-no-export
      className={`absolute z-20 group ${isCol ? 'cursor-col-resize' : 'cursor-row-resize'}`}
      style={
        isCol
          ? { left: `${position}%`, top: 0, bottom: 0, width: 14, transform: 'translateX(-50%)' }
          : { top: `${position}%`, left: 0, right: 0, height: 14, transform: 'translateY(-50%)' }
      }
      onMouseDown={handleMouseDown}
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
  const hasImage = Boolean(panel.imageUrl || panel.imageAssetId)

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

      {/* Bubble overlays: drag to move, click to open modal */}
      {panel.bubbles?.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
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

        {(cols > 1 || rows > 1) && (
          <p className="text-xs text-gray-600 select-none">
            Hover between panels to resize · Drag image to reframe
          </p>
        )}
      </div>
    </div>
  )
}
