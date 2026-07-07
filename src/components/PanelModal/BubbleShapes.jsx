import React, { useLayoutEffect, useRef, useState } from 'react'

// Text never shrinks past this, no matter how small the bubble or how long
// the text — matches the floor of the manual "Font" size slider.
const AUTO_FIT_MIN_FONT_SIZE = 8

// Shrinks font size (from the bubble's preferred/typed size) until the text
// no longer overflows its box, so authors don't have to hand-tune font size
// every time a bubble is a bit small for its text. `layoutKey` bundles every
// input that can change how the text wraps — changing it re-attempts the
// preferred size first (e.g. after widening the bubble) before shrinking again.
function useAutoFitFontSize(textRef, preferredSize, layoutKey) {
  const [size, setSize] = useState(preferredSize)

  useLayoutEffect(() => {
    setSize(preferredSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredSize, layoutKey])

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || size <= AUTO_FIT_MIN_FONT_SIZE) return
    const overflowing = el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5
    if (overflowing) setSize(prev => Math.max(AUTO_FIT_MIN_FONT_SIZE, prev - 1))
  })

  return size
}

const PRESET_DEFAULTS = {
  'classic-comic': {
    type: 'speech',
    shape: 'rounded',
    tail: { enabled: true, side: 'bottom-left', targetX: 18, targetY: 94, bend: -10, baseWidth: 16 },
    typography: { fontSize: 13, weight: 800, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#111111', strokeWidth: 3 },
  },
  'manga-dialogue': {
    type: 'speech',
    shape: 'oval',
    tail: { enabled: true, side: 'bottom-right', targetX: 82, targetY: 94, bend: 10, baseWidth: 16 },
    typography: { fontSize: 13, weight: 700, uppercase: false, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#111111', strokeWidth: 2.5 },
  },
  'thought-soft': {
    type: 'thought',
    shape: 'thought',
    tail: { enabled: true, side: 'bottom-left', targetX: 18, targetY: 94, bend: -8, baseWidth: 14 },
    typography: { fontSize: 12, weight: 600, uppercase: false, italic: true, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#444444', strokeWidth: 2.5 },
  },
  'shout-burst': {
    type: 'shout',
    shape: 'burst',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 16 },
    typography: { fontSize: 14, weight: 900, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#000000', strokeWidth: 3 },
  },
  'whisper-dashed': {
    type: 'whisper',
    shape: 'whisper',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 11, weight: 500, uppercase: false, italic: true, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#777777', strokeWidth: 2 },
  },
  'caption-box': {
    type: 'caption',
    shape: 'caption',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 11, weight: 700, uppercase: false, italic: false, align: 'left', fontSizeLocked: false },
    appearance: { fill: '#f8e7a0', stroke: '#111111', strokeWidth: 2 },
  },
  'narration-box': {
    type: 'narration',
    shape: 'caption',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 11, weight: 600, uppercase: false, italic: true, align: 'left', fontSizeLocked: false },
    appearance: { fill: '#fef3c7', stroke: '#78350f', strokeWidth: 2 },
  },
  'radio-electric': {
    type: 'speech',
    shape: 'radio',
    tail: { enabled: true, side: 'bottom-right', targetX: 80, targetY: 94, bend: 8, baseWidth: 14 },
    typography: { fontSize: 12, weight: 800, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#e0f2fe', stroke: '#0f172a', strokeWidth: 2.5 },
  },
  'sfx-impact': {
    type: 'sfx',
    shape: 'sfx',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 22, weight: 900, uppercase: true, italic: true, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#fde047', stroke: '#111111', strokeWidth: 2 },
  },
}

const TYPE_TO_PRESET = {
  speech: 'classic-comic',
  thought: 'thought-soft',
  shout: 'shout-burst',
  whisper: 'whisper-dashed',
  caption: 'caption-box',
  narration: 'narration-box',
  sfx: 'sfx-impact',
}

const BURST_POINTS = [
  '3,39 13,33 8,18 22,26 28,7 38,23 47,7 51,24 58,8 64,25 76,8',
  '78,28 94,19 88,35 98,42 90,52 98,63 87,68 93,84 78,76 73,94',
  '62,79 55,95 49,79 39,94 35,78 21,92 24,74 8,84 14,68 2,61 10,50',
].join(' ')

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function mergePreset(bubble) {
  const style = bubble?.style || TYPE_TO_PRESET[bubble?.type] || 'classic-comic'
  const preset = PRESET_DEFAULTS[style] || PRESET_DEFAULTS['classic-comic']
  return {
    ...preset,
    ...bubble,
    style,
    type: bubble?.type || preset.type,
    tail: { ...preset.tail, ...(bubble?.tail || {}) },
    typography: { ...preset.typography, ...(bubble?.typography || {}) },
    appearance: { ...preset.appearance, ...(bubble?.appearance || {}) },
  }
}

function Empty() {
  return <em style={{ opacity: 0.35, fontSize: 11, fontWeight: 400, fontStyle: 'italic' }}>empty</em>
}

function tailCurveSegment(from, target, to, tail) {
  const bend = clamp(tail?.bend ?? 0, -40, 40)
  const mx = (from[0] + to[0]) / 2
  const my = (from[1] + to[1]) / 2
  const vx = target[0] - mx
  const vy = target[1] - my
  const len = Math.hypot(vx, vy) || 1
  const nx = -vy / len
  const ny = vx / len
  const c1x = (from[0] + target[0]) / 2 + nx * bend
  const c1y = (from[1] + target[1]) / 2 + ny * bend
  const c2x = (to[0] + target[0]) / 2 + nx * bend
  const c2y = (to[1] + target[1]) / 2 + ny * bend
  return `Q ${c1x} ${c1y} ${target[0]} ${target[1]} Q ${c2x} ${c2y} ${to[0]} ${to[1]}`
}

function makeOvalPoints(count = 96) {
  const points = []
  for (let i = 0; i < count; i += 1) {
    const t = (-Math.PI / 2) + (i / count) * Math.PI * 2
    points.push([50 + Math.cos(t) * 44, 45 + Math.sin(t) * 35])
  }
  return points
}

function arcPoints(cx, cy, r, start, end, steps) {
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps
    points.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r])
  }
  return points
}

