import React, { useState, useRef, useEffect, useCallback } from 'react'
import useComicStore from '../../store/useComicStore'
import { exportPageAsPng } from '../../utils/exportPagePng'
import { migrateProjectImagesToAssets } from '../../utils/imageStore'

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
  { label: 'Export PDF', action: 'export-pdf', disabled: true, hint: '(Phase 6)' },
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
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        className={`px-3 h-8 text-sm rounded transition-colors select-none ${
          open
            ? 'bg-gray-700 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
        onClick={() => setOpen(v => !v)}
      >
        {label}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 py-1.5 min-w-[200px]">
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
                onClick={() => { onAction(item.action); setOpen(false) }}
              >
                <span>{item.label}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {item.shortcut ?? item.hint ?? ''}
                </span>
              </button>
            ),
          )}
        </div>
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
  const fileInputRef = useRef(null)
  const projectFileHandleRef = useRef(null)

  const getProjectData = useCallback(() => {
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
    return {
      schemaVersion: 2,
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
        const data = getProjectData()
        localStorage.setItem('comic-maker-save', JSON.stringify(data))
        // Brief toast would go here — using console for now
        console.info('Comic saved to localStorage')
        break
      }
      case 'quick-save': {
        const data = getProjectData()
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
        downloadProjectJson(getProjectData())
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
      default:
        break
    }
  }, [applyProjectData, downloadProjectJson, getProjectData, projectFileName, toggleLeftSidebar, toggleRightSidebar, writeProjectFile])

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

      <div className="flex items-center h-10 bg-gray-900 border-b border-gray-700 px-3 gap-1 shrink-0 select-none z-40">
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
      <Dropdown label="File" items={FILE_MENU} onAction={handleAction} />
      <Dropdown label="Edit" items={EDIT_MENU} onAction={handleAction} />
      <Dropdown label="View" items={VIEW_MENU} onAction={handleAction} />

      <button
        className="px-2.5 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-300"
        onClick={() => handleAction('undo')}
        disabled={!canUndo}
        title="Undo"
      >
        Undo
      </button>
      <button
        className="px-2.5 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-300"
        onClick={() => handleAction('redo')}
        disabled={!canRedo}
        title="Redo"
      >
        Redo
      </button>

      <button
        className="px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={() => handleAction('quick-save')}
        title={projectFileHandleRef.current ? `Overwrite ${projectFileName || 'current JSON project'}` : 'Save JSON project'}
      >
        Save
      </button>
      <button
        className="px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={() => handleAction('quick-load')}
        title="Load JSON project"
      >
        Load
      </button>

      {/* Quick-access buttons */}
      <button
        className="px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openStylePanel}
      >
        Style
      </button>
      <button
        className="px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openCharactersPanel}
      >
        Characters
      </button>
      <button
        className="px-3 h-8 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        onClick={openAssetsPanel}
      >
        Assets
      </button>

      <button
        className={`flex items-center gap-1.5 px-3 h-8 text-sm rounded transition-colors ${
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Fill — Phase 6 */}
      <button
        className="flex items-center gap-1.5 px-4 h-7 text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors"
        onClick={openAIFillModal}
      >
        ✨ AI Fill
        </button>
      </div>
    </>
  )
}
