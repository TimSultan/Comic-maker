import React from 'react'
import TopBar from './components/TopBar/TopBar'
import PageNavigator from './components/LeftSidebar/PageNavigator'
import ComicCanvas from './components/Canvas/ComicCanvas'
import PropertiesPanel from './components/RightSidebar/PropertiesPanel'
import PanelEditModal from './components/PanelModal/PanelEditModal'
import AIFillModal from './components/AIFill/AIFillModal'
import DebugPanel from './components/DebugPanel'
import useComicStore from './store/useComicStore'

export default function App() {
  const showLeftSidebar = useComicStore(s => s.showLeftSidebar)
  const showRightSidebar = useComicStore(s => s.showRightSidebar)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showLeftSidebar && <PageNavigator />}
        <ComicCanvas />
        {showRightSidebar && <PropertiesPanel />}
      </div>
      <PanelEditModal />
      <AIFillModal />
      <DebugPanel />
    </div>
  )
}
