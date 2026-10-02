import { FormEvent, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ArrowRight, BellRing, Eye, EyeOff, FlaskConical, Loader2, Lock, Mail, MapPinned, ShieldCheck, User, Waves } from 'lucide-react'
import { useAuth } from '../auth'

// Seeded by appsettings.Development.json (Seed:DemoUsers). Override with VITE_DEMO_PASSWORD if you change it there.
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD ?? 'Demo@12345'
const demos = [
  { role: 'Admin', email: 'admin@pralaydrishti.local', note: 'Everything, incl. users', icon: ShieldCheck },
  { role: 'Analyst', email: 'analyst@pralaydrishti.local', note: 'Run & raise alerts', icon: FlaskConical },
  { role: 'Viewer', email: 'viewer@pralaydrishti.local', note: 'Read-only', icon: Eye },
]

/** Slow 3D flyover of the Rishi Ganga / Chamoli valley (Feb 2021 disaster) behind the sign-in card. */
function LoginMap() {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const map = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          imagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 },
          dem: { type: 'raster-dem', tiles: ['/api/tiles/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 13 },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#0b1726' } },
          { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.1 } },
        ],
        terrain: { source: 'dem', exaggeration: 1.5 },
      },
      center: [79.66, 30.43],
      zoom: 11.6,
      pitch: 64,
      bearing: -30,
      interactive: false,
      attributionControl: false,
    })
    let bearing = -30
    let raf = 0
    let last = 0
    // ~1 degree every 2 seconds: alive, never distracting
    const spin = (t: number) => {
      if (last) bearing += ((t - last) / 1000) * 0.5
      last = t
      map.setBearing(bearing)
      raf = requestAnimationFrame(spin)
    }
    map.on('load', () => { if (!reduce) raf = requestAnimationFrame(spin) })
    const onVis = () => {
      cancelAnimationFrame(raf); last = 0
      if (!document.hidden && !reduce) raf = requestAnimationFrame(spin)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); map.remove() }
  }, [])
  return <div ref={el} className="login-map" aria-hidden />
}

export default function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const attempt = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try { await fn() } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    attempt('form', () => (mode === 'login' ? login(email, password) : register(email, password, fullName)))
  }

  return (
    <div className="login">
      <LoginMap />
      <div className="login-scrim" />

      <div className="login-grid">
        <section className="login-story">
          <div className="login-brand">
            <img src="/favicon.svg" alt="" />
            <div>
              <div className="brand-name">PralayDrishti</div>
              <div className="brand-sub">Dam-break & flood decision support</div>
            </div>
          </div>

          <div>
            <div className="eyebrow"><span className="pill">LIVE</span> Rishi Ganga valley, Chamoli - site of the Feb 2021 flood</div>
            <h1>See the flood <em>before</em> it reaches the village.</h1>
            <p className="lead">
              Simulate dam and glacial-lake failures in minutes. Know which settlements flood, when the water arrives,
              and how much time people have to get out.
            </p>
            <div className="login-feats">
              <div className="login-feat"><Waves size={18} /><b>Flood maps</b><span>Depth, speed and arrival time</span></div>
              <div className="login-feat"><MapPinned size={18} /><b>Impact</b><span>Villages, bridges, roads at risk</span></div>
              <div className="login-feat"><BellRing size={18} /><b>Alerts</b><span>CAP alerts and sitrep PDFs</span></div>
            </div>
          </div>

          <div className="login-foot">
            <span className="live"><span className="dot ok" /> Satellite imagery & 3D terrain</span>
            <span>Smart India Hackathon prototype</span>
          </div>
        </section>

        <main className="login-card">
          <div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="subtitle" style={{ fontSize: 13, minHeight: 20 }}>
              {mode === 'login' ? 'Sign in to open the flood dashboard.' : 'New accounts start with read-only access.'}
            </p>
          </div>

          <div className="segmented block" role="tablist" aria-label="Sign in or register">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null) }}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(null) }}>Create account</button>
          </div>

          <form className="login-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="input-icon"><Mail size={15} aria-hidden />
                <input id="email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@district.gov.in" /></div>
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-icon"><Lock size={15} aria-hidden />
                <input id="password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required
                  value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'} style={{ paddingRight: 40 }} />
                <button type="button" className="btn icon small ghost suffix" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {mode === 'register' && <span className="hint">Use a letter and a digit.</span>}
            </div>
            {/* only-in-register field sits below the shared ones so Email and Password never move */}
            {mode === 'register' && (
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <div className="input-icon"><User size={15} aria-hidden />
                  <input id="fullName" type="text" autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" /></div>
              </div>
            )}
            {error &&<div className="error-box" role="alert">{error}</div>}
            <button className="btn primary lg block" type="submit" disabled={busy !== null} style={{ marginTop: 4 }}>
              {busy === 'form' ? <Loader2 size={16} className="spin" /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
              {busy !== 'form' && <ArrowRight size={16} aria-hidden />}
            </button>
          </form>

          {mode === 'login' ? (
            <>
              <div className="or">or explore with a demo account</div>
              <div className="demo-grid">
                {demos.map(d => (
                  <button key={d.role} type="button" className="demo" disabled={busy !== null} onClick={() => attempt(d.role, () => login(d.email, demoPassword))}>
                    <span className="ic">
                      {busy === d.role ? <Loader2 size={15} className="spin" /> : <d.icon size={15} aria-hidden />}
                    </span>
                    <b>{d.role}</b>
                    <span>{d.note}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="register-note">
              <ShieldCheck size={16} aria-hidden />
              <span>An administrator can upgrade your account to <b>Analyst</b> so you can run simulations and raise alerts.</span>
            </div>
          )}

          <p className="login-legal">For planning and exercises. In a real emergency follow your district disaster management authority.</p>
        </main>
      </div>
    </div>
  )
}
