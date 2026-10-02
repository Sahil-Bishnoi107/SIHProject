import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3, Bell, ChevronRight, Crosshair, Database, Droplets, FlaskConical, Loader2, LogOut, Map as MapIcon, Mountain,
  PanelLeftClose, PanelLeftOpen, Satellite, Users,
} from 'lucide-react'
import { get } from './api'
import { useHub } from './hub'
import { useAuth } from './auth'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/UsersPage'
import SimulatePage from './pages/SimulatePage'
import ResultsPage from './pages/ResultsPage'
import NaturalDamPage from './pages/NaturalDamPage'
import InversePage from './pages/InversePage'
import ValidationPage from './pages/ValidationPage'
import LakeWatchPage from './pages/LakeWatchPage'
import AtlasPage from './pages/AtlasPage'
import DataPage from './pages/DataPage'

type Route = { page: string; id?: string }

function parseHash(): Route {
  const [page, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { page: page || 'simulate', id }
}

export function go(page: string, id?: string) {
  window.location.hash = `/${page}${id ? '/' + id : ''}`
}

const nav = [
  { section: 'Simulate' },
  { page: 'simulate', label: 'Dam break', icon: Droplets },
  { page: 'natural', label: 'Natural dams & lakes', icon: Mountain },
  { page: 'results', label: 'Results', icon: MapIcon },
  { section: 'Respond' },
  { page: 'lakes', label: 'Lake watch & alerts', icon: Satellite, badge: 'alerts' },
  { page: 'inverse', label: 'Threshold queries', icon: Crosshair },
  { page: 'atlas', label: 'Risk atlas', icon: BarChart3 },
  { section: 'Evidence' },
  { page: 'validation', label: 'Validation', icon: FlaskConical },
  { page: 'data', label: 'Data & system', icon: Database },
  { page: 'users', label: 'Users', icon: Users, admin: true },
] as const

type NavItem = Extract<(typeof nav)[number], { page: string }>

const NAV_KEY = 'pd.navCollapsed'

export default function App() {
  const { user, restoring } = useAuth()
  if (restoring)
    return <div className="empty" style={{ height: '100%', justifyContent: 'center' }}><Loader2 className="spin" aria-label="Restoring session" /></div>
  return user ? <Shell /> : <LoginPage />
}

function Shell() {
  const { user, logout, hasRole } = useAuth()
  const [route, setRoute] = useState<Route>(parseHash())
  const [system, setSystem] = useState<any>(null)
  const [newAlerts, setNewAlerts] = useState(0)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(NAV_KEY) === '1' } catch { return false } })
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { try { localStorage.setItem(NAV_KEY, collapsed ? '1' : '0') } catch { /* private mode */ } }, [collapsed])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [menu])

  useEffect(() => {
    get<any>('/api/system').then(setSystem).catch(() => setSystem(null))
    const t = setInterval(() => get<any>('/api/system').then(setSystem).catch(() => setSystem(null)), 30000)
    return () => clearInterval(t)
  }, [])

  useHub('alert', useCallback(() => setNewAlerts(n => n + 1), []))

  useEffect(() => {
    if (route.page === 'lakes') setNewAlerts(0)
  }, [route.page])

  let content
  switch (route.page) {
    case 'results': content = <ResultsPage runId={route.id} />; break
    case 'natural': content = <NaturalDamPage />; break
    case 'inverse': content = <InversePage runId={route.id} />; break
    case 'validation': content = <ValidationPage />; break
    case 'lakes': content = <LakeWatchPage />; break
    case 'atlas': content = <AtlasPage />; break
    case 'data': content = <DataPage system={system} />; break
    case 'users': content = hasRole('Admin') ? <UsersPage /> : <SimulatePage />; break
    default: content = <SimulatePage />
  }

  const name = user!.fullName || user!.email
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')
  const items = nav.filter(n => !('admin' in n) || hasRole('Admin'))

  // breadcrumb: section › page (› run)
  let section = ''
  let current: NavItem | undefined
  for (const n of nav) {
    if ('section' in n) section = n.section
    else if (n.page === route.page) { current = n; break }
  }
  current ??= nav[1] as NavItem

  return (
    <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-mark" />
          <div className="brand-text">
            <div className="brand-name">PralayDrishti</div>
            <div className="brand-sub">Flood decision support</div>
          </div>
        </div>
        <div className="nav-items">
          {items.map((n, i) =>
            'section' in n ? (
              <div key={i} className="nav-section"><span>{n.section}</span></div>
            ) : (
              <button key={n.page} className={`nav-item ${route.page === n.page ? 'active' : ''}`} onClick={() => go(n.page)}
                aria-current={route.page === n.page ? 'page' : undefined} data-tip={n.label} aria-label={collapsed ? n.label : undefined}>
                <n.icon size={17} aria-hidden />
                <span className="nav-label">{n.label}</span>
                {'badge' in n && newAlerts > 0 && <span className="badge red nav-badge" aria-label={`${newAlerts} new alerts`}>{newAlerts}</span>}
              </button>
            ),
          )}
        </div>
        <div className="nav-footer">
          <div className="sys-card" aria-live="polite">
            <span className={`dot ${system ? 'ok' : 'bad'}`} aria-hidden />
            <div className="nav-label">
              <div className="sys-title">{system ? 'All systems online' : 'Server unreachable'}</div>
              {system && <div className="sys-sub">{system.runningRuns} running · {system.runs} runs{system.offline ? ' · offline mode' : ''}</div>}
            </div>
          </div>
        </div>
      </nav>

      <div className="main-col">
        <header className="topbar">
          <button className="btn icon ghost" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-muted">{section}</span>
            <ChevronRight size={13} aria-hidden className="crumb-sep" />
            {route.id && route.page === 'results' ? (
              <>
                <a href="#/results" className="crumb-muted">{current.label}</a>
                <ChevronRight size={13} aria-hidden className="crumb-sep" />
                <span className="crumb-current">Run</span>
              </>
            ) : <span className="crumb-current">{current.label}</span>}
          </nav>
          <div className="topbar-right">
            <button className="btn icon ghost bell" onClick={() => go('lakes')} aria-label={newAlerts ? `${newAlerts} new alerts` : 'Alerts'} title="Alerts">
              <Bell size={17} />
              {newAlerts > 0 && <span className="bell-dot" aria-hidden />}
            </button>
            <div className="menu-wrap" ref={menuRef}>
              <button className="avatar-btn" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}>
                <span className="avatar" aria-hidden>{initials}</span>
                <span className="avatar-meta">
                  <span className="user-name">{name}</span>
                  <span className="user-role">{user!.role}</span>
                </span>
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <div className="user-name">{name}</div>
                    <div className="faint">{user!.email}</div>
                    <span className={`badge ${user!.role === 'Admin' ? 'blue' : user!.role === 'Analyst' ? 'green' : 'gray'}`} style={{ marginTop: 6 }}>{user!.role}</span>
                  </div>
                  {hasRole('Admin') && <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); go('users') }}><Users size={15} /> Manage users</button>}
                  <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); go('data') }}><Database size={15} /> Data & system</button>
                  <hr className="divider" />
                  <button role="menuitem" className="menu-item danger" onClick={logout}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main">{content}</main>
      </div>
    </div>
  )
}