function linePoints(from, to, steps) {
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    points.push([
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ])
  }
  return points
}

function makeRoundedPoints() {
  const x = 8
  const y = 10
  const w = 84
  const h = 68
  const r = 18
  const topRight = arcPoints(x + w - r, y + r, r, -Math.PI / 2, 0, 12)
  const bottomRight = arcPoints(x + w - r, y + h - r, r, 0, Math.PI / 2, 12)
  const bottomLeft = arcPoints(x + r, y + h - r, r, Math.PI / 2, Math.PI, 12)
  const topLeft = arcPoints(x + r, y + r, r, Math.PI, Math.PI * 1.5, 12)
  return [
    ...topRight,
    ...linePoints(topRight.at(-1), bottomRight[0], 32).slice(1),
    ...bottomRight.slice(1),
    ...linePoints(bottomRight.at(-1), bottomLeft[0], 48).slice(1),
    ...bottomLeft.slice(1),
    ...linePoints(bottomLeft.at(-1), topLeft[0], 32).slice(1),
    ...topLeft.slice(1),
    ...linePoints(topLeft.at(-1), topRight[0], 48).slice(1, -1),
  ]
}

function closestPointIndex(points, target) {
  let best = 0
  let bestDist = Infinity
  points.forEach((point, idx) => {
    const dist = Math.hypot(point[0] - target[0], point[1] - target[1])
    if (dist < bestDist) {
      best = idx
      bestDist = dist
    }
  })
  return best
}

function walkBoundary(points, startIdx, distance, direction) {
  const count = points.length
  let idx = startIdx
  let remaining = Math.max(0, distance)
  while (remaining > 0) {
    const nextIdx = (idx + direction + count) % count
    const current = points[idx]
    const next = points[nextIdx]
    const segment = Math.hypot(next[0] - current[0], next[1] - current[1])
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment
      return [
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]
    }
    remaining -= segment
    idx = nextIdx
  }
  return points[idx]
}

