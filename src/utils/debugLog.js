// Temporary diagnostic logger for tracking down the panel image pan/zoom
// issue. Records every relevant input event plus what the handlers computed,
// so a user's real browser session can be inspected without remote access.

const MAX_ENTRIES = 2000
let entries = []
let seq = 0

export function logEvent(category, data = {}) {
  seq += 1
  entries.push({ seq, t: Math.round(performance.now()), category, ...data })
  if (entries.length > MAX_ENTRIES) entries.shift()
  // eslint-disable-next-line no-console
  console.debug('[panel-debug]', seq, category, data)
}

export function describeTarget(el) {
  if (!el || el === window || el === document) return String(el)
  const tag = el.tagName ? el.tagName.toLowerCase() : String(el)
  const id = el.id ? `#${el.id}` : ''
  const cls = typeof el.className === 'string' && el.className
    ? `.${el.className.trim().split(/\s+/).join('.')}`
    : ''
  const title = el.getAttribute?.('title') ? ` title="${el.getAttribute('title')}"` : ''
  const dataAttrs = el.attributes
    ? [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => ` ${a.name}`).join('')
    : ''
  return `<${tag}${id}${cls}${title}${dataAttrs}>`
}

export function downloadDebugLog() {
  const meta = {
    userAgent: navigator.userAgent,
    url: window.location.href,
    devicePixelRatio: window.devicePixelRatio,
    generatedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify({ meta, entries }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `panel-debug-log-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function clearDebugLog() {
  entries = []
  seq = 0
}

export function getDebugLog() {
  return entries
}
