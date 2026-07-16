// ── PIN & biometric helpers ──────────────────────────────────
//
// CE QUE CE CODE N'EST PAS : une frontière de sécurité. Un code à 4 chiffres
// (10 000 possibilités) dont l'empreinte est stockée sur l'appareil ne résiste
// pas à quelqu'un qui a l'appareil déverrouillé et les devtools : il lit le
// localStorage et attaque l'empreinte HORS LIGNE, où aucune limitation
// d'essais ne s'applique. C'est un verrou d'interface (regard indiscret).
// La vraie protection est la biométrie/WebAuthn plus bas.
//
// Ce que ce module apporte malgré tout :
//  - PBKDF2-HMAC-SHA256 + sel ALÉATOIRE par appareil : l'attaque hors ligne
//    passe d'instantanée (SHA-256 : les 10 000 codes en une fraction de
//    seconde) à des dizaines de minutes, et le sel fixe 'qdq-v1' — commun à
//    TOUS les utilisateurs, donc pré-calculable une fois pour toutes — a
//    disparu.
//  - limitation d'essais persistée : coupe le forçage via l'interface.
//  - comparaison à temps constant.
//  - migration transparente de l'ancienne empreinte.

const PIN_REC = 'qdq-pin-v2'      // { v, salt, iter, hash }
const LEGACY_HASH = 'qdq-pin-hash' // ancien schéma SHA-256 + sel fixe
const LOCK_REC = 'qdq-pin-lock'   // { fails, until }

/** Compromis : ~300 ms sur un mobile correct. Monter plus haut n'achète que
 *  peu face à un espace de 10^4 codes, mais coûte à chaque déverrouillage. */
const ITERATIONS = 310_000
const MAX_FAILS = 5
/** Verrou progressif à partir du MAX_FAILS-ième échec. */
const LOCK_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000]

interface PinRecord { v: 2; salt: string; iter: number; hash: string }
interface LockRecord { fails: number; until: number }

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: iter, hash: 'SHA-256' }, key, 256)
  return toB64(new Uint8Array(bits))
}

/** Comparaison à temps constant : ne fuite pas la longueur du préfixe correct. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Ancien schéma — conservé UNIQUEMENT pour migrer les empreintes existantes. */
async function legacyHash(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'qdq-v1'))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function savePin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const rec: PinRecord = { v: 2, salt: toB64(salt), iter: ITERATIONS, hash: await derive(pin, salt, ITERATIONS) }
  localStorage.setItem(PIN_REC, JSON.stringify(rec))
  localStorage.removeItem(LEGACY_HASH) // ne pas laisser traîner l'empreinte faible
  localStorage.removeItem(LOCK_REC)
  localStorage.setItem('qdq-pin-enabled', '1')
}

/** Millisecondes avant de pouvoir réessayer (0 = déverrouillé). */
export function pinLockMsRemaining(): number {
  try {
    const raw = localStorage.getItem(LOCK_REC)
    if (!raw) return 0
    return Math.max(0, ((JSON.parse(raw) as LockRecord).until ?? 0) - Date.now())
  } catch { return 0 }
}

function registerFailure(): void {
  let fails = 0
  try { fails = (JSON.parse(localStorage.getItem(LOCK_REC) || '{}') as LockRecord).fails ?? 0 } catch { /* rec illisible */ }
  fails++
  const until = fails >= MAX_FAILS
    ? Date.now() + LOCK_MS[Math.min(fails - MAX_FAILS, LOCK_MS.length - 1)]
    : 0
  localStorage.setItem(LOCK_REC, JSON.stringify({ fails, until } as LockRecord))
}

export async function checkPin(pin: string): Promise<boolean> {
  if (pinLockMsRemaining() > 0) return false

  let ok = false
  const raw = localStorage.getItem(PIN_REC)
  if (raw) {
    try {
      const rec = JSON.parse(raw) as PinRecord
      ok = timingSafeEqual(await derive(pin, fromB64(rec.salt), rec.iter), rec.hash)
    } catch { ok = false }
  } else {
    // Migration transparente : empreinte de l'ancien schéma. On vérifie avec
    // lui, puis on ré-enregistre aussitôt au nouveau — l'utilisateur ne voit
    // rien et son ancienne empreinte faible est supprimée.
    const legacy = localStorage.getItem(LEGACY_HASH)
    if (legacy) {
      ok = timingSafeEqual(await legacyHash(pin), legacy)
      if (ok) await savePin(pin)
    }
  }

  if (ok) localStorage.removeItem(LOCK_REC)
  else registerFailure()
  return ok
}

export function clearPin(): void {
  ;[PIN_REC, LEGACY_HASH, LOCK_REC, 'qdq-pin-enabled', 'qdq-bio-enabled', 'qdq-biometric-credid']
    .forEach(k => localStorage.removeItem(k))
}

export async function bioAvailable(): Promise<boolean> {
  try {
    return !!(await (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export async function registerBiometric(uid: string): Promise<boolean> {
  const chal = crypto.getRandomValues(new Uint8Array(32))
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: chal,
      rp: { name: 'QDQ', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(uid || 'qdq-user'),
        name: 'QDQ',
        displayName: 'QDQ',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential
  localStorage.setItem(
    'qdq-biometric-credid',
    btoa(String.fromCharCode(...new Uint8Array(cred.rawId)))
  )
  localStorage.setItem('qdq-bio-enabled', '1')
  return true
}

export async function authenticateBiometric(): Promise<boolean> {
  const s = localStorage.getItem('qdq-biometric-credid')
  if (!s) return false
  const credId = Uint8Array.from(atob(s), c => c.charCodeAt(0))
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  return true
}