function boundaryPath(points) {
  return `M ${points[0][0]} ${points[0][1]} ${points.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ')} Z`
}

function boundsCenter(points) {
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ]
}

function raySegmentIntersection(origin, vector, a, b) {
  const sx = b[0] - a[0]
  const sy = b[1] - a[1]
  const denom = vector[0] * sy - vector[1] * sx
  if (Math.abs(denom) < 0.0001) return null

  const ax = a[0] - origin[0]
  const ay = a[1] - origin[1]
  const t = (ax * sy - ay * sx) / denom
  const u = (ax * vector[1] - ay * vector[0]) / denom
  if (t < 0 || u < 0 || u > 1) return null

  return {
    t,
    point: [origin[0] + vector[0] * t, origin[1] + vector[1] * t],
  }
}

function autoTailBasePoint(points, target) {
  const origin = boundsCenter(points)
  let vector = [target[0] - origin[0], target[1] - origin[1]]
  if (Math.hypot(vector[0], vector[1]) < 0.001) vector = [0, 1]

  let best = null
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const hit = raySegmentIntersection(origin, vector, a, b)
    if (hit && (!best || hit.t < best.t)) best = hit
  }

  if (best) return best.point
  return points[closestPointIndex(points, target)]
}

function shapeTailPoints(shape) {
  if (shape === 'oval') return makeOvalPoints()
  return makeRoundedPoints()
}

function tailBasePoint(points, tail, target) {
  if (Number.isFinite(tail?.baseX) && Number.isFinite(tail?.baseY)) {
    return [clamp(tail.baseX, 0, 100), clamp(tail.baseY, 0, 100)]
  }
  return autoTailBasePoint(points, target)
}

function pathWithFluidTail(points, tail) {
  const target = [clamp(tail?.targetX ?? 18, -80, 180), clamp(tail?.targetY ?? 94, -80, 180)]
  const desiredBase = tailBasePoint(points, tail, target)
  const centerIdx = closestPointIndex(points, desiredBase)
  const baseHalf = clamp(tail?.baseWidth ?? 14, 4, 40) / 2
  const a = walkBoundary(points, centerIdx, baseHalf, -1)
  const b = walkBoundary(points, centerIdx, baseHalf, 1)
  const aIdx = closestPointIndex(points, a)
  const bIdx = closestPointIndex(points, b)
  const count = points.length
  const outline = []
  let idx = aIdx
  while (idx !== bIdx) {
    outline.push(points[idx])
    idx = (idx - 1 + count) % count
  }
  outline.push(points[bIdx])
  return [
    `M ${a[0]} ${a[1]}`,
    outline.map(p => `L ${p[0]} ${p[1]}`).join(' '),
    tailCurveSegment(b, target, a, tail),
    'Z',
  ].join(' ')
}

function roundedPath(tailEnabled, tail) {
  const points = makeRoundedPoints()
  return tailEnabled ? pathWithFluidTail(points, tail) : boundaryPath(points)
}

function ovalPath(tailEnabled, tail) {
  const points = makeOvalPoints()
  return tailEnabled ? pathWithFluidTail(points, tail) : boundaryPath(points)
}

export function getBubbleTailBasePoint(bubble) {
  const normalized = mergePreset(bubble || {})
  const target = [clamp(normalized.tail?.targetX ?? 18, -80, 180), clamp(normalized.tail?.targetY ?? 94, -80, 180)]
  const points = shapeTailPoints(normalized.shape)
  return tailBasePoint(points, normalized.tail, target)
}

