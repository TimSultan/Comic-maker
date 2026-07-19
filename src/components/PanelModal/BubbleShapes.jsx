import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

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

// Measures the bubble wrapper's on-screen width/height so tail geometry can
// correct for the box not being square (see the corrected-space comment on
// pathWithFluidTail). Defaults to 1 (square) until the first measurement.
function useElementAspect(ref) {
  const [aspect, setAspect] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setAspect(rect.width / rect.height)
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return aspect
}

const PRESET_DEFAULTS = {
  'classic-comic': {
    type: 'speech',
    shape: 'rounded',
    tail: { enabled: true, side: 'bottom-left', targetX: 18, targetY: 122, bend: 0, baseWidth: 16 },
    typography: { fontSize: 11, weight: 700, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#111111', strokeWidth: 3 },
  },
  'manga-dialogue': {
    type: 'speech',
    shape: 'oval',
    tail: { enabled: true, side: 'bottom-right', targetX: 82, targetY: 122, bend: 0, baseWidth: 16 },
    typography: { fontSize: 11, weight: 600, uppercase: false, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#111111', strokeWidth: 2.5 },
  },
  'thought-soft': {
    type: 'thought',
    shape: 'thought',
    tail: { enabled: true, side: 'bottom-left', targetX: 18, targetY: 118, bend: 0, baseWidth: 14 },
    typography: { fontSize: 10, weight: 600, uppercase: false, italic: true, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#444444', strokeWidth: 2.5 },
  },
  'shout-burst': {
    type: 'shout',
    shape: 'burst',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 16 },
    typography: { fontSize: 13, weight: 900, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#000000', strokeWidth: 3 },
  },
  'whisper-dashed': {
    type: 'whisper',
    shape: 'whisper',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 10, weight: 500, uppercase: false, italic: true, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#ffffff', stroke: '#777777', strokeWidth: 2 },
  },
  'caption-box': {
    type: 'caption',
    shape: 'caption',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 10, weight: 700, uppercase: false, italic: false, align: 'left', fontSizeLocked: false },
    appearance: { fill: '#f8e7a0', stroke: '#111111', strokeWidth: 2 },
  },
  'narration-box': {
    type: 'narration',
    shape: 'caption',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 10, weight: 600, uppercase: false, italic: true, align: 'left', fontSizeLocked: false },
    appearance: { fill: '#fef3c7', stroke: '#78350f', strokeWidth: 2 },
  },
  'radio-electric': {
    type: 'speech',
    shape: 'radio',
    tail: { enabled: true, side: 'bottom-right', targetX: 80, targetY: 118, bend: 0, baseWidth: 14 },
    typography: { fontSize: 11, weight: 800, uppercase: true, italic: false, align: 'center', fontSizeLocked: false },
    appearance: { fill: '#e0f2fe', stroke: '#0f172a', strokeWidth: 2.5 },
  },
  'sfx-impact': {
    type: 'sfx',
    shape: 'sfx',
    tail: { enabled: false, side: 'bottom-left', targetX: 18, targetY: 94, bend: 0, baseWidth: 12 },
    typography: { fontSize: 20, weight: 900, uppercase: true, italic: true, align: 'center', fontSizeLocked: false },
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

// Unit normal of (target - midpoint(from, to)), pointing the direction the
// tail curve bends toward. Shared by tailCurveSegment (drawing the curve)
// and the handle-geometry helpers below (positioning/dragging the curve's
// midpoint handle) so the handle always sits exactly on the drawn curve.
function tailNormal(from, target, to) {
  const mx = (from[0] + to[0]) / 2
  const my = (from[1] + to[1]) / 2
  const vx = target[0] - mx
  const vy = target[1] - my
  const len = Math.hypot(vx, vy) || 1
  return [-vy / len, vx / len]
}

function tailCurveSegment(from, target, to, tail) {
  const bend = clamp(tail?.bend ?? 0, -40, 40)
  const [nx, ny] = tailNormal(from, target, to)
  return {
    c1: [(from[0] + target[0]) / 2 + nx * bend, (from[1] + target[1]) / 2 + ny * bend],
    c2: [(to[0] + target[0]) / 2 + nx * bend, (to[1] + target[1]) / 2 + ny * bend],
  }
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

// Bubble div boxes are rarely square on screen, but the shape's outline is
// authored on a square 0-100 grid and the SVG is stretched non-uniformly
// (preserveAspectRatio="none") to fill the box. Doing tail geometry (ray
// casts, boundary walks, perpendicular bends) directly in that 0-100 space
// means angles come out wrong once stretched. "Corrected space" undoes the
// stretch — x * sqrt(aspect), y / sqrt(aspect) — so those computations are
// faithful to what actually renders on screen; sqrt(aspect) is used (rather
// than aspect) because the correction is a symmetric one-axis-up/one-axis-
// down scale, matching how a non-uniform stretch splits between both axes.
// Everything below runs on corrected points/targets and is mapped back to
// the original 0-100 (percent) space only when producing output.
function toCorrectedSpace(aspect) {
  const s = Math.sqrt(aspect) || 1
  return {
    s,
    toC: ([x, y]) => [x * s, y / s],
    fromC: ([x, y]) => [x / s, y * s],
  }
}

// Single source of truth for the tail's base/target points (in corrected
// space) given a bubble's raw shape points + tail config. Used by both the
// path builder (pathWithFluidTail) and the handle-geometry helpers exported
// below, so the draggable handles always match what's actually drawn.
function computeTailFrame(points, tail, aspect) {
  const { toC, fromC, s } = toCorrectedSpace(aspect)
  const correctedPoints = points.map(toC)
  const target = toC([clamp(tail?.targetX ?? 18, -80, 180), clamp(tail?.targetY ?? 94, -80, 180)])
  const manualBase = Number.isFinite(tail?.baseX) && Number.isFinite(tail?.baseY)
  const desiredBase = manualBase
    ? toC([clamp(tail.baseX, 0, 100), clamp(tail.baseY, 0, 100)])
    : autoTailBasePoint(correctedPoints, target)
  const centerIdx = closestPointIndex(correctedPoints, desiredBase)
  const baseHalf = clamp(tail?.baseWidth ?? 14, 4, 40) / 2
  const a = walkBoundary(correctedPoints, centerIdx, baseHalf, -1)
  const b = walkBoundary(correctedPoints, centerIdx, baseHalf, 1)
  return { s, toC, fromC, correctedPoints, target, desiredBase, automatic: !manualBase, a, b }
}

function pathWithFluidTail(points, tail, aspect = 1) {
  const { fromC, correctedPoints, target, a, b } = computeTailFrame(points, tail, aspect)
  const aIdx = closestPointIndex(correctedPoints, a)
  const bIdx = closestPointIndex(correctedPoints, b)
  const count = correctedPoints.length
  const outline = []
  let idx = aIdx
  while (idx !== bIdx) {
    outline.push(points[idx])
    idx = (idx - 1 + count) % count
  }
  outline.push(points[bIdx])

  const { c1, c2 } = tailCurveSegment(b, target, a, tail)
  const aOut = fromC(a)
  const targetOut = fromC(target)
  const c1Out = fromC(c1)
  const c2Out = fromC(c2)

  return [
    `M ${aOut[0]} ${aOut[1]}`,
    outline.map(p => `L ${p[0]} ${p[1]}`).join(' '),
    `Q ${c1Out[0]} ${c1Out[1]} ${targetOut[0]} ${targetOut[1]} Q ${c2Out[0]} ${c2Out[1]} ${aOut[0]} ${aOut[1]}`,
    'Z',
  ].join(' ')
}

function roundedPath(tailEnabled, tail, aspect = 1) {
  const points = makeRoundedPoints()
  return tailEnabled ? pathWithFluidTail(points, tail, aspect) : boundaryPath(points)
}

function ovalPath(tailEnabled, tail, aspect = 1) {
  const points = makeOvalPoints()
  return tailEnabled ? pathWithFluidTail(points, tail, aspect) : boundaryPath(points)
}

// Base/target/curve-midpoint of a bubble's tail, in bubble-% space. `mid` is
// where the curve-bend handle sits: the base-target midpoint offset by the
// bend along the same normal tailCurveSegment uses, so the handle always
// lands exactly on the drawn curve.
export function getBubbleTailGeometry(bubble, aspect = 1) {
  const normalized = mergePreset(bubble || {})
  const points = shapeTailPoints(normalized.shape)
  const tail = normalized.tail
  const { fromC, target, desiredBase, automatic, a, b } = computeTailFrame(points, tail, aspect)
  const bend = clamp(tail?.bend ?? 0, -40, 40)
  const [nx, ny] = tailNormal(b, target, a)
  const mid = [
    (desiredBase[0] + target[0]) / 2 + nx * bend,
    (desiredBase[1] + target[1]) / 2 + ny * bend,
  ]
  return {
    base: fromC(desiredBase),
    target: fromC(target),
    mid: fromC(mid),
    automatic,
  }
}

// Given a pointer position (bubble-% space), returns the `bend` value that
// would place the curve's midpoint handle there — the inverse of the `mid`
// calculation in getBubbleTailGeometry.
export function bendFromTailPoint(bubble, aspect, point) {
  const normalized = mergePreset(bubble || {})
  const points = shapeTailPoints(normalized.shape)
  const tail = normalized.tail
  const { toC, target, desiredBase, a, b } = computeTailFrame(points, tail, aspect)
  const [nx, ny] = tailNormal(b, target, a)
  const p = toC([point[0], point[1]])
  const midBaseTarget = [(desiredBase[0] + target[0]) / 2, (desiredBase[1] + target[1]) / 2]
  const bend = (p[0] - midBaseTarget[0]) * nx + (p[1] - midBaseTarget[1]) * ny
  return clamp(bend, -40, 40)
}

export function getBubbleTailBasePoint(bubble) {
  return getBubbleTailGeometry(bubble, 1).base
}

// Shadow-copy attrs shared by every shape except burst (which uses a bigger
// offset/darker fill, set inline below) and sfx (no shadow rendered at all).
// html2canvas can't render CSS filter: drop-shadow, so shadows are drawn as
// an actual offset copy of the shape behind the main path instead — see
// BubbleShape, which used to apply drop-shadow as a container filter.
const SHAPE_SHADOW_PROPS = {
  transform: 'translate(1.2 1.8)',
  fill: 'rgba(15, 23, 42, 0.22)',
  stroke: 'none',
}

// The tail can extend well past the bubble's box, so the balloon SVG lives
// on a 3x frame around it (viewBox -100..200 maps onto that frame). The
// frame must be a plain div with the svg filling it 100%: html2canvas
// exports inline SVGs by serializing them to standalone images, and in a
// standalone SVG the root's CSS percentage size resolves against the drawn
// viewport itself — any root size other than 100% rasterizes the balloon at
// the wrong scale in PNG/PDF exports.
function BalloonSvg({ bubble, aspect = 1 }) {
  const content = renderBalloonSvg(bubble, aspect)
  if (!content) return null
  return <div style={svgFrameStyle}>{content}</div>
}

function renderBalloonSvg(bubble, aspect) {
  const { appearance, tail, shape } = bubble
  const fill = appearance.fill
  const stroke = appearance.stroke
  const strokeWidth = appearance.strokeWidth
  const tailEnabled = tail?.enabled && !['caption', 'burst', 'whisper', 'sfx'].includes(shape)

  if (shape === 'sfx') return null

  if (shape === 'burst') {
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <polygon points={BURST_POINTS} transform="translate(1.6 2.2)" fill="rgba(0, 0, 0, 0.6)" stroke="none" vectorEffect="non-scaling-stroke" />
        <polygon points={BURST_POINTS} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'caption') {
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <path d="M 3 8 H 97 V 92 H 3 Z" {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
        <path d="M 3 8 H 97 V 92 H 3 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <path d="M 7 14 H 93" stroke="rgba(0,0,0,0.18)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'thought') {
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <ellipse cx="50" cy="42" rx="43" ry="31" {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
        <ellipse cx="50" cy="42" rx="43" ry="31" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {tail?.enabled && (
          <>
            <circle cx={clamp(tail.targetX ?? 20, -95, 195)} cy={clamp(tail.targetY ?? 91, -95, 195)} r="4.8" fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <circle cx={clamp((tail.targetX ?? 20) + 8, -95, 195)} cy={clamp((tail.targetY ?? 91) - 8, -95, 195)} r="3.3" fill={fill} stroke={stroke} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
            <circle cx={clamp((tail.targetX ?? 20) + 14, -95, 195)} cy={clamp((tail.targetY ?? 91) - 15, -95, 195)} r="2.3" fill={fill} stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    )
  }

  if (shape === 'whisper') {
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <ellipse cx="50" cy="50" rx="45" ry="35" {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
        <ellipse cx="50" cy="50" rx="45" ry="35" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'radio') {
    const d = roundedPath(tailEnabled, tail, aspect)
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <path d={d} {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
        <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M 18 25 H 82 M 18 66 H 82" stroke="rgba(15,23,42,0.35)" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  if (shape === 'oval') {
    const d = ovalPath(tailEnabled, tail, aspect)
    return (
      <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
        <path d={d} {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
        <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  const d = roundedPath(tailEnabled, tail, aspect)
  return (
    <svg viewBox="-100 -100 300 300" preserveAspectRatio="none" style={svgStyle}>
      <path d={d} {...SHAPE_SHADOW_PROPS} vectorEffect="non-scaling-stroke" />
      <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const svgFrameStyle = {
  position: 'absolute',
  left: '-100%',
  top: '-100%',
  width: '300%',
  height: '300%',
  pointerEvents: 'none',
}

const svgStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
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

// html2canvas doesn't render -webkit-text-stroke or filter: drop-shadow, so
// the sfx outline is faked with a ring of 12 solid text-shadows (one every
// 30°) at the stroke's radius, plus a small drop shadow — text-shadow does
// export correctly.
function sfxTextShadow(appearance) {
  const w = appearance.strokeWidth
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180
    const dx = Math.round(Math.cos(a) * w * 100) / 100
    const dy = Math.round(Math.sin(a) * w * 100) / 100
    return `${dx}px ${dy}px 0 ${appearance.stroke}`
  })
  return [...ring, '2px 3px 0 rgba(0,0,0,0.35)'].join(', ')
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
    fontFamily: '"Comic Neue", "Comic Sans MS", "Trebuchet MS", sans-serif',
    fontSize: fontSizeOverride ?? typography.fontSize,
    fontWeight: typography.weight,
    fontStyle: typography.italic ? 'italic' : 'normal',
    lineHeight: shape === 'sfx' ? 0.95 : 1.12,
    letterSpacing: 0,
    textTransform: typography.uppercase ? 'uppercase' : 'none',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
    textShadow: shape === 'sfx' ? sfxTextShadow(appearance) : undefined,
  }
}

export function BubbleShape({ bubble, type, text }) {
  const normalized = mergePreset(bubble || { type, text })
  const value = normalized.text || text || ''
  const explicitHeight = normalized.height != null
  const { typography } = normalized

  const wrapperRef = useRef(null)
  const aspect = useElementAspect(wrapperRef)

  const textRef = useRef(null)
  const layoutKey = [
    value, normalized.width, normalized.height, normalized.shape,
    typography.weight, typography.uppercase, typography.italic, typography.align,
  ].join('|')
  const fitFontSize = useAutoFitFontSize(textRef, typography.fontSize, layoutKey)

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        minHeight: explicitHeight ? '100%' : minHeight(normalized.shape),
        height: explicitHeight ? '100%' : undefined,
      }}
    >
      <BalloonSvg bubble={normalized} aspect={aspect} />
      <div ref={textRef} style={textStyle(normalized, fitFontSize)}>
        {value ? value : <Empty />}
      </div>
    </div>
  )
}

export function getBubblePresetDefaults(style) {
  return PRESET_DEFAULTS[style] || PRESET_DEFAULTS['classic-comic']
}
