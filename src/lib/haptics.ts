/** Retour haptique léger (Android/Chrome ; ignoré silencieusement sur iOS Safari). */
export function haptic(pattern: number | number[] = 8): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch { /* API absente ou bloquée : sans effet */ }
}
