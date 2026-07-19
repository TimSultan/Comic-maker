import html2canvas from 'html2canvas'
import { getImageAsset } from './imageStore'

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
  // Bubble text uses a webfont (Comic Neue); if it hasn't finished loading
  // yet, html2canvas snapshots with the fallback font and export won't match
  // what's on screen.
  if (document.fonts?.ready) await document.fonts.ready
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

  // html2canvas exports each bubble svg by serializing it to a standalone
  // image and drawing source rect (0, 0, boundsW, boundsH) from it — but the
  // svg's inline percentage width/height override the px attributes it
  // injects, so the browser rasterizes the standalone svg at a fallback size
  // that doesn't match that source rect, and balloons come out slightly
  // scaled/shifted against their text. Pinning the clone's svg CSS size to
  // the exact layout px keeps CSS, attributes, raster, and source rect in
  // agreement (see CanvasRenderer.renderReplacedElement in html2canvas).
  const bubbleSvgSizes = [...pageElement.querySelectorAll('[data-bubble-layer] svg')].map(svg => {
    const rect = svg.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })

  // The canvas normally only has each panel's compressed display preview
  // loaded — PNG/PDF export needs full quality, so resolve every distinct
  // asset id up front and swap the clone's <img> src for it below.
  const assetImgs = [...pageElement.querySelectorAll('img[data-asset-id]')]
  const originalByAssetId = new Map()
  await Promise.all([...new Set(assetImgs.map(img => img.dataset.assetId))].map(async id => {
    try {
      const url = await getImageAsset(id)
      if (url) originalByAssetId.set(id, url)
    } catch {
      // Resolution failed — the clone keeps the already-loaded preview.
    }
  }))

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

      // Pin bubble svg sizes to exact px (see bubbleSvgSizes above). The
      // live and cloned documents share layout, so index pairing is stable;
      // when hideBubbles removed the layers this finds nothing and no-ops.
      const clonedSvgs = clonedPage
        ? [...clonedPage.querySelectorAll('[data-bubble-layer] svg')]
        : []
      clonedSvgs.forEach((svg, i) => {
        const size = bubbleSvgSizes[i]
        if (!size || !size.width || !size.height) return
        svg.style.width = `${size.width}px`
        svg.style.height = `${size.height}px`
      })
      const clonedImgs = clonedPage
        ? [...clonedPage.querySelectorAll('[data-comic-panel] img')]
        : []
      clonedImgs.forEach((cloneImg, i) => {
        // Swap the compressed preview for the full-quality original — the
        // layout box below is sized from the preview, but since it's
        // object-fit 'fill' and the original shares its aspect ratio, this
        // doesn't shift the layout. html2canvas loads clone images itself
        // after onclone returns (imageTimeout above), so a src swap is safe.
        const assetId = cloneImg.dataset.assetId
        if (assetId && originalByAssetId.has(assetId)) {
          cloneImg.src = originalByAssetId.get(assetId)
        }

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
