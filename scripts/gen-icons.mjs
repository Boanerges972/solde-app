// Génère toutes les icônes PNG à partir du logo QDQ officiel (handoff agence).
// Icône : squircle indigo #4F46E5 + Q-Question blanc. Usage : node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

const BG = '#4F46E5' // indigo de marque
const FG = '#FFFFFF'

// Tracé officiel du Q-Question (viewBox 1024, handoff agence).
const qPath = 'M512 250c-142 0-246 99-246 238s104 238 246 238c28 0 55-4 80-13l82 88c16 17 44 6 44-17v-80c28-22 50-51 65-85 14-36 22-80 22-131 0-139-151-238-293-238Zm0 104c83 0 141 55 141 134 0 80-58 135-141 135s-141-55-141-135c0-79 58-134 141-134Z'

// Icône arrondie (squircle), corners transparents.
const squircle = () => `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="224" fill="${BG}"/><path d="${qPath}" fill="${FG}"/></svg>`

// Version maskable : fond plein cadre, marque réduite dans la zone de sécurité.
const maskable = () => `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${BG}"/>
  <g transform="translate(512,512) scale(0.78) translate(-512,-512)"><path d="${qPath}" fill="${FG}"/></g></svg>`

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

console.log('Icônes générées dans public/icons/ (logo officiel indigo)')
