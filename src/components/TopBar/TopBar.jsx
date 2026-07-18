import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import useComicStore from '../../store/useComicStore'
import { exportPageAsPng } from '../../utils/exportPagePng'
import { exportComicAsPdf } from '../../utils/exportComicPdf'
import { getImageAsset, migrateProjectImagesToAssets } from '../../utils/imageStore'

// ─── Menu data ───────────────────────────────────────────────────

const FILE_MENU = [
  { label: 'New Comic', action: 'new' },
  { separator: true },
  { label: 'Save to Browser', action: 'save', shortcut: 'Ctrl+S' },
  { label: 'Load from Browser', action: 'load' },
  { separator: true },
  { label: 'Export JSON', action: 'export-json' },
  { label: 'Load from JSON File…', action: 'load-json' },
  { separator: true },
  { label: 'Export PNG', action: 'export-png' },
  { label: 'Export PNG (No Text)', action: 'export-png-no-text' },
  { label: 'Export PDF (All Pages)', action: 'export-pdf' },
]

const VIEW_MENU = [
  { label: 'Toggle Page List', action: 'toggle-left', shortcut: 'Alt+1' },
  { label: 'Toggle Properties', action: 'toggle-right', shortcut: 'Alt+2' },
]

const EDIT_MENU = [
  { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' },
  { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' },
]

// ─── Dropdown component ──────────────────────────────────────────

function Dropdown({ label, items, onAction }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const buttonWrapRef = useRef(null)
  const menuRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  // The menu is portaled to <body> and positioned with fixed coords instead
  // of being an absolutely-positioned child here, because the TopBar row it
  // lives in needs overflow-x-auto for horizontal scrolling on narrow
  // screens — and since overflow-x isn't 'visible', the browser also clips
  // overflow-y, cutting the dropdown off at the bar's bottom edge. Portaling
  // escapes that clipping ancestor entirely.
  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e) => {
      if (buttonWrapRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, close])

  const handleToggle = () => {
    setOpen(v => {
      const next = !v
      if (next && buttonWrapRef.current) {
        const rect = buttonWrapRef.current.getBoundingClientRect()
        setMenuPos({ top: rect.bottom + 2, left: rect.left })
      }
      return next
    })
  }

  return (
    <div ref={buttonWrapRef} className="relative">
      <button
        className={`px-3 h-8 text-sm rounded transition-colors select-none ${
          open
            ? 'bg-gray-700 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
        onClick={handleToggle}
      >
        {label}
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 py-1.5 min-w-[200px]"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 border-t border-gray-700" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                className={`w-full text-left px-4 py-1.5 text-sm flex items-center justify-between gap-4 transition-colors
                  ${item.disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                onClick={() => { onAction(item.action); close() }}
              >
                <span>{item.label}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {item.shortcut ?? item.hint ?? ''}
                </span>
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── TopBar ──────────────────────────────────────────────────────

export default function TopBar() {
  const comicTitle = useComicStore(s => s.comicTitle)
  const setComicTitle = useComicStore(s => s.setComicTitle)
  const toggleLeftSidebar = useComicStore(s => s.toggleLeftSidebar)
  const toggleRightSidebar = useComicStore(s => s.toggleRightSidebar)
  const openStylePanel = useComicStore(s => s.openStylePanel)
  const openCharactersPanel = useComicStore(s => s.openCharactersPanel)
  const openAssetsPanel = useComicStore(s => s.openAssetsPanel)
  const openAIFillModal = useComicStore(s => s.openAIFillModal)
  const autoSaveImages = useComicStore(s => s.autoSaveImages)
  const setAutoSaveImages = useComicStore(s => s.setAutoSaveImages)
  const canUndo = useComicStore(s => s.undoStack.length > 0)
  const canRedo = useComicStore(s => s.redoStack.length > 0)

  const [editingTitle, setEditingTitle] = useState(false)
  const [projectFileName, setProjectFileName] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const fileInputRef = useRef(null)
  const projectFileHandleRef = useRef(null)
  const pdfExportingRef = useRef(false)

  const getProjectData = useCallback(async ({ includeAssets = false } = {}) => {
    const {
      comicTitle,
      globalStyle,
      pages,
      characters,
      styleReferences,
      projectImages,
      imageModel,
      imageQuality,
    } = useComicStore.getState()
    const data = {
      schemaVersion: includeAssets ? 3 : 2,
      comicTitle,
      globalStyle,
      pages,
      characters,
      styleReferences,
      projectImages,
      imageModel,
      imageQuality,
      savedAt: new Date().toISOString(),
    }
    if (!includeAssets) return data

    // Portable saves (quick-save / export-json) embed every referenced
    // IndexedDB asset as a full-quality data URL so the file is self
    // contained — the browser-storage "save" path stays asset-free since
    // that project already lives alongside the same IndexedDB.
    const assetIds = new Set()
    pages.forEach(page => page.panels.forEach(panel => { if (panel.imageAssetId) assetIds.add(panel.imageAssetId) }))
    characters.forEach(character => {
      if (character.imageAssetId) assetIds.add(character.imageAssetId)
      ;(character.images || []).forEach(img => { if (img.assetId) assetIds.add(img.assetId) })
      ;(character.looks || []).forEach(look => { if (look.imageAssetId) assetIds.add(look.imageAssetId) })
    })
    styleReferences.forEach(ref => { if (ref.assetId) assetIds.add(ref.assetId) })
    projectImages.forEach(image => { if (image.imageAssetId) assetIds.add(image.imageAssetId) })

    const assets = {}
    await Promise.all([...assetIds].map(async id => {
      try {
        const dataUrl = await getImageAsset(id)
        if (dataUrl) assets[id] = dataUrl
      } catch {
        // Skip ids that fail to resolve — the project still loads without them.
      }
    }))

    return { ...data, assets }
  }, [])

  const applyProjectData = useCallback(async (data) => {
    if (!Array.isArray(data.pages)) throw new Error('Not a valid Comic Maker JSON file.')
    const migrated = await migrateProjectImagesToAssets(data)
    useComicStore.setState({
      ...migrated,
      projectImages: migrated.projectImages ?? [],
      selectedPageId: migrated.pages[0]?.id ?? null,
      selectedPanelId: null,
      undoStack: [],
      redoStack: [],
    })
  }, [])

  const downloadProjectJson = useCallback((data) => {
    const title = data.comicTitle || 'comic-project'
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const writeProjectFile = useCallback(async (handle, data) => {
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }, [])

  // Keyboard shortcut handler
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === '1') { e.preventDefault(); toggleLeftSidebar() }
      if (e.altKey && e.key === '2') { e.preventDefault(); toggleRightSidebar() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleAction('save') }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleAction(e.shiftKey ? 'redo' : 'undo')
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleAction('redo')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAction = useCallback(async (action) => {
    switch (action) {
      case 'toggle-left':
        toggleLeftSidebar()
        break
      case 'toggle-right':
        toggleRightSidebar()
        break
      case 'undo':
        useComicStore.getState().undo()
        break
      case 'redo':
        useComicStore.getState().redo()
        break
      case 'new':
        if (window.confirm('Start a new comic? Unsaved changes will be lost.')) {
          useComicStore.setState(useComicStore.getInitialState?.() ?? {})
          window.location.reload()
        }
        break
      case 'save': {
        const data = await getProjectData({ includeAssets: false })
        try {
          localStorage.setItem('comic-maker-save', JSON.stringify(data))
          // Brief toast would go here — using console for now
          console.info('Comic saved to localStorage')
        } catch {
          alert('Failed to save to browser storage — it may be full. Try Export JSON for a full backup instead.')
        }
        break
      }
      case 'quick-save': {
        const data = await getProjectData({ includeAssets: true })
        try {
          if (projectFileHandleRef.current?.createWritable) {
            await writeProjectFile(projectFileHandleRef.current, data)
            console.info(`Project saved to ${projectFileName || 'current JSON file'}`)
            break
          }

          if (window.showSaveFilePicker) {
            const suggestedName = `${(data.comicTitle || 'comic-project').replace(/\s+/g, '-').toLowerCase()}.json`
            const handle = await window.showSaveFilePicker({
              suggestedName,
              types: [{
                description: 'Comic Maker JSON',
                accept: { 'application/json': ['.json'] },
              }],
            })
            await writeProjectFile(handle, data)
            projectFileHandleRef.current = handle
            setProjectFileName(handle.name ?? suggestedName)
            break
          }

          downloadProjectJson(data)
        } catch (err) {
          if (err?.name !== 'AbortError') alert('Failed to save project: ' + err.message)
        }
        break
      }
      case 'quick-load': {
        if (window.showOpenFilePicker) {
          try {
            const [handle] = await window.showOpenFilePicker({
              multiple: false,
              types: [{
                description: 'Comic Maker JSON',
                accept: { 'application/json': ['.json'] },
              }],
            })
            const file = await handle.getFile()
            const data = JSON.parse(await file.text())
            await applyProjectData(data)
            projectFileHandleRef.current = handle
            setProjectFileName(file.name)
          } catch (err) {
            if (err?.name !== 'AbortError') alert('Failed to load project: ' + err.message)
          }
          break
        }
        fileInputRef.current?.click()
        break
      }
      case 'load-json':
        fileInputRef.current?.click()
        break
      case 'load': {
        const raw = localStorage.getItem('comic-maker-save')
        if (!raw) { alert('No saved comic found.'); return }
        try {
          const data = JSON.parse(raw)
          await applyProjectData(data)
        } catch {
          alert('Failed to load saved comic.')
        }
        break
      }
      case 'export-json': {
        downloadProjectJson(await getProjectData({ includeAssets: true }))
        break
      }
      case 'export-png': {
        try {
          const pageEl = document.querySelector('[data-comic-page]')
          const state = useComicStore.getState()
          const page = state.pages.find(p => p.id === state.selectedPageId) ?? state.pages[0]
          await exportPageAsPng(pageEl, `${state.comicTitle || 'comic'}-${page?.title || 'page'}`)
        } catch (err) {
          alert('Failed to export PNG: ' + err.message)
        }
        break
      }
      case 'export-png-no-text': {
        try {
          const pageEl = document.querySelector('[data-comic-page]')
          const state = useComicStore.getState()
          const page = state.pages.find(p => p.id === state.selectedPageId) ?? state.pages[0]
          await exportPageAsPng(pageEl, `${state.comicTitle || 'comic'}-${page?.title || 'page'}-no-text`, { hideBubbles: true })
        } catch (err) {
          alert('Failed to export PNG: ' + err.message)
        }
        break
      }
      case 'export-pdf': {
        if (pdfExportingRef.current) break
        pdfExportingRef.current = true
        setExportingPdf(true)
        try {
          const state = useComicStore.getState()
          await exportComicAsPdf({
            pages: state.pages,
            selectedPageId: state.selectedPageId,
            selectPage: state.selectPage,
            comicTitle: state.comicTitle,
          })
        } catch (err) {
          alert('Failed to export PDF: ' + err.message)
        } finally {
          pdfExportingRef.current = false
          setExportingPdf(false)
        }
        break
      }
      default:
        break
    }
  }, [applyProjectData, downloadProjectJson, getProjectData, projectFileName, toggleLeftSidebar, toggleRightSidebar, writeProjectFile])

  const fileMenu = FILE_MENU.map(item =>
    item.action === 'export-pdf'
      ? { ...item, label: exportingPdf ? 'Exporting PDF…' : item.label, disabled: exportingPdf }
      : item,
  )

    return (
    <>
      {/* Hidden file input for JSON load */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = async ev => {
            try {
              const data = JSON.parse(ev.target.result)
              await applyProjectData(data)
              projectFileHandleRef.current = null
              setProjectFileName(file.name)
            } catch (err) {
              alert('Failed to load file: ' + err.message)
            }
          }
          reader.readAsText(file)
          e.target.value = ''
        }}
      />

      <div
        className="flex items-center h-10 bg-gray-900 border-b border-gray-700 px-3 gap-1 shrink-0 select-none z-40 overflow-x-auto overflow-y-hidden flex-nowrap"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Brand + editable title */}
        <div className="flex items-center gap-2 pr-4 mr-1 border-r border-gray-700 shrink-0">
        <span className="text-lg leading-none">🎨</span>
        {editingTitle ? (
          <input
            autoFocus
            className="bg-transparent text-white text-sm font-semibold border-b border-purple-500 outline-none w-40"
            value={comicTitle}
            onChange={e => setComicTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false)
            }}
          />
        ) : (
          <span
            className="text-white text-sm font-semibold cursor-pointer hover:text-purple-300 transition-colors truncate max-w-[160px]"
            title="Double-click to rename"
            onDoubleClick={() => setEditingTitle(true)}
          >
            {comicTitle}
          </span>
        )}
      </div>

      {/* Menu dropdowns */}
      <div className="shrink-0"><Dropdown label="File" items={fileMenu} onAction={handleAction} /></div>
      <div className="shrink-0"><Dropdown label="Edit" items={EDIT_MENU} onAction={handleAction} /></div>
      <div className="shrink-0"><Dropdown label="View" items={VIEW_MENU} onAction={handleAction} /></div>

      <button
        className="shrink-0 px-2.5 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-300"
        onClick={() => handleAction('undo')}
        disabled={!canUndo}
        title="Undo"
      >
        Undo
      </button>
      <button
        className="shrink-0 px-2.5 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-300"
        onClick={() => handleAction('redo')}
        disabled={!canRedo}
        title="Redo"
      >
        Redo
      </button>

      <button
        className="shrink-0 px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={() => handleAction('quick-save')}
        title={projectFileHandleRef.current ? `Overwrite ${projectFileName || 'current JSON project'}` : 'Save JSON project'}
      >
        Save
      </button>
      <button
        className="shrink-0 px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={() => handleAction('quick-load')}
        title="Load JSON project"
      >
        Load
      </button>

      {/* Quick-access buttons */}
      <button
        className="shrink-0 px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openStylePanel}
      >
        Style
      </button>
      <button
        className="shrink-0 px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openCharactersPanel}
      >
        Characters
      </button>
      <button
        className="shrink-0 px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openAssetsPanel}
      >
        Assets
      </button>

      <button
        className={`shrink-0 flex items-center gap-1.5 px-3 h-8 text-sm rounded transition-colors whitespace-nowrap ${
          autoSaveImages
            ? 'bg-green-900/50 text-green-300 hover:bg-green-900/70'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
        onClick={() => setAutoSaveImages(!autoSaveImages)}
        title={autoSaveImages
          ? 'Every generated image (panels + character portraits) is downloaded automatically. Click to turn off.'
          : 'Generated images are not downloaded automatically. Click to turn on.'}
      >
        💾 Auto-Save {autoSaveImages ? 'On' : 'Off'}
      </button>

      {/* Spacer — collapses once the bar overflows and scrolls */}
      <div className="flex-1 min-w-[8px]" />

      {/* AI Fill — Phase 6 */}
      <button
        className="shrink-0 flex items-center gap-1.5 px-4 h-7 text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors whitespace-nowrap"
        onClick={openAIFillModal}
      >
        ✨ AI Fill
        </button>
      </div>
    </>
  )
}
