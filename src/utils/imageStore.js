const DB_NAME = 'comic-maker-assets'
const DB_VERSION = 2
const STORE_NAME = 'images'

// Downscaled previews stop growing past this size — big enough to look
// sharp in every UI surface (largest is the Character Studio card), small
// enough to keep IndexedDB reads and the DOM cheap.
const PREVIEW_MAX_DIM = 1024
const PREVIEW_REUSE_MAX_BYTES = 200_000

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available.'))
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function txStore(db, mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function dbGet(db, id) {
  return new Promise((resolve, reject) => {
    const request = txStore(db).get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

function dbPut(db, record) {
  return new Promise((resolve, reject) => {
    const request = txStore(db, 'readwrite').put(record)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
  })
}

function dbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const request = txStore(db, 'readwrite').delete(id)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
  })
}

export function createImageAssetId(prefix = 'img') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// ─── Blob <-> data URL helpers ────────────────────────────────────

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl ?? '')
  if (!match) throw new Error('Not a base64 data URL.')
  const mime = match[1]
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// createImageBitmap is the fast path; some environments (older WebViews)
// lack it or reject on certain image types, so fall back to a plain
// <img> loaded from a temporary object URL.
async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // fall through to the <img> fallback below
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to decode image.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Downscales an original image blob into a small preview blob for display.
// Always returns the ORIGINAL image's natural width/height alongside the
// preview, since that's what gets stored on the record. Reuses the original
// blob untouched when it's already small — no point re-encoding it.
async function makePreviewBlob(originalBlob) {
  const bitmap = await loadBitmap(originalBlob)
  const width = bitmap.width
  const height = bitmap.height
  const maxDim = Math.max(width, height)

  if (maxDim <= PREVIEW_MAX_DIM && originalBlob.size <= PREVIEW_REUSE_MAX_BYTES) {
    bitmap.close?.()
    return { previewBlob: originalBlob, width, height }
  }

  // Single scale factor applied to both dimensions — keeps the preview's
  // aspect ratio identical to the original's, which the PNG/PDF export path
  // relies on when it swaps a preview <img> for the original at export time.
  const scale = PREVIEW_MAX_DIM / maxDim
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  bitmap.close?.()

  let previewBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.7))
  if (!previewBlob || previewBlob.type !== 'image/webp') {
    previewBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75))
  }
  return { previewBlob: previewBlob ?? null, width, height }
}

// ─── Session-lifetime object URL cache ────────────────────────────
// Components share these URLs and never revoke them on unmount — only
// deleteImageAsset revokes + drops an entry. `inFlight` collapses
// concurrent reads/migrations of the same id into a single DB round trip.

const urlCache = new Map()   // id -> { original?: url, preview?: url }
const inFlight = new Map()   // id -> Promise<record>

function clearCachedUrls(id) {
  const cached = urlCache.get(id)
  if (!cached) return
  if (cached.original) URL.revokeObjectURL(cached.original)
  if (cached.preview && cached.preview !== cached.original) URL.revokeObjectURL(cached.preview)
  urlCache.delete(id)
}

// Reads a record, migrating legacy v1 (`dataUrl`-only) records to the v2
// blob shape in place. Concurrent callers for the same id share one promise.
function getRecord(id) {
  if (inFlight.has(id)) return inFlight.get(id)

  const promise = (async () => {
    const db = await openDb()
    const record = await dbGet(db, id)
    if (!record) return null
    if (record.blob || !record.dataUrl) return record

    const originalBlob = dataUrlToBlob(record.dataUrl)
    let previewBlob = null
    let width = 0
    let height = 0
    try {
      ;({ previewBlob, width, height } = await makePreviewBlob(originalBlob))
    } catch {
      previewBlob = null
    }
    const migrated = {
      id: record.id,
      blob: originalBlob,
      previewBlob,
      source: record.source,
      label: record.label,
      width,
      height,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    }
    try {
      await dbPut(db, migrated)
    } catch {
      // Persisting the migration failed — still hand back the migrated
      // shape in memory so this read succeeds; next read just retries.
    }
    return migrated
  })()

  inFlight.set(id, promise)
  promise.finally(() => inFlight.delete(id))
  return promise
}

export async function putImageAsset({ id = createImageAssetId(), dataUrl, blob, source = 'panel', label = '' }) {
  const originalBlob = blob instanceof Blob ? blob : (dataUrl ? dataUrlToBlob(dataUrl) : null)
  if (!originalBlob) return null

  let previewBlob = null
  let width = 0
  let height = 0
  try {
    ;({ previewBlob, width, height } = await makePreviewBlob(originalBlob))
  } catch {
    // Never lose the original over a failed preview — display falls back
    // to the original blob whenever previewBlob is null.
    previewBlob = null
  }

  const db = await openDb()
  const record = { id, blob: originalBlob, previewBlob, source, label, width, height, updatedAt: new Date().toISOString() }
  await dbPut(db, record)
  clearCachedUrls(id)
  return id
}

// Returns a display-ready object URL for the given asset, from the
// session cache when available. `'preview'` falls back to the original
// blob when no preview exists (failed generation, or legacy migration).
export async function getImageAssetUrl(id, variant = 'preview') {
  if (!id) return null
  const cached = urlCache.get(id)
  if (cached?.[variant]) return cached[variant]

  const record = await getRecord(id)
  if (!record) return null
  const blob = variant === 'preview' ? (record.previewBlob ?? record.blob) : record.blob
  if (!blob) return null

  const url = URL.createObjectURL(blob)
  const entry = urlCache.get(id) ?? {}
  entry[variant] = url
  urlCache.set(id, entry)
  return url
}