function BalloonSvg({ bubble }) {
  const { appearance, tail, shape } = bubble
  const fill = appearance.fill
  const stroke = appearance.stroke
  const strokeWidth = appearance.strokeWidth
  const tailEnabled = tail?.enabled && !['caption', 'burst', 'whisper', 'sfx'].includes(shape)

  if (shape === 'sfx') return null

  if (shape === 'burst') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <polygon points={BURST_POINTS} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'caption') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <path d="M 3 8 H 97 V 92 H 3 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <path d="M 7 14 H 93" stroke="rgba(0,0,0,0.18)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'thought') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <ellipse cx="50" cy="42" rx="43" ry="31" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {tail?.enabled && (
          <>
            <circle cx={clamp(tail.targetX ?? 20, 6, 94)} cy={clamp(tail.targetY ?? 91, 8, 96)} r="4.8" fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <circle cx={clamp((tail.targetX ?? 20) + 8, 8, 95)} cy={clamp((tail.targetY ?? 91) - 8, 8, 96)} r="3.3" fill={fill} stroke={stroke} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
            <circle cx={clamp((tail.targetX ?? 20) + 14, 8, 95)} cy={clamp((tail.targetY ?? 91) - 15, 8, 96)} r="2.3" fill={fill} stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    )
  }

  if (shape === 'whisper') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <ellipse cx="50" cy="50" rx="45" ry="35" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'radio') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <path d={roundedPath(tailEnabled, tail)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M 18 25 H 82 M 18 66 H 82" stroke="rgba(15,23,42,0.35)" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'oval') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <path d={ovalPath(tailEnabled, tail)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
      <path d={roundedPath(tailEnabled, tail)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const svgStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
}

function textPadding(shape) {
  if (shape === 'sfx') return '0'
  if (shape === 'burst') return '18px 22px'
  if (shape === 'caption') return '8px 11px'
  if (shape === 'thought') return '13px 18px 24px'
  if (shape === 'whisper') return '10px 16px'
  return '12px 16px 23px'
}

function minHeight(shape) {
  if (shape === 'sfx') return 28
  if (shape === 'caption') return 34
  if (shape === 'burst') return 68
  return 54
}

function textStyle(bubble, fontSizeOverride) {
  const { typography, appearance, shape } = bubble
  const textColor = shape === 'sfx' ? appearance.fill : '#111111'
  const explicitHeight = bubble.height != null
  return {
    position: 'relative',
    zIndex: 1,
    minHeight: explicitHeight ? '100%' : minHeight(shape),
    height: explicitHeight ? '100%' : undefined,
    padding: textPadding(shape),
    display: 'flex',
    alignItems: 'center',
    justifyContent: typography.align === 'left' ? 'flex-start' : typography.align === 'right' ? 'flex-end' : 'center',
    textAlign: typography.align || 'center',
    color: textColor,
    fontFamily: '"Trebuchet MS", "Comic Sans MS", "Arial Black", sans-serif',
    fontSize: fontSizeOverride ?? typography.fontSize,
    fontWeight: typography.weight,
    fontStyle: typography.italic ? 'italic' : 'normal',
    lineHeight: shape === 'sfx' ? 0.95 : 1.12,
    letterSpacing: 0,
    textTransform: typography.uppercase ? 'uppercase' : 'none',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
    WebkitTextStroke: shape === 'sfx' ? `${appearance.strokeWidth}px ${appearance.stroke}` : undefined,
    filter: shape === 'sfx' ? 'drop-shadow(2px 2px 0 rgba(0,0,0,0.35))' : undefined,
  }
}

export function BubbleShape({ bubble, type, text }) {
  const normalized = mergePreset(bubble || { type, text })
  const value = normalized.text || text || ''
  const explicitHeight = normalized.height != null
  const { typography } = normalized

  const textRef = useRef(null)
  const layoutKey = [
    value, normalized.width, normalized.height, normalized.shape,
    typography.weight, typography.uppercase, typography.italic, typography.align,
  ].join('|')
  const fitFontSize = useAutoFitFontSize(textRef, typography.fontSize, layoutKey)

  return (
    <div
      style={{
        position: 'relative',
        minHeight: explicitHeight ? '100%' : minHeight(normalized.shape),
        height: explicitHeight ? '100%' : undefined,
        filter: normalized.shape === 'burst' ? 'drop-shadow(1px 1px 0 #000)' : 'drop-shadow(0 1px 0 rgba(0,0,0,0.18))',
      }}
    >
      <BalloonSvg bubble={normalized} />
      <div ref={textRef} style={textStyle(normalized, fitFontSize)}>
        {value ? value : <Empty />}
      </div>
    </div>
  )
}

export function getBubblePresetDefaults(style) {
  return PRESET_DEFAULTS[style] || PRESET_DEFAULTS['classic-comic']
}
