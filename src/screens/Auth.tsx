import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

const SLIDES = [
  { ico: '🏦', title: 'Tous vos comptes réunis', sub: 'Visualisez tous vos comptes bancaires en temps réel, au même endroit.' },
  { ico: '📊', title: 'Analyse intelligente', sub: 'Suivez vos dépenses, revenus et prélèvements avec des graphiques clairs.' },
  { ico: '🎯', title: 'Le meilleur compte, toujours', sub: 'QDQ recommande automatiquement le compte optimal pour chaque dépense.' },
]

interface Props { t: Theme }
export const AuthScreen = ({ t }: Props) => {
  const [onboarded] = useState(() => localStorage.getItem('qdq-onboarded') === '1')
  const [slide, setSlide] = useState(0)
  const [showAuth, setShowAuth] = useState(onboarded)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const submit = async () => {
    setErr(''); setOk('');
    if (!email || (mode !== 'reset' && !pwd)) { setErr('Remplis tous les champs'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await db.auth.signInWithPassword({ email, password: pwd });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (!name) { setErr('Entre ton prénom'); setLoading(false); return; }
        const { error } = await db.auth.signUp({ email, password: pwd, options: { data: { name } } });
        if (error) throw error;
        setOk('Compte créé ! Vérifie tes emails.');
      } else {
        const { error } = await db.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setOk('Email envoyé !');
      }
    } catch (e: unknown) {
      const m = (e as { message?: string }).message || '';
      setErr(m.includes('Invalid') ? 'Email ou mot de passe incorrect' : m.includes('already') ? 'Email déjà utilisé' : m.includes('Password') ? 'Mot de passe trop court (6 min)' : m || 'Erreur');
    }
    setLoading(false);
  };
  // Onboarding slides
  if (!showAuth) {
    const s = SLIDES[slide]
    const isLast = slide === SLIDES.length - 1
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh',
        background: `linear-gradient(160deg, ${t.primary} 0%, #1a56c4 60%, #0a2d6e 100%)`,
        padding: '60px 32px 48px', animation: 'fadeIn .4s ease' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: -1.5 }}>QDQ</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Qui Dépense Quoi</div>
        </div>
        {/* Slide content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 32, lineHeight: 1 }}>{s.ico}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5 }}>
            {s.title}
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, maxWidth: 280 }}>
            {s.sub}
          </div>
        </div>
        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              width: i === slide ? 24 : 8, height: 8, borderRadius: 4,
              background: i === slide ? '#fff' : 'rgba(255,255,255,0.3)',
              transition: 'all .3s', cursor: 'pointer',
            }} />
          ))}
        </div>
        {/* CTA */}
        <button onClick={() => {
          if (isLast) { localStorage.setItem('qdq-onboarded', '1'); setShowAuth(true) }
          else setSlide(s => s + 1)
        }} style={{
          width: '100%', padding: '16px', borderRadius: 18, border: 'none',
          background: isLast ? '#fff' : 'rgba(255,255,255,0.15)',
          color: isLast ? t.primary : '#fff',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          backdropFilter: 'blur(10px)', marginBottom: 16,
        }}>
          {isLast ? 'Commencer' : 'Suivant →'}
        </button>
        <button onClick={() => { localStorage.setItem('qdq-onboarded', '1'); setShowAuth(true) }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            fontSize: 13, cursor: 'pointer', padding: '8px' }}>
          Se connecter
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', padding: '40px 28px', animation: 'fadeIn .4s ease' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: t.primary, letterSpacing: -2, lineHeight: 1 }}>QDQ</div>
        <div style={{ fontSize: 13, ...sp('o'), color: t.sub, marginTop: 6 }}>Qui Dépense Quoi</div>
      </div>
      <div style={{ background: t.card, borderRadius: 20, padding: '24px 22px', border: '1px solid ' + t.bo }}>
        {mode !== 'reset' && (
          <div style={{ display: 'flex', background: t.el, borderRadius: 10, padding: 3, marginBottom: 20 }}>
            {([['login', 'Connexion'], ['signup', 'Inscription']] as [string, string][]).map(([m, lb]) => (
              <button key={m} onClick={() => { setMode(m); setErr(''); setOk(''); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', ...sp('o', 600), fontSize: 13, transition: 'all .2s', background: mode === m ? t.bg : 'transparent', color: mode === m ? t.tx : t.sub }}>
                {lb}
              </button>
            ))}
          </div>
        )}
        {mode === 'reset' && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setMode('login')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, ...sp('o'), color: t.sub }}>
              <Icon n="back" sz={14} c={t.sub} /> Retour
            </button>
            <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx, marginTop: 10 }}>Mot de passe oublié</div>
          </div>
        )}
        {mode === 'signup' && (
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="auth-name" style={{ display: 'block', fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Prénom</label>
            <input id="auth-name" autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder="Marc"
              style={{ width: '100%', padding: '12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none' }} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="auth-email" style={{ display: 'block', fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Email</label>
          <input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marc@exemple.com"
            style={{ width: '100%', padding: '12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none' }} />
        </div>
        {mode !== 'reset' && (
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label htmlFor="auth-pwd" style={{ display: 'block', fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Mot de passe</label>
            <input id="auth-pwd" type={showPwd ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••"
              style={{ width: '100%', padding: '12px 44px 12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none' }} />
            <button onClick={() => setShowPwd(s => !s)} aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} style={{ position: 'absolute', right: 12, bottom: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon n={showPwd ? 'eyeOff' : 'eye'} sz={16} c={t.sub} />
            </button>
          </div>
        )}
        {err && <div role="alert" style={{ padding: '10px', borderRadius: 10, background: t.rD, border: '1px solid ' + t.rose + '44', marginBottom: 12, ...sp('o'), fontSize: 13, color: t.rose }}>{err}</div>}
        {ok && <div role="status" style={{ padding: '10px', borderRadius: 10, background: t.mD, border: '1px solid ' + t.mint + '44', marginBottom: 12, ...sp('o'), fontSize: 13, color: t.mint }}>{ok}</div>}
        <button onClick={submit} disabled={loading}
          style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: loading ? 'wait' : 'pointer', background: loading ? t.el : t.primary, ...sp('o', 700), fontSize: 15, color: loading ? t.sub : '#0F1117' }}>
          {loading ? '...' : (mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer')}
        </button>
        {mode === 'login' && (
          <button onClick={() => setMode('reset')} style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, ...sp('o'), color: t.muted }}>
            Mot de passe oublié ?
          </button>
        )}
        {(email || pwd || name) && (
          <button onClick={() => { setEmail(''); setPwd(''); setName(''); setErr(''); setOk(''); }} style={{ display: 'block', margin: '8px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, ...sp('o'), color: t.muted }}>
            Effacer les champs
          </button>
        )}
      </div>
    </div>
  );
}
