import React, { useEffect } from 'react'
import TopBar from './components/TopBar/TopBar'
import PageNavigator from './components/LeftSidebar/PageNavigator'
import ComicCanvas from './components/Canvas/ComicCanvas'
import PropertiesPanel from './components/RightSidebar/PropertiesPanel'
import PanelEditModal from './components/PanelModal/PanelEditModal'
import CharacterStudioModal from './components/CharacterModal/CharacterStudioModal'
import AIFillModal from './components/AIFill/AIFillModal'
import DebugPanel from './components/DebugPanel'
import useComicStore from './store/useComicStore'

export default function App() {
  const showLeftSidebar = useComicStore(s => s.showLeftSidebar)
  const showRightSidebar = useComicStore(s => s.showRightSidebar)

  // On phone-sized viewports, start with both drawers closed so the canvas
  // is visible immediately — they're full-screen overlays there (see
  // PageNavigator/PropertiesPanel), so showing both by default would just
  // hide the comic behind them. Desktop keeps its normal side-by-side default.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      useComicStore.setState({ showLeftSidebar: false, showRightSidebar: false })
    }
  }, [])

  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        {showLeftSidebar && <PageNavigator />}
        <ComicCanvas />
        {showRightSidebar && <PropertiesPanel />}
      </div>
      <PanelEditModal />
      <CharacterStudioModal />
      <AIFillModal />
      <DebugPanel />
    </div>
  )
}
