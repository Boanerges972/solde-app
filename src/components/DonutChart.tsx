interface Segment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: Segment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerSub?: string
}

export const DonutChart = ({ segments, size = 180, thickness = 28, centerLabel, centerSub }: DonutChartProps) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const GAP = 0.015 // gap between segments in radians

  // Build arcs
  let cumAngle = -Math.PI / 2 // start at top
  const arcs = segments.map(seg => {
    const fraction = seg.value / total
    const angle = fraction * 2 * Math.PI - GAP
    const startAngle = cumAngle
    const endAngle = cumAngle + angle
    cumAngle += fraction * 2 * Math.PI

    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0

    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
    return { ...seg, path, fraction }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={arc.path}
          fill="none"
          stroke={arc.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          opacity={0.9}
        />
      ))}
      {/* Center text */}
      {centerLabel && (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
            fontSize="18" fontWeight="700" fill="currentColor"
            fontFamily="Inter, -apple-system, sans-serif">
            {centerLabel}
          </text>
          {centerSub && (
            <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fill="currentColor" opacity="0.5"
              fontFamily="Inter, -apple-system, sans-serif">
              {centerSub}
            </text>
          )}
        </>
      )}
    </svg>
  )
}