// Returns the ORIGINAL image as a data URL — used by AI-generation
// reference payloads (imageGen.js parses `data:<mime>;base64,` URLs) and by
// export/download paths that need full quality, never the compressed preview.
export async function getImageAsset(id) {
  if (!id) return null
  const record = await getRecord(id)
  if (!record) return null
  if (record.dataUrl) return record.dataUrl
  if (!record.blob) return null
  return blobToDataUrl(record.blob)
}

export async function deleteImageAsset(id) {
  if (!id) return
  clearCachedUrls(id)
  const db = await openDb()
  await dbDelete(db, id)
}

// Inline url wins, else the ORIGINAL asset as a data URL. Used by
// generation/export-download paths that need full quality.
export async function resolveImageUrl(imageUrl, imageAssetId) {
  if (imageUrl) return imageUrl
  if (!imageAssetId) return null
  return getImageAsset(imageAssetId)
}

// Inline url wins, else a display object URL for the given variant
// (default 'preview'). Used by display components.
export async function resolveDisplayUrl(imageUrl, assetId, variant = 'preview') {
  if (imageUrl) return imageUrl
  if (!assetId) return null
  return getImageAssetUrl(assetId, variant)
}

async function recordExists(id) {
  const db = await openDb()
  return Boolean(await dbGet(db, id))
}

function isInlineDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:')
}

export async function migrateProjectImagesToAssets(project) {
  if (!project) return project
  let next = { ...project }

  // Legacy inline `assets` dict: { [assetId]: dataUrl } — hydrate each into
  // IndexedDB under the exact id referenced elsewhere in the project, then
  // drop it from the returned object so raw base64 never re-enters zustand.
  if (next.assets && typeof next.assets === 'object' && !Array.isArray(next.assets)) {
    await Promise.all(Object.entries(next.assets).map(async ([assetId, dataUrl]) => {
      if (!isInlineDataUrl(dataUrl)) return
      try {
        if (await recordExists(assetId)) return
        await putImageAsset({ id: assetId, dataUrl, source: 'legacy', label: '' })
      } catch {
        // Leave it unhydrated — worst case this id resolves to nothing later.
      }
    }))
    const { assets, ...rest } = next
    next = rest
  }

  if (Array.isArray(next.pages)) {
    next = {
      ...next,
      pages: await Promise.all(next.pages.map(async page => ({
        ...page,
        panels: await Promise.all((page.panels || []).map(async panel => {
          if (!panel.imageUrl || panel.imageAssetId) return panel
          try {
            const imageAssetId = await putImageAsset({
              dataUrl: panel.imageUrl,
              source: 'panel',
              label: `${page.title || 'Page'} - panel`,
            })
            return { ...panel, imageUrl: null, imageAssetId }
          } catch {
            return panel
          }
        })),
      }))),
    }
  }

  if (Array.isArray(next.characters)) {
    next = {
      ...next,
      characters: await Promise.all(next.characters.map(async character => {
        let updated = { ...character }

        if (isInlineDataUrl(updated.imageUrl) && !updated.imageAssetId) {
          try {
            const imageAssetId = await putImageAsset({
              dataUrl: updated.imageUrl,
              source: 'character',
              label: updated.name || 'Character',
            })
            updated = { ...updated, imageUrl: null, imageAssetId }
          } catch {
            // leave as-is
          }
        }

        if (Array.isArray(updated.images)) {
          updated = {
            ...updated,
            images: await Promise.all(updated.images.map(async img => {
              if (!isInlineDataUrl(img.imageUrl) || img.assetId) return img
              try {
                const assetId = await putImageAsset({
                  dataUrl: img.imageUrl,
                  source: 'character',
                  label: updated.name || 'Character',
                })
                return { id: img.id, assetId }
              } catch {
                return img
              }
            })),
          }
        }

        if (Array.isArray(updated.looks)) {
          updated = {
            ...updated,
            looks: await Promise.all(updated.looks.map(async look => {
              if (!isInlineDataUrl(look.imageUrl) || look.imageAssetId) return look
              try {
                const imageAssetId = await putImageAsset({
                  dataUrl: look.imageUrl,
                  source: 'character',
                  label: `${updated.name || 'Character'} - ${look.name || 'Look'}`,
                })
                return { ...look, imageUrl: null, imageAssetId }
              } catch {
                return look
              }
            })),
          }
        }

        return updated
      })),
    }
  }

  if (Array.isArray(next.styleReferences)) {
    next = {
      ...next,
      styleReferences: await Promise.all(next.styleReferences.map(async ref => {
        if (!isInlineDataUrl(ref.url) || ref.assetId) return ref
        try {
          const assetId = await putImageAsset({
            dataUrl: ref.url,
            source: 'style',
            label: ref.name || 'Style reference',
          })
          return { ...ref, url: null, assetId }
        } catch {
          return ref
        }
      })),
    }
  }

  if (Array.isArray(next.projectImages)) {
    next = {
      ...next,
      projectImages: await Promise.all(next.projectImages.map(async image => {
        if (!isInlineDataUrl(image.imageUrl) || image.imageAssetId) return image
        try {
          const imageAssetId = await putImageAsset({
            dataUrl: image.imageUrl,
            source: 'project',
            label: image.name || 'Project image',
          })
          return { ...image, imageUrl: null, imageAssetId }
        } catch {
          return image
        }
      })),
    }
  }

  return next
}
