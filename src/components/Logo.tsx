interface LogoProps {
  size?: number
  /** Fond du squircle (défaut indigo de marque). */
  bg?: string
  /** Couleur de la marque Q-Question (défaut blanc). */
  fg?: string
  /** Sans fond : marque seule, tracé en `fg`. */
  bare?: boolean
  style?: React.CSSProperties
}

/** Logo QDQ officiel (handoff agence) — squircle indigo + Q-Question blanc. */
export const Logo = ({ size = 48, bg = '#4F46E5', fg = '#FFFFFF', bare = false, style }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="QDQ" style={style}>
    {!bare && <rect width="1024" height="1024" rx="224" fill={bg} />}
    <path
      d="M512 250c-142 0-246 99-246 238s104 238 246 238c28 0 55-4 80-13l82 88c16 17 44 6 44-17v-80c28-22 50-51 65-85 14-36 22-80 22-131 0-139-151-238-293-238Zm0 104c83 0 141 55 141 134 0 80-58 135-141 135s-141-55-141-135c0-79 58-134 141-134Z"
      fill={fg}
    />
  </svg>
)

/** Wordmark horizontal officiel — « QDQ » indigo + flèche menthe.
 *  Pour fonds sombres, passer `fill` (couleur du texte) en blanc. */
export const Wordmark = ({ height = 28, fill = '#4F46E5', style }: { height?: number; fill?: string; style?: React.CSSProperties }) => (
  <svg height={height} viewBox="0 0 640 180" role="img" aria-label="QDQ — Qui Dépense Quoi" style={style}>
    <text x="24" y="122" fontFamily="Inter, Arial, sans-serif" fontSize="116" fontWeight="800" fill={fill}>QDQ</text>
    <path d="M352 58h66l-24-24 12-12 45 45-45 45-12-12 24-24h-66V58Z" fill="#10E8C0" />
  </svg>
)
