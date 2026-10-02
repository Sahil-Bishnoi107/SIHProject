import { createContext, CSSProperties, ReactNode, useContext, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Left edge (px) of the map area that is not covered by the floating panel. MapView reads it to keep things centred. */
const InsetContext = createContext(0)
export const useMapInset = () => useContext(InsetContext)

const KEY = 'pd.panelOpen'
const readOpen = () => {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

type Props = {
  /** Floating panel content (side-head / side-body / side-foot). */
  side: ReactNode
  /** The map. */
  children: ReactNode
  wide?: boolean
  label?: string
}

/** Full-bleed map with a floating, collapsible panel on the left (Google Maps / Felt style). */
export default function Workspace({ side, children, wide, label = 'panel' }: Props) {
  const [open, setOpen] = useState(readOpen)
  const width = wide ? 452 : 384
  const inset = open ? width + 24 : 0

  useEffect(() => {
    try { localStorage.setItem(KEY, open ? '1' : '0') } catch { /* private mode */ }
  }, [open])

  // "[" toggles the panel, like most map and design tools
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) setOpen(o => !o)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className={`workspace ${open ? '' : 'collapsed'}`} style={{ '--panel-w': `${width}px`, '--inset': `${inset}px` } as CSSProperties}>
      <InsetContext.Provider value={inset}>{children}</InsetContext.Provider>
      {/* inert keeps keyboard focus out of the hidden panel (React 18 has no typing for it yet) */}
      <aside className="side" aria-hidden={!open} {...({ inert: open ? undefined : '' } as any)}>
        {side}
      </aside>
      <button className="panel-handle" onClick={() => setOpen(o => !o)} aria-expanded={open}
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`} title={`${open ? 'Hide' : 'Show'} ${label}  [`}>
        {open ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      </button>
    </div>
  )
}
