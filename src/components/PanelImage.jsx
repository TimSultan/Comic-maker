import React, { useCallback, useEffect, useRef, useState } from 'react'
import { resolveImageUrl } from '../utils/imageStore'

export default function PanelImage({ src, assetId = null, offsetX = 0, offsetY = 0, scale = 1, alt = '' }) {
  const frameRef = useRef(null)
  const imgRef = useRef(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [resolvedSrc, setResolvedSrc] = useState(src || null)

  const updateNaturalSize = useCallback((img) => {
    if (!img?.naturalWidth || !img?.naturalHeight) return
    setNaturalSize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined

    const updateSize = () => {
      const rect = frame.getBoundingClientRect()
      setFrameSize({ width: rect.width, height: rect.height })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 })
    setResolvedSrc(src || null)
    let cancelled = false
    resolveImageUrl(src, assetId)
      .then(url => {
        if (!cancelled) setResolvedSrc(url)
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(src || null)
      })
    return () => {
      cancelled = true
    }
  }, [src, assetId])

  useEffect(() => {
    if (!resolvedSrc) return undefined

    let cancelled = false
    setNaturalSize({ width: 0, height: 0 })

    const preload = new Image()
    preload.onload = () => {
      if (!cancelled) updateNaturalSize(preload)
    }
    preload.src = resolvedSrc
    if (preload.complete) updateNaturalSize(preload)

    const renderedImg = imgRef.current
    if (renderedImg?.complete) updateNaturalSize(renderedImg)

    return () => {
      cancelled = true
      preload.onload = null
    }
  }, [resolvedSrc, updateNaturalSize])

  if (!resolvedSrc) return null

  const ready =
    frameSize.width > 0 &&
    frameSize.height > 0 &&
    naturalSize.width > 0 &&
    naturalSize.height > 0

  let imageStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    userSelect: 'none',
    pointerEvents: 'none',
  }

  if (ready) {
    const safeScale = Number.isFinite(scale) ? scale : 1
    const coverScale = Math.max(
      frameSize.width / naturalSize.width,
      frameSize.height / naturalSize.height,
    )
    const displayWidth = naturalSize.width * coverScale * safeScale
    const displayHeight = naturalSize.height * coverScale * safeScale

    imageStyle = {
      ...imageStyle,
      inset: 'auto',
      left: (frameSize.width - displayWidth) / 2 + (offsetX / 100) * frameSize.width,
      top: (frameSize.height - displayHeight) / 2 + (offsetY / 100) * frameSize.height,
      width: displayWidth,
      height: displayHeight,
      objectFit: 'fill',
      maxWidth: 'none',
      maxHeight: 'none',
    }
  }

  return (
    <div ref={frameRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <img
        ref={imgRef}
        key={resolvedSrc}
        src={resolvedSrc}
        alt={alt}
        draggable={false}
        style={imageStyle}
        onLoad={e => updateNaturalSize(e.currentTarget)}
      />
    </div>
  )
}
