import { useState, useId } from 'react'
import { fmt } from '../lib/currency'
import type { Theme } from '../types'

interface BalanceCurveProps {
  points: { date: string; bal: number }[]
  color: string
  t: Theme
  height?: number
}

const PAD = { top: 20, right: 8, bottom: 24, left: 52 }
const W = 303 // 375 - 2×16 page padding - 2×20 card padding

export const BalanceCurve = ({ points, color, t, height = 160 }: BalanceCurveProps) => {
  const [touchIdx, setTouchIdx] = useState<number | null>(null)
  const uid = useId()

  if (points.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.sub, fontSize: 13 }}>
        Pas assez de données pour cette période
      </div>
    )
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const bals = points.map(p => p.bal)
  const minBal = Math.min(...bals)
  const maxBal = Math.max(...bals)
  const range = maxBal - minBal || 1

  const xOf = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const yOf = (bal: number) => PAD.top + (1 - (bal - minBal) / range) * innerH

  // Cubic bezier path
  const pathD = points.reduce((acc, p, i) => {
    const x = xOf(i), y = yOf(p.bal)
    if (i === 0) return `M ${x} ${y}`
    const px = xOf(i - 1), py = yOf(points[i - 1].bal)
    const cp = (x - px) * 0.4
    return `${acc} C ${px + cp} ${py}, ${x - cp} ${y}, ${x} ${y}`
  }, '')

  // Area fill path (close below the curve)
  const areaD = `${pathD} L ${xOf(points.length - 1)} ${height - PAD.bottom} L ${xOf(0)} ${height - PAD.bottom} Z`

  // Min point
  const minIdx = bals.indexOf(minBal)

  // Gridlines at 25%, 50%, 75%
  const gridBals = [0.25, 0.5, 0.75].map(r => minBal + r * range)

  // X-axis labels: 4 evenly spaced
  const xLabelIdxs = [0, Math.floor(points.length / 3), Math.floor(2 * points.length / 3), points.length - 1]

  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const touchX = e.touches[0].clientX - rect.left
    let bestIdx = 0
    let bestDist = Infinity
    points.forEach((_, i) => {
      const dist = Math.abs(xOf(i) - touchX)
      if (dist < bestDist) { bestDist = dist; bestIdx = i }
    })
    setTouchIdx(bestIdx)
  }

  const gradId = `bcGrad-${uid.replace(/:/g, '')}-${color.replace('#', '')}`
  const touchPt = touchIdx !== null ? points[touchIdx] : null

  return (
    <div style={{ position: 'relative', width: W, height }}>
      <svg
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        style={{ overflow: 'visible', touchAction: 'none' }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setTouchIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color + '33'} />
            <stop offset="100%" stopColor={color + '00'} />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {gridBals.map((bal, i) => (
          <line
            key={i}
            x1={PAD.left} y1={yOf(bal)} x2={W - PAD.right} y2={yOf(bal)}
            stroke={t.bo} strokeWidth={1} strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis labels */}
        {[minBal, minBal + range / 2, maxBal].map((bal, i) => (
          <text key={i} x={PAD.left - 4} y={yOf(bal) + 4}
            textAnchor="end" fontSize={9} fill={t.sub}
            fontFamily="system-ui, sans-serif"
          >
            {fmt(bal)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabelIdxs.map((idx, i) => (
          <text key={i} x={xOf(idx)} y={height - 4}
            textAnchor={i === 0 ? 'start' : i === xLabelIdxs.length - 1 ? 'end' : 'middle'}
            fontSize={9} fill={t.sub} fontFamily="system-ui, sans-serif"
          >
            {points[idx].date.slice(5)}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Curve */}
        <path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />

        {/* Min point */}
        <circle cx={xOf(minIdx)} cy={yOf(minBal)} r={5} fill={t.rose} />
        <text
          x={xOf(minIdx)} y={yOf(minBal) + 16}
          textAnchor="middle" fontSize={9} fill={t.rose}
          fontFamily="system-ui, sans-serif"
        >
          ★ min: {fmt(minBal)}
        </text>

        {/* Touch vertical line */}
        {touchIdx !== null && (
          <line
            x1={xOf(touchIdx)} y1={PAD.top}
            x2={xOf(touchIdx)} y2={height - PAD.bottom}
            stroke={t.sub + '66'} strokeWidth={1}
          />
        )}
      </svg>

      {/* Touch tooltip */}
      {touchPt && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(xOf(touchIdx!) - 50, 0), W - 110),
          top: Math.max(yOf(touchPt.bal) - 36, 0),
          background: t.card,
          border: '1px solid ' + t.bo,
          borderRadius: 10,
          padding: '4px 10px',
          fontSize: 12,
          color: t.tx,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {touchPt.date} · {fmt(touchPt.bal)}
        </div>
      )}
    </div>
  )
}
