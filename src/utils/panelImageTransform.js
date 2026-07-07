// Shared pan/zoom math for panel images (used by the main canvas and the
// panel edit modal), so both stay in sync with how PanelImage renders.

export const MIN_PANEL_IMAGE_SCALE = 1
export const MAX_PANEL_IMAGE_SCALE = 4

// Keeps the offset within the range that still fully covers the frame.
// Without this, panning/zooming can push the image edge past the panel
// border and reveal the panel background — both on canvas and in exports.
export function clampPanelImageOffset({ frameWidth, frameHeight, naturalWidth, naturalHeight, scale, offsetX, offsetY }) {
  if (!frameWidth || !frameHeight || !naturalWidth || !naturalHeight) {
    return { offsetX, offsetY }
  }

  const coverScale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight)
  const safeScale = Number.isFinite(scale) ? scale : 1
  const displayWidth = naturalWidth * coverScale * safeScale
  const displayHeight = naturalHeight * coverScale * safeScale

  const maxOffsetX = Math.max(0, ((displayWidth - frameWidth) / 2 / frameWidth) * 100)
  const maxOffsetY = Math.max(0, ((displayHeight - frameHeight) / 2 / frameHeight) * 100)

  return {
    offsetX: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
    offsetY: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY)),
  }
}
