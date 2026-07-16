import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { savePin, checkPin, clearPin, pinLockMsRemaining } from '../pin'

const PIN_REC = 'qdq-pin-v2'
const LEGACY_HASH = 'qdq-pin-hash'
const LOCK_REC = 'qdq-pin-lock'

/** Reproduit l'ANCIEN schéma (SHA-256 + sel fixe) pour tester la migration. */
async function legacyHash(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'qdq-v1'))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('pin — enregistrement et vérification', () => {
  it('accepte le bon code, refuse les autres', async () => {
    await savePin('1234')
    expect(await checkPin('1234')).toBe(true)
    expect(await checkPin('1235')).toBe(false)
  })

  it('sel ALÉATOIRE : deux appareils avec le MÊME code ont des empreintes différentes', async () => {
    // L'ancien sel 'qdq-v1' était commun à tous : une table précalculée une
    // fois cassait tout le monde.
    await savePin('1234')
    const a = localStorage.getItem(PIN_REC)!
    localStorage.clear()
    await savePin('1234')
    const b = localStorage.getItem(PIN_REC)!
    expect(JSON.parse(a).salt).not.toBe(JSON.parse(b).salt)
    expect(JSON.parse(a).hash).not.toBe(JSON.parse(b).hash)
  })

  it('n\'écrit jamais le code en clair', async () => {
    await savePin('1234')
    expect(JSON.stringify(localStorage)).not.toContain('1234')
  })

  it('utilise PBKDF2 avec un nombre d\'itérations élevé', async () => {
    await savePin('1234')
    const rec = JSON.parse(localStorage.getItem(PIN_REC)!)
    expect(rec.iter).toBeGreaterThanOrEqual(100_000)
  })
})

describe('pin — migration depuis l\'ancien schéma', () => {
  it('accepte un code enregistré avec l\'ancienne empreinte', async () => {
    localStorage.setItem(LEGACY_HASH, await legacyHash('4321'))
    localStorage.setItem('qdq-pin-enabled', '1')
    expect(await checkPin('4321')).toBe(true)
  })

  it('ré-enregistre au nouveau format et SUPPRIME l\'empreinte faible', async () => {
    localStorage.setItem(LEGACY_HASH, await legacyHash('4321'))
    await checkPin('4321')
    expect(localStorage.getItem(PIN_REC)).toBeTruthy()
    expect(localStorage.getItem(LEGACY_HASH)).toBeNull()
    // Et le code fonctionne toujours après migration.
    expect(await checkPin('4321')).toBe(true)
  })

  it('un mauvais code ne déclenche pas la migration', async () => {
    localStorage.setItem(LEGACY_HASH, await legacyHash('4321'))
    expect(await checkPin('0000')).toBe(false)
    expect(localStorage.getItem(LEGACY_HASH)).toBeTruthy()
    expect(localStorage.getItem(PIN_REC)).toBeNull()
  })
})

describe('pin — limitation des essais', () => {
  it('verrouille après 5 échecs et refuse même le BON code', async () => {
    await savePin('1234')
    for (let i = 0; i < 5; i++) expect(await checkPin('0000')).toBe(false)
    expect(pinLockMsRemaining()).toBeGreaterThan(0)
    expect(await checkPin('1234')).toBe(false) // verrouillé
  })

  it('le verrou expire et le bon code repasse', async () => {
    await savePin('1234')
    for (let i = 0; i < 5; i++) await checkPin('0000')
    // Simule l'expiration du verrou.
    const lock = JSON.parse(localStorage.getItem(LOCK_REC)!)
    localStorage.setItem(LOCK_REC, JSON.stringify({ ...lock, until: Date.now() - 1 }))
    expect(pinLockMsRemaining()).toBe(0)
    expect(await checkPin('1234')).toBe(true)
  })

  it('un succès remet le compteur d\'échecs à zéro', async () => {
    await savePin('1234')
    await checkPin('0000'); await checkPin('0000')
    expect(await checkPin('1234')).toBe(true)
    expect(localStorage.getItem(LOCK_REC)).toBeNull()
  })

  it('le verrou s\'allonge aux échecs suivants', async () => {
    await savePin('1234')
    for (let i = 0; i < 5; i++) await checkPin('0000')
    const first = pinLockMsRemaining()
    // Débloque puis rate encore : la sanction doit croître.
    const l = JSON.parse(localStorage.getItem(LOCK_REC)!)
    localStorage.setItem(LOCK_REC, JSON.stringify({ ...l, until: Date.now() - 1 }))
    await checkPin('0000')
    expect(pinLockMsRemaining()).toBeGreaterThan(first)
  })

  it('le verrou survit à un rechargement (il est persisté)', async () => {
    await savePin('1234')
    for (let i = 0; i < 5; i++) await checkPin('0000')
    // Un rechargement ne fait que relire le localStorage.
    expect(pinLockMsRemaining()).toBeGreaterThan(0)
  })
})

describe('pin — clearPin', () => {
  it('efface empreintes, verrou et drapeaux', async () => {
    await savePin('1234')
    await checkPin('0000')
    clearPin()
    expect(localStorage.getItem(PIN_REC)).toBeNull()
    expect(localStorage.getItem(LEGACY_HASH)).toBeNull()
    expect(localStorage.getItem(LOCK_REC)).toBeNull()
    expect(localStorage.getItem('qdq-pin-enabled')).toBeNull()
  })
})
