import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

const SLIDES = [
  { ico: '🏦', title: 'Tous vos comptes réunis', sub: 'Visualisez tous vos comptes bancaires en temps réel, au même endroit.' },
  { ico: '📊', title: 'Analyse intelligente', sub: 'Suivez vos dépenses, revenus et prélèvements avec des graphiques clairs.' },
  { ico: '🎯', title: 'Le meilleur compte, toujours', sub: 'QDQ recommande automatiquement le compte optimal pour chaque dépense.' },
]

const features = [
  { ico: '🏦', txt: 'Tous vos comptes au même endroit' },
  { ico: '📊', txt: 'Analyse en temps réel de vos finances' },
  { ico: '🛡️', txt: 'Recommandations intelligentes pour chaque dépense' },
]

const QDQLogo = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
    <Logo size={52} />
    <span style={{ fontSize: 34, fontWeight: 800, color: '#0D1B3E', letterSpacing: -2, fontFamily: 'Inter, sans-serif' }}>QDQ</span>
  </div>
)

interface Props { t: Theme; notice?: string }
export const AuthScreen = ({ t, notice }: Props) => {
  const [onboarded] = useState(() => localStorage.getItem('qdq-onboarded') === '1')
  const [slide, setSlide] = useState(0)
  const [showAuth, setShowAuth] = useState(onboarded || !!notice)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(notice || '')
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
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
        background: t.bg,
        padding: '56px 28px 40px',
        animation: 'fadeIn .4s ease',
        boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <QDQLogo />
        </div>

        {/* Slide content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Slide icon */}
          <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 24, textAlign: 'center' }}>{s.ico}</div>

          {/* Tagline (slide 0) or slide title */}
          {slide === 0 ? (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.tx, lineHeight: 1.3, ...sp('s', 700) }}>
                Gérez intelligemment
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.tx, lineHeight: 1.3, ...sp('s', 700) }}>
                vos dépenses,
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.primary, lineHeight: 1.3, ...sp('s', 700) }}>
                optimisez chaque choix.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, color: t.tx, lineHeight: 1.3, textAlign: 'center', marginBottom: 12, ...sp('s', 700) }}>
              {s.title}
            </div>
          )}

          {/* Subtitle */}
          <div style={{ fontSize: slide === 0 ? 13 : 14, color: t.sub, lineHeight: 1.6, textAlign: 'center', maxWidth: 280, marginBottom: 0 }}>
            {slide === 0
              ? 'QDQ analyse vos comptes en temps réel et vous recommande le meilleur compte pour chaque dépense.'
              : s.sub}
          </div>

          {/* Feature bullets — slide 0 only */}
          {slide === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '24px 0', alignSelf: 'stretch' }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: t.primary + '15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {f.ico}
                  </div>
                  <span style={{ fontSize: 14, color: t.tx, lineHeight: 1.4 }}>{f.txt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              width: i === slide ? 24 : 8, height: 8, borderRadius: 4,
              background: i === slide ? t.primary : t.muted,
              transition: 'all .3s', cursor: 'pointer',
            }} />
          ))}
        </div>

        {/* CTA button */}
        <button onClick={() => {
          if (isLast) { localStorage.setItem('qdq-onboarded', '1'); setShowAuth(true) }
          else setSlide(s => s + 1)
        }} style={{
          width: '100%', padding: '16px', borderRadius: 28, border: 'none',
          background: t.primary,
          color: '#fff',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          marginBottom: 12,
          ...sp('s', 700),
        }}>
          {isLast ? 'Commencer' : 'Suivant →'}
        </button>

        {/* Se connecter link */}
        <button onClick={() => { localStorage.setItem('qdq-onboarded', '1'); setShowAuth(true) }}
          style={{
            background: 'none', border: 'none', color: t.sub,
            fontSize: 13, cursor: 'pointer', padding: '8px',
            textAlign: 'center',
            ...sp('o'),
          }}>
          Se connecter
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', padding: '40px 28px', animation: 'fadeIn .4s ease' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <QDQLogo />
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
        {err && <div role="alert" style={{ padding: '10px', borderRadius: 10, background: t.rD, border: '1px solid ' + t.rose + '44', marginBottom: 12, ...sp('o'), fontSize: 13, color: t.dangerText }}>{err}</div>}
        {ok && <div role="status" style={{ padding: '10px', borderRadius: 10, background: t.mD, border: '1px solid ' + t.mint + '44', marginBottom: 12, ...sp('o'), fontSize: 13, color: t.mintText }}>{ok}</div>}
        <button onClick={submit} disabled={loading}
          style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: loading ? 'wait' : 'pointer', background: loading ? t.el : t.primary, ...sp('o', 700), fontSize: 15, color: loading ? t.sub : '#fff' }}>
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
