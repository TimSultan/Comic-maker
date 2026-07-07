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

export async function exportPageAsPng(pageElement, fileName) {
  if (!pageElement) throw new Error('No rendered page found to export.')
  await Promise.all([...pageElement.querySelectorAll('img')].map(waitForImage))

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
    },
  })
  const blob = await canvasBlob(canvas)
  downloadBlob(blob, `${safeFileName(fileName)}.png`)
}
