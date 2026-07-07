import { useState } from 'react'

interface Props {
  /** Domaine de la marque (ex. "boursorama.com"). */
  domain?: string
  /** Taille en px (carré). */
  size?: number
  /** Rendu de repli si aucun logo ne charge (emoji/initiale). */
  fallback: React.ReactNode
  rounded?: number
  style?: React.CSSProperties
}

/** Logo officiel d'une marque, chargé par domaine via CDN, avec chaîne de repli :
 *  Clearbit → favicon Google → `fallback`. Aucune donnée sensible n'est envoyée
 *  au-delà du domaine de la marque affichée. */
export const BrandIcon = ({ domain, size = 40, fallback, rounded = 11, style }: Props) => {
  const [stage, setStage] = useState(0) // 0 google · 1 duckduckgo · 2 fallback
  if (!domain || stage >= 2) {
    return (
      <div style={{ width: size, height: size, borderRadius: rounded, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>
        {fallback}
      </div>
    )
  }
  const src = stage === 0
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : `https://icons.duckduckgo.com/ip3/${domain}.ico`
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setStage(s => s + 1)}
      style={{ width: size, height: size, borderRadius: rounded, objectFit: 'contain', background: '#fff', flexShrink: 0, ...style }}
    />
  )
}

/** Domaines des banques supportées (pour l'import). */
export const BANK_DOMAIN: Record<string, string> = {
  bnp: 'mabanque.bnpparibas',
  boursorama: 'boursorama.com',
  sg: 'particuliers.societegenerale.fr',
  ca: 'credit-agricole.fr',
  lbp: 'labanquepostale.fr',
  lcl: 'lcl.fr',
  cm: 'creditmutuel.fr',
  nickel: 'nickel.eu',
  qonto: 'qonto.com',
  ofx: '',
}
