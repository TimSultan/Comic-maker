import html2canvas from 'html2canvas'

function safeFileName(name) {
  return (name || 'comic-page')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'comic-page'
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve()
  return new Promise(resolve => {
    const done = () => resolve()
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create PNG blob.'))
    }, 'image/png')
  })
}

export async function renderPageCanvas(pageElement, { hideBubbles = false } = {}) {
  if (!pageElement) throw new Error('No rendered page found to export.')
  await Promise.all([...pageElement.querySelectorAll('img')].map(waitForImage))

  // Snapshot live image layouts before cloning, because html2canvas does not
  // support objectFit and will stretch images to their container dimensions.
  const originalImgs = [...pageElement.querySelectorAll('[data-comic-panel] img')]
  const imgLayouts = originalImgs.map(img => {
    const frame = img.parentElement
    const { width: fw, height: fh } = frame?.getBoundingClientRect() ?? {}
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const os = img.style

    // If PanelImage already computed explicit px dimensions (ready=true), use them.
    if (os.width && !os.width.includes('%')) {
      return { left: os.left, top: os.top, width: os.width, height: os.height }
    }

    // Fallback: compute cover manually from natural size + frame size.
    if (!nw || !nh || !fw || !fh) return null
    const coverScale = Math.max(fw / nw, fh / nh)
    const dw = nw * coverScale
    const dh = nh * coverScale
    return {
      left: `${(fw - dw) / 2}px`,
      top:  `${(fh - dh) / 2}px`,
      width:  `${dw}px`,
      height: `${dh}px`,
    }
  })

  const canvas = await html2canvas(pageElement, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 15000,
    ignoreElements: element => element?.hasAttribute?.('data-no-export'),
    onclone: documentClone => {
      documentClone.querySelectorAll('[data-comic-panel]').forEach(panel => {
        panel.style.border = '2px solid #111827'
        panel.style.boxShadow = 'none'
      })

      if (hideBubbles) {
        documentClone.querySelectorAll('[data-bubble-layer]').forEach(layer => layer.remove())
      }

      // Apply explicit cover-correct dimensions so html2canvas doesn't stretch images.
      const clonedPage = documentClone.querySelector('[data-comic-page]')
      const clonedImgs = clonedPage
        ? [...clonedPage.querySelectorAll('[data-comic-panel] img')]
        : []
      clonedImgs.forEach((cloneImg, i) => {
        const layout = imgLayouts[i]
        if (!layout) return
        Object.assign(cloneImg.style, {
          position: 'absolute',
          inset: 'auto',
          left: layout.left,
          top: layout.top,
          width: layout.width,
          height: layout.height,
          objectFit: 'fill',
          maxWidth: 'none',
          maxHeight: 'none',
        })
      })
    },
  })
  return canvas
}

export async function exportPageAsPng(pageElement, fileName, options = {}) {
  const canvas = await renderPageCanvas(pageElement, options)
  const blob = await canvasBlob(canvas)
  downloadBlob(blob, `${safeFileName(fileName)}.png`)
}

export { safeFileName }
