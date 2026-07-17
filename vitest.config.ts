/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    globals: true,
    // Fuseau de l'utilisateur (Guyane, UTC−3, sans changement d'heure). Sans
    // ça, une CI en UTC ferait passer les tests de date même avec un
    // toISOString() fautif : ils ne prouveraient rien. C'est précisément ce
    // décalage qui datait les dépenses du lendemain après 21 h.
    env: { TZ: 'America/Cayenne' },
  },
})
