import React from 'react'
import useComicStore from '../../store/useComicStore'
import { getPanelLayout } from '../../utils/defaults'
import StoredImage from '../StoredImage'

// ─── Mini page thumbnail ─────────────────────────────────────────

function thumbGrid(layout) {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
    gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
    gap: '2px',
    width: '100%',
    height: '100%',
  }
}

function PageThumb({ page, isSelected, onClick, onDelete, canDelete }) {
  const layout = getPanelLayout(page.panelCount, page.layoutId)

  return (
    <div
      className={`relative group cursor-pointer rounded overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-purple-500 shadow-md shadow-purple-900/40'
          : 'border-gray-700 hover:border-gray-500'
      }`}
      onClick={onClick}
    >
      {/* White page preview */}
      <div className="bg-white p-1.5" style={{ aspectRatio: '3 / 4' }}>
        <div style={thumbGrid(layout)}>
          {page.panels.map((panel, idx) => {
            const placement = layout.panels[idx] ?? { col: 1, row: 1 }
            return (
              <div
                key={panel.id}
                className="relative overflow-hidden border border-gray-300"
                style={{
                  background: panel.prompt ? '#dbeafe' : '#f3f4f6',
                  gridColumn: `${placement.col} / span ${placement.colSpan ?? 1}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan ?? 1}`,
                }}
                title={panel.prompt || 'Empty panel'}
              >
                {(panel.imageUrl || panel.imageAssetId) && (
                  <StoredImage
                    src={panel.imageUrl}
                    assetId={panel.imageAssetId}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Page label */}
      <div
        className={`text-center text-xs py-1 px-2 truncate ${
          isSelected ? 'bg-gray-800 text-purple-300' : 'bg-gray-950 text-gray-500'
        }`}
      >
        {page.title}
      </div>

      {/* Delete button (hover) */}
      {canDelete && (
        <button
          className="absolute top-1 right-1 w-5 h-5 bg-red-700 hover:bg-red-600 text-white text-xs rounded
            opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center leading-none"
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete page"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ─── PageNavigator ───────────────────────────────────────────────

export default function PageNavigator() {
  const pages = useComicStore(s => s.pages)
  const selectedPageId = useComicStore(s => s.selectedPageId)
  const { selectPage, addPage, removePage, duplicatePage } = useComicStore()

  return (
    <div className="w-44 shrink-0 flex flex-col bg-gray-900 border-r border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pages</span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded bg-purple-700 hover:bg-purple-600 text-white text-base font-bold leading-none transition-colors"
          onClick={addPage}
          title="Add page"
        >
          +
        </button>
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.map(page => (
          <PageThumb
            key={page.id}
            page={page}
            isSelected={selectedPageId === page.id}
            onClick={() => selectPage(page.id)}
            onDelete={() => removePage(page.id)}
            canDelete={pages.length > 1}
          />
        ))}
      </div>

      {/* Footer: page count */}
      <div className="shrink-0 px-3 py-2 border-t border-gray-700 text-xs text-gray-600 text-center">
        {pages.length} page{pages.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
