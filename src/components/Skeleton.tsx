import type { Theme } from '../types'

interface SkeletonProps { w?: number | string; h?: number; r?: number; t: Theme; style?: React.CSSProperties }

export const Skeleton = ({ w = '100%', h = 16, r = 8, t, style }: SkeletonProps) => (
  <div aria-hidden style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${t.el} 25%, ${t.bo} 50%, ${t.el} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
    ...style,
  }} />
)

/** Squelette de l'écran Home pendant le chargement initial */
export const HomeSkeleton = ({ t }: { t: Theme }) => (
  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Skeleton t={t} w={140} h={22} />
    <Skeleton t={t} h={120} r={16} />
    <div style={{ display: 'flex', gap: 10 }}>
      <Skeleton t={t} h={72} r={14} />
      <Skeleton t={t} h={72} r={14} />
    </div>
    <Skeleton t={t} w={100} h={14} />
    <Skeleton t={t} h={180} r={16} />
    <Skeleton t={t} h={64} r={14} />
    <Skeleton t={t} h={64} r={14} />
  </div>
)
