// Only data: URLs can be force-downloaded reliably via the `download`
// attribute — a cross-origin hosted URL (the rare OpenAI url-only fallback)
// would just navigate/open in a new tab instead, so skip those silently.
export function downloadDataUrlImage(dataUrl, filename) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
