import { useState } from 'react'
import { Icon } from '../components/Icon'
import { sp } from '../lib/theme'
import type { Theme, Profile } from '../types'
import type { User } from '@supabase/supabase-js'
import type { ThemeMode } from '../hooks/useTheme'

// ── NOTIF SETTINGS ───────────────────────────────────────────
const NotifSettings = ({ t }: { t: Theme }) => {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [threshold, setThreshold] = useState(parseInt(localStorage.getItem('qdq-alert-threshold') || '80'));

  const requestPerm = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') new Notification('QDQ — Notifications activées', { body: 'Tu recevras une alerte quand ton budget approche.', icon: '/icons/icon-192.png' });
  };

  const changeThreshold = (v: number) => {
    setThreshold(v);
    localStorage.setItem('qdq-alert-threshold', String(v));
  };

  return (
    <div style={{ padding: '14px 16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: t.aD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔔</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Alertes budget</div>
          <div style={{ fontSize: 12, ...sp('o'), color: perm === 'granted' ? t.mint : t.sub }}>{perm === 'granted' ? 'Activées' : 'Non autorisées'}</div>
        </div>
        {perm !== 'granted' && (
          <button onClick={requestPerm} style={{ padding: '7px 12px', borderRadius: 10, background: t.mD, border: '1px solid ' + t.mint + '44', cursor: 'pointer', ...sp('o', 600), fontSize: 12, color: t.mint }}>
            Activer
          </button>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 8 }}>Seuil d'alerte</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[70, 80, 90, 100].map(v => (
            <button key={v} onClick={() => changeThreshold(v)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: threshold === v ? t.amber + '22' : t.el, ...sp('o', 600), fontSize: 12, color: threshold === v ? t.amber : t.sub, outline: threshold === v ? '1.5px solid ' + t.amber + '55' : 'none' }}>
              {v}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── SETTINGS PROPS ────────────────────────────────────────────
interface SettingsProps {
  t: Theme; user: User
  onLogout: () => void; profile: Profile
  onProfile: () => void; onSecurity: () => void
  onRecurring: () => void; onReset: () => void
  onGroupe?: () => void
  themeMode: ThemeMode
  onThemeMode: (m: ThemeMode) => void
}

// ── SETTINGS ─────────────────────────────────────────────────
export const Settings = ({ t, user, onLogout, profile, onProfile, onSecurity, onRecurring, onReset, onGroupe, themeMode, onThemeMode }: SettingsProps) => (
  <div style={{ padding: '0 20px 16px' }}>
    <div style={{ padding: '8px 0 20px' }}><div style={{ fontSize: 17, ...sp('s', 700), color: t.tx }}>Réglages</div></div>
    <button onClick={onProfile} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      padding: '14px 16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo, marginBottom: 10, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: t.mD,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
        {profile.avatar || '😊'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>{profile.name || user?.email?.split('@')[0] || 'Utilisateur'}</div>
        <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 2 }}>{user ? user.email : ''}</div>
      </div>
      <span style={{ color: t.muted, fontSize: 18 }}>›</span>
    </button>
    <div style={{ padding: '28px 0 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ background: '#0D1B3E', borderRadius: 12, padding: '6px 16px', display: 'inline-block' }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>QDQ</span>
      </div>
      <div style={{ fontSize: 11, ...sp('o'), color: t.muted }}>v2.0 · Qui Dépense Quoi</div>
    </div>
    {/* ── APPARENCE ── */}
    <div style={{ padding: '14px 16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo, marginBottom: 10 }}>
      <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx, marginBottom: 10 }}>🎨 Apparence</div>
      <div role="group" aria-label="Thème" style={{ display: 'flex', gap: 8 }}>
        {([['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']] as const).map(([m, lb]) => (
          <button key={m} onClick={() => onThemeMode(m)} aria-pressed={themeMode === m}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12,
              ...sp('o', themeMode === m ? 600 : 400),
              background: themeMode === m ? t.primary : t.el,
              color: themeMode === m ? '#fff' : t.sub,
              border: '1px solid ' + (themeMode === m ? t.primary : t.bo),
            }}>{lb}</button>
        ))}
      </div>
    </div>

    <NotifSettings t={t} />

    {/* ── PRÉLÈVEMENTS + GROUPE ── */}
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, ...sp('s', 700), color: t.sub, letterSpacing: 1,
        textTransform: 'uppercase', padding: '0 4px', marginBottom: 8 }}>Finances</div>
      <div style={{ background: t.card, borderRadius: 16, border: '1px solid ' + t.bo, overflow: 'hidden' }}>
        <button onClick={onRecurring}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '14px 16px', background: 'none', border: 'none', borderBottom: '1px solid ' + t.bo, cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: t.aD,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Prélèvements récurrents</div>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>
              Loyer, EDF, abonnements…
            </div>
          </div>
          <span style={{ color: t.muted, fontSize: 16 }}>›</span>
        </button>
        {onGroupe && (
          <button onClick={onGroupe}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: t.el,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Groupe</div>
              <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>
                Dépenses partagées
              </div>
            </div>
            <span style={{ color: t.muted, fontSize: 16 }}>›</span>
          </button>
        )}
      </div>
    </div>

    {/* ── SÉCURITÉ ── */}
    {(() => {
      const pinOn = localStorage.getItem('qdq-pin-enabled') === '1';
      const bioOn = localStorage.getItem('qdq-bio-enabled') === '1';
      const lockAfter = localStorage.getItem('qdq-lock-after') || '1';
      return (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, ...sp('s', 700), color: t.sub, letterSpacing: 1,
            textTransform: 'uppercase', padding: '0 4px', marginBottom: 8 }}>Sécurité</div>
          <div style={{ background: t.card, borderRadius: 16, border: '1px solid ' + t.bo, overflow: 'hidden' }}>
            {/* Code PIN */}
            <button onClick={onSecurity}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '14px 16px', background: 'none', border: 'none',
                borderBottom: '1px solid ' + t.bo, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: pinOn ? t.mD : t.el,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Code PIN</div>
                <div style={{ fontSize: 11, ...sp('o'), color: pinOn ? t.mint : t.sub, marginTop: 1 }}>
                  {pinOn ? (bioOn ? 'Activé · biométrie activée' : 'Activé') : 'Désactivé'}
                </div>
              </div>
              <span style={{ color: t.muted, fontSize: 16 }}>›</span>
            </button>
            {/* Délai de verrouillage (visible seulement si PIN activé) */}
            {pinOn && (
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: t.el,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Verrouillage auto</div>
                </div>
                <select value={lockAfter}
                  onChange={e => localStorage.setItem('qdq-lock-after', e.target.value)}
                  style={{ background: t.el, border: '1px solid ' + t.bo, borderRadius: 8,
                    padding: '6px 10px', color: t.tx, ...sp('o', 600), fontSize: 12, cursor: 'pointer' }}>
                  <option value="0">Immédiat</option>
                  <option value="1">1 minute</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
              </div>
            )}
          </div>
        </div>
      );
    })()}

    {/* Remise à zéro */}
    <button onClick={onReset}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: '100%', padding: '13px', background: 'none',
        border: '1px solid ' + t.bo, borderRadius: 14, cursor: 'pointer', marginBottom: 10 }}>
      <span style={{ fontSize: 16 }}>🗑️</span>
      <span style={{ fontSize: 13, ...sp('o', 600), color: t.muted }}>Remettre à zéro (vider la base)</span>
    </button>

    <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '14px', background: t.rD, border: '1px solid ' + t.rose + '33', borderRadius: 14, cursor: 'pointer' }}>
      <Icon n="logout" sz={18} c={t.rose} />
      <span style={{ fontSize: 14, ...sp('o', 600), color: t.rose }}>Se déconnecter</span>
    </button>
  </div>
);
