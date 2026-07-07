import React, { useEffect, useState } from 'react'
import { resolveImageUrl } from '../utils/imageStore'

export default function StoredImage({ src, assetId = null, alt = '', className = '', style, ...props }) {
  const [resolvedSrc, setResolvedSrc] = useState(src || null)

  useEffect(() => {
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

  if (!resolvedSrc) return null
  return <img src={resolvedSrc} alt={alt} className={className} style={style} {...props} />
}
