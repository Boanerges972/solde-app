import { useId } from 'react'

interface LogoProps {
  size?: number
  /** Sans fond : glyphe seul (tracé en `fg`) — pour fonds sombres. */
  bare?: boolean
  /** Couleur du glyphe (défaut blanc). */
  fg?: string
  style?: React.CSSProperties
}

/** Logo QDQ « Q-Question » premium — squircle indigo lustré + glyphe blanc lissé. */
export const Logo = ({ size = 48, bare = false, fg = '#FFFFFF', style }: LogoProps) => {
  const uid = useId().replace(/:/g, '')
  const bgId = `qbg-${uid}`, glId = `qgl-${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" role="img" aria-label="QDQ" style={style}>
      {!bare && (
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6366F1" />
            <stop offset="1" stopColor="#4338CA" />
          </linearGradient>
          <radialGradient id={glId} cx="0.5" cy="0.28" r="0.72">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {!bare && <rect x="16" y="16" width="208" height="208" rx="60" fill={`url(#${bgId})`} />}
      {!bare && <rect x="16" y="16" width="208" height="208" rx="60" fill={`url(#${glId})`} />}
      <g fill="none" stroke={fg} strokeWidth="20" strokeLinecap="round">
        <circle cx="120" cy="104" r="46" />
        <path d="M120 150 C 150 158, 158 138, 150 122" />
      </g>
      <circle cx="120" cy="188" r="13" fill={fg} />
    </svg>
  )
}

/** Wordmark horizontal « QD·Q » — dernier Q en menthe. */
export const Wordmark = ({ height = 32, color = '#0F172A', style }: { height?: number; color?: string; style?: React.CSSProperties }) => (
  <span style={{ fontSize: height, fontWeight: 800, letterSpacing: -2, fontFamily: 'Inter, sans-serif', color, lineHeight: 1, ...style }}>
    QD<span style={{ color: '#10E8C0' }}>Q</span>
  </span>
)
