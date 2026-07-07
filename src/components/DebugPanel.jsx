import React, { useEffect, useState } from 'react'
import { logEvent, describeTarget, downloadDebugLog, clearDebugLog, getDebugLog } from '../utils/debugLog'

// Temporary diagnostic overlay: logs every pointer/mouse/wheel event that
// reaches the document (capture phase, before any handler can stop it) so a
// real user session can be inspected without remote access. Safe to delete
// once the panel image pan/zoom issue is resolved.

const WATCHED_TYPES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel', 'click']

export default function DebugPanel() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    logEvent('app-mount', {
      userAgent: navigator.userAgent,
      pointerEventsSupported: typeof window.PointerEvent !== 'undefined',
    })

    const handlers = WATCHED_TYPES.map(type => {
      const handler = (e) => {
        logEvent(`global:${type}`, {
          x: e.clientX,
          y: e.clientY,
          button: e.button,
          deltaY: e.deltaY,
          target: describeTarget(e.target),
          defaultPrevented: e.defaultPrevented,
        })
        setCount(c => c + 1)
      }
      window.addEventListener(type, handler, { capture: true, passive: true })
      return { type, handler }
    })

    return () => {
      handlers.forEach(({ type, handler }) => window.removeEventListener(type, handler, true))
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 9999,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.75)',
        padding: '6px 8px',
        borderRadius: 8,
        fontSize: 11,
        color: 'white',
        fontFamily: 'monospace',
      }}
    >
      <span>debug: {count} events ({getDebugLog().length} buffered)</span>
      <button
        type="button"
        onClick={() => downloadDebugLog()}
        style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
      >
        Save Log
      </button>
      <button
        type="button"
        onClick={() => { clearDebugLog(); setCount(0) }}
        style={{ background: '#374151', color: 'white', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
      >
        Clear
      </button>
    </div>
  )
}
