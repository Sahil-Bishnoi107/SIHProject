import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { Bell, CheckCheck, FileCode, Loader2, Play, RadioTower, Upload, X } from 'lucide-react'
import { fmt, get, post, upload } from '../api'
import { useCanSimulate, viewerHint } from '../auth'
import { useHub } from '../hub'
import MapView, { points, setGeoJson } from '../components/MapView'
import Workspace from '../components/Workspace'
import { go } from '../App'

type Lake = {
  id: string; detectedUtc: string; lat: number; lon: number; areaKm2: number; previousAreaKm2: number | null
  source: string; region: string; estimatedVolumeMcm: number | null; estimatedLevel: number | null; state: string; runId: string | null; notes: string | null
}

type Alert = { id: string; runId: string; createdUtc: string; headline: string; severity: string; status: string; populationAtRisk: number; firstArrivalMin: number | null; acknowledged: boolean }

const HIMALAYA: [number, number, number, number] = [72.5, 26.5, 97, 36.5]

const stateColor: Record<string, string> ={ New: 'blue', Estimating: 'amber', Simulating: 'amber', Alerted: 'red', Dismissed: 'gray', Failed: 'gray' }

export default function LakeWatchPage() {
  const canSim = useCanSimulate()
  const [lakes, setLakes] = useState<Lake[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cap, setCap] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [demoPoint, setDemoPoint] = useState<number[] | null>(null)
  const [demoArea, setDemoArea] = useState('0.35')
  const mapRef = useRef<MlMap | null>(null)

  const load = useCallback(() => {
    get<Lake[]>('/api/lakes').then(setLakes)
    get<Alert[]>('/api/alerts').then(setAlerts)
  }, [])
  useEffect(() => { load() }, [load])
  useHub('lake', useCallback(() => load(), [load]))
  useHub('alert', useCallback(() => load(), [load]))
  useHub('status', useCallback(() => load(), [load]))

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    setGeoJson(map, 'lakes', points(lakes.map(l => ({ lon: l.lon, lat: l.lat, props: { s: l.state } }))), [
      { id: 'lakes-halo', type: 'circle', paint: { 'circle-radius': 14, 'circle-color': ['match', ['get', 's'], 'Alerted', '#dc2626', 'Simulating', '#d97706', '#0369a1'], 'circle-opacity': 0.25 } },
      { id: 'lakes', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 's'], 'Alerted', '#dc2626', 'Simulating', '#d97706', '#0369a1'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
    ])
  }, [lakes])

  const onMapClick = useCallback((ll: { lng: number; lat: number }) => {
    setDemoPoint([ll.lng, ll.lat])
    const map = mapRef.current
    if (map) setGeoJson(map, 'demo', points([{ lon: ll.lng, lat: ll.lat }]), [
      { id: 'demo', type: 'circle', paint: { 'circle-radius': 8, 'circle-color': '#0891b2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ])
  }, [])

  // stands in for the weekly GEE scan so the whole chain can be shown live
  const injectDetection = async () => {
    if (!demoPoint) return
    setBusy(true); setMsg(null)
    try {
      await post('/api/lakes/detections', {
        detections: [{ lat: demoPoint[1], lon: demoPoint[0], area_km2: +demoArea, previous_area_km2: 0, source: 'Manual (demo of GEE detection)', region: 'demo' }],
      })
      setMsg('Detection ingested - volume estimate and simulation are running. The alert will appear here automatically.')
      load()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  const ndwi = async (files: FileList | null) => {
    if (!files || files.length < 2) { setMsg('Choose two files: before and after NDWI GeoTIFFs'); return }
    const form = new FormData()
    form.append('before', files[0])
    form.append('after', files[1])
    setBusy(true)
    try {
      const r = await upload<any>('/api/lakes/ndwi?autoSimulate=true', form)
      setMsg(`${r.detections} new water bodies found`)
      load()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  const showCap = async (id: string) => setCap(await get<string>(`/api/alerts/${id}/cap`))

  return (
    <Workspace wide side={<>
        <div className="side-head">
          <div>
            <h1>Lake watch & alerts</h1>
            <div className="subtitle">New lakes spotted by satellite become simulations and alerts automatically</div>
          </div>
        </div>
        <div className="side-body">
        <div className="info-box">
          <b>How it works:</b> a weekly satellite scan (Sentinel-1/2) finds a new lake → its volume is estimated from terrain →
          the outburst is simulated → flood map, village list and a CAP alert are produced. No manual steps in between.
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}><RadioTower size={12} aria-hidden /> Simulate a detection</h3>
          <p className="faint">
            Normally the scanner (<span className="mono">gee/lake_watch.py</span>) posts detections here. For a live demo, click a spot in a Himalayan valley and inject it.
          </p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field grow"><label htmlFor="da">Lake area (km²)</label><input id="da" type="number" step={0.05} value={demoArea} onChange={e => setDemoArea(e.target.value)} /></div>
            <button className="btn primary" onClick={injectDetection} disabled={busy || !canSim || !demoPoint} title={canSim ? undefined : viewerHint}>
              {busy ? <Loader2 size={14} className="spin" /> : <RadioTower size={14} aria-hidden />} Inject detection
            </button>
          </div>
          <div className="faint">{demoPoint ? <>Lake at <span className="num-t">{demoPoint[1].toFixed(4)}, {demoPoint[0].toFixed(4)}</span></> : 'Click the map to place the lake.'}</div>
          <label className="btn small" style={{ alignSelf: 'flex-start' }} aria-disabled={!canSim}>
            <Upload size={13} aria-hidden /> Offline: upload before + after NDWI GeoTIFFs
            <input type="file" accept=".tif,.tiff" multiple hidden disabled={!canSim} onChange={e => ndwi(e.target.files)} />
          </label>
          {msg && <div className="info-box">{msg}</div>}
        </div>

        <h3 style={{ marginBottom: -4 }}>Detected lakes ({lakes.length})</h3>
        <div className="list">
          {lakes.map(l => (
            <div key={l.id} className="list-item" onClick={() => mapRef.current?.flyTo({ center: [l.lon, l.lat], zoom: 12 })} role="button" tabIndex={0}>
              <div className="row spread">
                <b>{l.lat.toFixed(3)}N {l.lon.toFixed(3)}E</b>
                <span className={`badge ${stateColor[l.state] ?? 'gray'}`}>{l.state}</span>
              </div>
              <div className="faint">
                {l.areaKm2} km² {l.previousAreaKm2 != null && `(was ${l.previousAreaKm2})`} · {l.source} · {fmt.time(l.detectedUtc)}
              </div>
              {l.estimatedVolumeMcm != null && <div className="faint">Estimated level {l.estimatedLevel} m, volume <b>{l.estimatedVolumeMcm} MCM</b></div>}
              {l.notes && l.state === 'Failed' && <div className="faint" style={{ color: 'var(--danger-text)' }}>{l.notes}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                {l.runId && <button className="btn small" onClick={e => { e.stopPropagation(); go('results', l.runId!) }}>Open simulation</button>}
                {!l.runId && l.state !== 'Dismissed' && <button className="btn small" disabled={!canSim} onClick={e => { e.stopPropagation(); post(`/api/lakes/${l.id}/simulate`).then(load) }}><Play size={12} /> Simulate</button>}
                {l.state !== 'Dismissed' && <button className="btn small ghost" disabled={!canSim} onClick={e => { e.stopPropagation(); post(`/api/lakes/${l.id}/dismiss`).then(load) }}>Dismiss</button>}
              </div>
            </div>
          ))}
          {lakes.length === 0 && <div className="empty">No detections yet.</div>}
        </div>

        <h3 style={{ marginBottom: -4 }}><Bell size={12} aria-hidden /> Alerts ({alerts.length})</h3>
        <div className="list">
          {alerts.map(a => (
            <div key={a.id} className="list-item" style={{ borderColor: a.acknowledged ? undefined : '#fca5a5', background: a.acknowledged ? undefined : 'var(--danger-soft)' }}>
              <div className="row spread">
                <span className={`badge ${a.severity === 'Extreme' ? 'red' : a.severity === 'Severe' ? 'amber' : 'blue'}`}>{a.severity}</span>
                <span className="badge gray">{a.status}</span>
              </div>
              <div style={{ margin: '4px 0' }}>{a.headline}</div>
              <div className="faint">{fmt.time(a.createdUtc)} · {fmt.n(a.populationAtRisk)} people · first arrival {fmt.min(a.firstArrivalMin)}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn small" onClick={() => showCap(a.id)}><FileCode size={12} /> CAP XML</button>
                <button className="btn small" onClick={() => go('results', a.runId)}>Run</button>
                {!a.acknowledged && <button className="btn small ghost" disabled={!canSim} onClick={() => post(`/api/alerts/${a.id}/ack`).then(load)}><CheckCheck size={12} /> Ack</button>}
              </div>
            </div>
          ))}
          {alerts.length === 0 && <div className="empty">No alerts. Raise one from a run's Export tab, or let the lake chain do it.</div>}
        </div>
        <a className="faint" href="/api/alerts/feed" target="_blank" rel="noreferrer">CAP Atom feed for alert aggregators ↗</a>
        </div>
      </>}>
      <MapView onReady={m => { mapRef.current = m; setLakes(l => [...l]) }} onClick={onMapClick} fitTo={HIMALAYA} initialBasemap="streets"
        hint={demoPoint ? null : 'Click a valley to place a new lake'}>
        {cap && (
          <div className="map-panel stack tight" style={{ top: 52, right: 52, width: 'min(560px, 60%)', maxHeight: '75%', overflow: 'auto' }}>
            <div className="row spread"><b>CAP 1.2 alert</b><button className="btn icon small ghost" onClick={() => setCap(null)} aria-label="Close"><X size={12} /></button></div>
            <pre className="code">{cap}</pre>
          </div>
        )}
      </MapView>
    </Workspace>
  )
}
