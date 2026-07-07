// Génère les icônes PNG à partir du logo QDQ premium (Q-Question lustré).
// Icône : squircle indigo dégradé + reflet + glyphe blanc lissé. Usage : node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

const glyph = (fg = '#fff') => `
  <g fill="none" stroke="${fg}" stroke-width="20" stroke-linecap="round"><circle cx="120" cy="104" r="46"/><path d="M120 150 C 150 158, 158 138, 150 122"/></g>
  <circle cx="120" cy="188" r="13" fill="${fg}"/>`

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#4338CA"/></linearGradient>
  <radialGradient id="gl" cx="0.5" cy="0.28" r="0.72"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`

// Squircle arrondi (coins transparents).
const squircle = () => `<svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">${defs}
  <rect x="16" y="16" width="208" height="208" rx="60" fill="url(#bg)"/>
  <rect x="16" y="16" width="208" height="208" rx="60" fill="url(#gl)"/>${glyph()}</svg>`

// Maskable : fond plein cadre + glyphe réduit dans la zone de sécurité.
const maskable = () => `<svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">${defs}
  <rect width="240" height="240" fill="url(#bg)"/><rect width="240" height="240" fill="url(#gl)"/>
  <g transform="translate(120,120) scale(0.8) translate(-120,-120)">${glyph()}</g></svg>`

const png = (svg, size, out) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(iconsDir, out))

await Promise.all([
  png(squircle(), 192, 'icon-192.png'),
  png(squircle(), 512, 'icon-512.png'),
  png(maskable(), 512, 'icon-maskable-512.png'),
  png(squircle(), 180, 'apple-touch-icon.png'),
  png(squircle(), 32, 'favicon-32.png'),
  png(squircle(), 16, 'favicon-16.png'),
])

console.log('Icônes générées dans public/icons/ (logo premium indigo lustré)')
