import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { Loader2, PlayCircle, RotateCcw } from 'lucide-react'
import { fmt, get, post } from '../api'
import { useAuth } from '../auth'
import { useHub } from '../hub'
import MapView, { INDIA, points, setGeoJson } from '../components/MapView'
import Workspace from '../components/Workspace'
import { go } from '../App'

export default function AtlasPage() {
  const isAdmin = useAuth().hasRole('Admin')
  const [board, setBoard] = useState<any[]>([])
  const [queued, setQueued] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const mapRef = useRef<MlMap | null>(null)

  const load = useCallback(() => get<any[]>('/api/atlas').then(setBoard), [])
  useEffect(() => { load() }, [load])
  useHub('status', useCallback(() => load(), [load]))

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const max = Math.max(1, ...board.map(b => b.population))
    setGeoJson(map, 'atlas', points(board.map((b, i) => ({ lon: b.lon, lat: b.lat, props: { r: 6 + 22 * Math.sqrt(b.population / max), rank: i + 1, name: b.dam } }))), [
      { id: 'atlas', type: 'circle', paint: { 'circle-radius': ['get', 'r'], 'circle-color': '#dc2626', 'circle-opacity': 0.45, 'circle-stroke-color': '#b91c1c', 'circle-stroke-width': 1 } },
    ])
  }, [board])

  const runAll = async () => {
    setBusy(true)
    try {
      const r = await post<any>('/api/atlas/run', [])
      setQueued(r.queued)
    } finally { setBusy(false) }
  }

  return (
    <Workspace wide side={<>
        <div className="side-head">
          <div>
            <h1>India dam risk atlas</h1>
            <div className="subtitle">Every dam in the register simulated the same way and ranked by people at risk</div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={runAll} disabled={busy || !isAdmin} title={isAdmin ? undefined : 'Only admins can run the full atlas'}>
              {busy ? <Loader2 size={14} className="spin" /> : <PlayCircle size={14} aria-hidden />} Run atlas for all dams
            </button>
            <button className="btn icon" onClick={load} aria-label="Refresh" title="Refresh"><RotateCcw size={13} /></button>
          </div>
        </div>
        <div className="side-body">
        <p className="faint">Uses a coarser grid and skips the breach-zone simulation so all dams finish quickly. Add more dams on the Data page.</p>
        {queued != null && <div className="info-box">{queued} runs queued. The table fills in as they finish - progress is on the <a href="#/results">Results</a> page.</div>}
        <div className="table-wrap full">
          <table>
            <thead><tr><th>#</th><th>Dam</th><th className="num">People</th><th className="num">km²</th><th className="num">Arrival</th><th className="num">Loss ₹cr</th></tr></thead>
            <tbody>
              {board.map((b, i) => (
                <tr key={b.runId} className="clickable" onClick={() => go('results', b.runId)}>
                  <td className="faint">{i + 1}</td>
                  <td><b>{b.dam}</b><div className="faint">{b.river}, {b.state}{b.synthetic ? ' · synthetic terrain' : ''}</div></td>
                  <td className="num"><b>{fmt.n(b.population)}</b></td>
                  <td className="num">{fmt.n(b.areaKm2, 1)}</td>
                  <td className="num">{fmt.min(b.firstArrivalMin)}</td>
                  <td className="num">{fmt.n(b.lossCrore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.length === 0 && <div className="empty">No atlas results yet.</div>}
        </div>
        </div>
      </>}>
      <MapView onReady={m => { mapRef.current = m; setBoard(b => [...b]) }} fitTo={INDIA} initialBasemap="streets">
        <div className="map-panel map-legend">
          <div className="legend-title">People at risk</div>
          <div className="item"><span className="sw round" style={{ background: '#dc2626', opacity: 0.6 }} />Circle size = population</div>
        </div>
      </MapView>
    </Workspace>
  )
}
