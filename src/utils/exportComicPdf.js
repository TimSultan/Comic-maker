import { jsPDF } from 'jspdf'
import { renderPageCanvas, safeFileName } from './exportPagePng'

function waitForFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function countExpectedImages(page) {
  return page.panels.filter(p => p.imageUrl || p.imageAssetId).length
}

// After selectPage() commits, PanelImage resolves each panel's image from
// IndexedDB asynchronously, so the <img> tags this page will end up with
// don't exist yet on the frame right after the React re-render. Poll until
// the expected count shows up (or give up after a timeout) before handing
// the page off to html2canvas.
function waitForPanelImages(pageElement, expectedCount, timeoutMs = 4000) {
  const start = performance.now()
  return new Promise(resolve => {
    const check = () => {
      const found = pageElement.querySelectorAll('[data-comic-panel] img').length
      if (found >= expectedCount || performance.now() - start > timeoutMs) {
        resolve()
      } else {
        requestAnimationFrame(check)
      }
    }
    check()
  })
}

// Exports every page of the comic as a multi-page PDF, one page per sheet.
// Pages are rasterized one at a time by swapping the canvas's selected page
// (the app only ever mounts the currently-selected page's DOM), so this
// temporarily changes what's on screen and restores it when done.
export async function exportComicAsPdf({ pages, selectedPageId, selectPage, comicTitle, hideBubbles = false }) {
  if (!pages?.length) throw new Error('No pages to export.')

  let pdf = null
  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      selectPage(page.id)
      await waitForFrame()
      const pageElement = document.querySelector('[data-comic-page]')
      if (!pageElement) throw new Error(`Could not find rendered page "${page.title}" to export.`)
      await waitForPanelImages(pageElement, countExpectedImages(page))

      const canvas = await renderPageCanvas(pageElement, { hideBubbles })
      const imgData = canvas.toDataURL('image/png')
      const pageWidthPt = canvas.width / 2
      const pageHeightPt = canvas.height / 2

      if (!pdf) {
        pdf = new jsPDF({ unit: 'pt', format: [pageWidthPt, pageHeightPt] })
      } else {
        pdf.addPage([pageWidthPt, pageHeightPt])
      }
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthPt, pageHeightPt)
    }
  } finally {
    selectPage(selectedPageId)
  }

  pdf.save(`${safeFileName(comicTitle)}.pdf`)
}
