interface LogoProps {
  size?: number
  /** Couleur de fond du squircle (défaut menthe de marque). */
  bg?: string
  /** Couleur de la marque Q-Question (défaut navy). */
  fg?: string
  /** Sans fond : marque seule, trait en `fg`. */
  bare?: boolean
  style?: React.CSSProperties
}

/** Logo QDQ — concept « Q-Question » (le Q dont la queue forme un point d'interrogation). */
export const Logo = ({ size = 48, bg = '#10E8C0', fg = '#0D1B3E', bare = false, style }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="QDQ" style={style}>
    {!bare && <rect width="512" height="512" rx="120" fill={bg} />}
    <g fill="none" stroke={fg} strokeWidth={38} strokeLinecap="round">
      <circle cx="256" cy="196" r="92" />
      <path d="M256,288 q74,20 74,-54" />
    </g>
    <circle cx="256" cy="356" r="30" fill={fg} />
  </svg>
)
