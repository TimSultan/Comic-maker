import React, { useEffect, useState } from 'react'
import { resolveDisplayUrl } from '../utils/imageStore'

export default function StoredImage({ src, assetId = null, variant = 'preview', alt = '', className = '', style, ...props }) {
  const [resolvedSrc, setResolvedSrc] = useState(src || null)

  useEffect(() => {
    let cancelled = false
    resolveDisplayUrl(src, assetId, variant)
      .then(url => {
        if (!cancelled) setResolvedSrc(url)
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(src || null)
      })
    return () => {
      cancelled = true
    }
  }, [src, assetId, variant])

  if (!resolvedSrc) return null
  return <img src={resolvedSrc} alt={alt} className={className} style={style} {...props} />
}
