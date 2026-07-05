// Génère toutes les icônes PNG à partir du logo QDQ (concept Q-Question, variante menthe).
// Usage : node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

const BG = '#10E8C0'
const FG = '#0D1B3E'

// Marque centrée sur une toile 512 (réutilisée à toutes les échelles).
const mark = (stroke = 38) => `
  <g fill="none" stroke="${FG}" stroke-width="${stroke}" stroke-linecap="round">
    <circle cx="256" cy="196" r="92"/>
    <path d="M256,288 q74,20 74,-54"/>
  </g>
  <circle cx="256" cy="356" r="30" fill="${FG}"/>`

// Icône arrondie (squircle) — corners transparents.
const squircle = (stroke) => `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="${BG}"/>${mark(stroke)}</svg>`

// Version maskable : fond plein cadre, marque réduite dans la zone de sécurité.
const maskable = () => `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(256,256) scale(0.72) translate(-256,-256)">${mark(38)}</g></svg>`

const png = (svg, size, out) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(iconsDir, out))

await Promise.all([
  png(squircle(38), 192, 'icon-192.png'),
  png(squircle(38), 512, 'icon-512.png'),
  png(maskable(), 512, 'icon-maskable-512.png'),
  png(squircle(40), 180, 'apple-touch-icon.png'),
  png(squircle(46), 32, 'favicon-32.png'),
  png(squircle(54), 16, 'favicon-16.png'),
])

console.log('Icônes générées dans public/icons/')
