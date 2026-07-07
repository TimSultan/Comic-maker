const DB_NAME = 'comic-maker-assets'
const DB_VERSION = 1
const STORE_NAME = 'images'

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

export function createImageAssetId(prefix = 'img') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export async function putImageAsset({ id = createImageAssetId(), dataUrl, source = 'panel', label = '' }) {
  if (!dataUrl) return null
  const db = await openDb()
  const record = { id, dataUrl, source, label, updatedAt: new Date().toISOString() }
  await new Promise((resolve, reject) => {
    const request = txStore(db, 'readwrite').put(record)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
  })
  return id
}

export async function getImageAsset(id) {
  if (!id) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = txStore(db).get(id)
    request.onsuccess = () => resolve(request.result?.dataUrl ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteImageAsset(id) {
  if (!id) return
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const request = txStore(db, 'readwrite').delete(id)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
  })
}

export async function resolveImageUrl(imageUrl, imageAssetId) {
  if (imageUrl) return imageUrl
  if (!imageAssetId) return null
  return getImageAsset(imageAssetId)
}

export async function migrateProjectImagesToAssets(project) {
  if (!project?.pages) return project
  const next = {
    ...project,
    pages: await Promise.all(project.pages.map(async page => ({
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
  return next
}
