// ── PIN & biometric helpers ──────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'qdq-v1'))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem('qdq-pin-hash')
  if (!stored) return false
  return (await hashPin(pin)) === stored
}

export async function savePin(pin: string): Promise<void> {
  localStorage.setItem('qdq-pin-hash', await hashPin(pin))
  localStorage.setItem('qdq-pin-enabled', '1')
}

export function clearPin(): void {
  ;['qdq-pin-hash', 'qdq-pin-enabled', 'qdq-bio-enabled', 'qdq-biometric-credid'].forEach(k =>
    localStorage.removeItem(k)
  )
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
