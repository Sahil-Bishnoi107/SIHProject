import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import maplibregl from 'maplibre-gl'
import { Activity, AlertTriangle, ArrowLeft, Bell, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Gauge, Home, IndianRupee, Layers, Users, Download, Loader2, Pause, Play, RotateCcw, Trash2, Waves, X } from 'lucide-react'
import { del, download, exportUrl, fmt, get, layerImage, post, RunDetail, RunSummary } from '../api'
import { useCanSimulate } from '../auth'
import { useHub } from '../hub'
import MapView, { points, setGeoJson, setImage } from '../components/MapView'
import Workspace from '../components/Workspace'
import { Bars, Lines, Profile, rows } from '../components/Charts'
import SphPanel from '../components/SphPanel'
import { go } from '../App'

export const hazardColor = ['#334155', '#add8e6', '#ffeda0', '#fec44f', '#fd8d3c', '#e31a1c', '#800026']
const hazStyle = (c: number) => ({ background: hazardColor[c], color: c >= 5 ? '#fff' : '#111' })

type Layer = 'depth' | 'hazard' | 'arrival' | 'velocity' | 'probability'

export default function ResultsPage({ runId }: { runId?: string }) {
  return runId ? <RunView id={runId} /> : <RunList />
}

// ------------------------------------------------------------------ list

function RunList() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => get<RunSummary[]>('/api/runs').then(setRuns).finally(() => setLoading(false)), [])
  useEffect(() => { load() }, [load])
  useHub('status', useCallback(() => load(), [load]))
  useHub('progress', useCallback((id: string, stage: string, p: number) =>
    setRuns(rs => rs.map(r => (r.id === id ? { ...r, stage, progress: p, status: 'Running' } : r))), []))

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Simulation results</h1>
            <div className="subtitle">Every scenario that has been run. Open one to see its flood map and impact.</div>
          </div>
          <div className="row">
            <button className="btn" onClick={load}><RotateCcw size={14} aria-hidden /> Refresh</button>
            <a className="btn primary" href="#/simulate"><Play size={14} aria-hidden /> New simulation</a>
          </div>
        </div>
        {runs.length > 0 && (
          <div className="kpis four">
            <div className="kpi-tile blue"><div className="label"><Layers size={13} aria-hidden /> Total runs</div><div className="value">{runs.length}</div></div>
            <div className="kpi-tile sky"><div className="label"><Activity size={13} aria-hidden /> Running now</div><div className="value">{runs.filter(r => r.status === 'Running' || r.status === 'Queued').length}</div></div>
            <div className="kpi-tile red"><div className="label"><Users size={13} aria-hidden /> Worst case at risk</div><div className="value">{fmt.n(Math.max(0, ...runs.map(r => r.numbers?.populationAtRisk ?? 0)))}</div></div>
            <div className="kpi-tile amber"><div className="label"><Clock size={13} aria-hidden /> Fastest arrival</div><div className="value">{fmt.min(fastest(runs))}</div></div>
          </div>
        )}
        {loading && <div className="empty"><Loader2 className="spin" /> Loading runs</div>}
        {!loading && runs.length === 0 && (
          <div className="card empty" style={{ padding: 48 }}>
            <span className="empty-illus"><Waves size={24} aria-hidden /></span>
            <b style={{ color: 'var(--text)', fontSize: 15 }}>No simulations yet</b>
            <div>Pick a dam and run your first flood simulation.</div>
            <div className="row" style={{ marginTop: 6 }}><a className="btn primary" href="#/simulate">Simulate a dam break</a><a className="btn" href="#/natural">Natural dam</a></div>
          </div>
        )}
        {runs.length > 0 && (
          <div className="table-wrap full">
            <table>
              <thead>
                <tr><th>Scenario</th><th>Status</th><th>Type</th><th className="num">People at risk</th><th className="num">Flooded km²</th><th className="num">First arrival</th><th className="num">Peak flow m³/s</th><th>Started</th></tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => go('results', r.id)}>
                    <td>
                      <b>{r.name}</b>
                      {r.numbers?.syntheticDem && <span className="badge amber" style={{ marginLeft: 6 }}>synthetic terrain</span>}
                      {r.origin !== 'User' && <span className="badge gray" style={{ marginLeft: 6 }}>{r.origin}</span>}
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <StatusBadge s={r.status} />
                      {r.status === 'Running' && <div className="progress" style={{ marginTop: 5 }}><div style={{ width: `${r.progress * 100}%` }} /></div>}
                      {r.status === 'Failed' && <div className="faint" style={{ maxWidth: 260 }}>{r.error}</div>}
                    </td>
                    <td className="faint">{modeLabel[r.mode] ?? r.mode}</td>
                    <td className="num"><b>{fmt.n(r.numbers?.populationAtRisk)}</b></td>
                    <td className="num">{fmt.n(r.numbers?.floodedAreaKm2, 2)}</td>
                    <td className="num">{fmt.min(r.numbers?.firstArrivalMin)}</td>
                    <td className="num">{fmt.n(r.numbers?.peakDischarge)}</td>
                    <td className="faint">{fmt.time(r.createdUtc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const fastest = (runs: RunSummary[]) => {
  const t = runs.map(r => r.numbers?.firstArrivalMin).filter((v): v is number => v != null)
  return t.length ? Math.min(...t) : null
}

const modeLabel: Record<string, string> ={ DamBreak: 'Dam break', NaturalDam: 'Natural dam', Cascade: 'Cascade' }

export function StatusBadge({ s }: { s: string }) {
  const cls = s === 'Completed' ? 'green' : s === 'Failed' ? 'red' : s === 'Running' ? 'blue' : 'gray'
  return <span className={`badge ${cls}`}>{s === 'Running' && <Loader2 size={10} className="spin" />}{s}</span>
}

// ------------------------------------------------------------------ single run

function RunView({ id }: { id: string }) {
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await get<any>(`/api/runs/${id}`)
      if (d.impact) { setDetail(d); setSummary(d.summary) }
      else setSummary(d.summary)
    } catch (e: any) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => { setDetail(null); setSummary(null); load() }, [load])

  // SignalR for live progress, plus a slow poll in case the socket is blocked by a proxy
  useHub('progress', useCallback((rid: string, stage: string, p: number) => {
    if (rid === id) setSummary(s => (s ? { ...s, stage, progress: p, status: 'Running' } : s))
  }, [id]))
  useHub('status', useCallback((rid: string) => { if (rid === id) load() }, [id, load]))
  useEffect(() => {
    if (!summary || summary.status === 'Completed' || summary.status === 'Failed' || summary.status === 'Cancelled') return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [summary, load])

  if (error) return <div className="page"><div className="page-inner narrow"><a href="#/results" className="back-link"><ArrowLeft size={13} /> All runs</a><div className="alert-box">{error}</div></div></div>
  if (!summary) return <div className="page"><div className="empty" style={{ height: '100%', justifyContent: 'center' }}><Loader2 className="spin" /></div></div>
  if (!detail) return <Pending s={summary} onChange={load} />
  return <RunDetailView d={detail} reload={load} />
}

function Pending({ s, onChange }: { s: RunSummary; onChange: () => void }) {
  const canSim = useCanSimulate()
  const steps = ['Fetching terrain', 'Loading exposure', 'Preparing', 'SPH near field', '2D far field', 'Impact', 'Ensemble', 'Saving']
  const cur = steps.findIndex(x => s.stage.startsWith(x))
  const active = s.status === 'Running' || s.status === 'Queued'
  return (
    <div className="page">
      <div className="page-inner narrow">
        <a href="#/results" className="back-link"><ArrowLeft size={13} aria-hidden /> All runs</a>
        <div className="page-head">
          <div>
            <h1>{s.name}</h1>
            <div className="subtitle">{active ? 'The flood model is running. This page opens the results automatically when it finishes.' : `Run ${s.status.toLowerCase()}.`}</div>
          </div>
          <StatusBadge s={s.status} />
        </div>
        <div className="card stack">
          <div className="row spread">
            <span className="muted">{s.stage || 'Waiting for a worker'}</span>
            <span className="num-t" style={{ fontWeight: 600 }}>{(s.progress * 100).toFixed(0)}%</span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(s.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${s.progress * 100}%` }} /></div>
          <ol className="steps">
            {steps.map((st, i) => (
              <li key={st} className={i < cur ? 'done' : i === cur && active ? 'cur' : ''}>
                {i < cur ? <CheckCircle2 size={15} aria-hidden /> : i === cur && active ? <Loader2 size={15} className="spin" aria-hidden /> : <Circle size={15} aria-hidden />}
                {st}
              </li>
            ))}
          </ol>
          {s.status === 'Failed' && <div className="alert-box">{s.error}</div>}
          <div className="row">
            {active && (
              <button className="btn danger small" disabled={!canSim} onClick={() => post(`/api/runs/${s.id}/cancel`).then(onChange)}><X size={13} aria-hidden /> Cancel run</button>
            )}
            {(s.status === 'Failed' || s.status === 'Cancelled') && (
              <button className="btn small" disabled={!canSim} onClick={() => post<RunSummary>(`/api/runs/${s.id}/rerun`).then(r => go('results', r.id))}><RotateCcw size={13} aria-hidden /> Run again</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const tabs = ['Overview', 'Impact', 'Hydraulics', 'SPH', 'Ensemble', 'Export', 'Log'] as const

function RunDetailView({ d, reload }: { d: RunDetail; reload: () => void }) {
  const canSim = useCanSimulate()
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview')
  const [layer, setLayer] = useState<Layer>('depth')
  const [opacity, setOpacity] = useState(0.85)
  const [frame, setFrame] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [sample, setSample] = useState<any>(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const mapRef = useRef<MlMap | null>(null)
  const id = d.summary.id
  const imp = d.impact

  const drawVectors = useCallback((map: MlMap) => {
    if (d.river.length > 1)
      setGeoJson(map, 'river', { type: 'Feature', geometry: { type: 'LineString', coordinates: d.river }, properties: {} }, [
        { id: 'river', type: 'line', paint: { 'line-color': '#0ea5e9', 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } },
      ])
    setGeoJson(map, 'places', points(imp.places.map(p => ({ lon: p.lon, lat: p.lat, props: { name: p.name, c: hazardColor[p.hazardClass], arr: p.arrivalMin ?? -1, depth: p.maxDepth, pop: p.population, golden: p.goldenTimeMin ?? -999 } }))), [
      { id: 'places', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ])
    setGeoJson(map, 'bridges', points(imp.bridges.map(b => ({ lon: b.lon, lat: b.lat, props: { name: b.name, over: b.overtopped ? 1 : 0 } }))), [
      { id: 'bridges', type: 'circle', paint: { 'circle-radius': 4.5, 'circle-color': ['case', ['==', ['get', 'over'], 1], MARK.bridgeOver, MARK.bridge], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
    ])
    setGeoJson(map, 'staging', points(imp.staging.map(s => ({ lon: s.lon, lat: s.lat, props: { name: `${s.type} · ${s.areaHa} ha`, t: s.type } }))), [
      { id: 'staging', type: 'circle', paint: { 'circle-radius': 7, 'circle-color': MARK.staging, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ])
    setGeoJson(map, 'sensors', points(imp.sensors.map((s, i) => ({ lon: s.lon, lat: s.lat, props: { name: `Sensor S${i + 1}` } }))), [
      { id: 'sensors', type: 'circle', paint: { 'circle-radius': 5, 'circle-color': MARK.sensor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ])
    setGeoJson(map, 'dam', points([{ lon: d.dam[0], lat: d.dam[1], props: { name: 'Breach location' } }]), [
      { id: 'dam', type: 'circle', paint: { 'circle-radius': 8, 'circle-color': MARK.dam, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
    ])
  }, [d, imp])

  const onReady = useCallback((map: MlMap) => {
    mapRef.current = map
    setImage(map, 'flood', layerImage(id, 'depth'), d.bounds, opacity, 'river')
    drawVectors(map)
    for (const l of ['places', 'bridges', 'staging', 'sensors', 'dam']) {
      map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''))
      map.on('click', l, e => {
        const p: any = e.features?.[0]?.properties ?? {}
        const html = l === 'places'
          ? `<b>${p.name}</b><div style="color:#64748b;margin-top:2px">Population ${Number(p.pop).toLocaleString('en-IN')}<br/>Flood arrives ${p.arr >= 0 ? p.arr + ' min' : '-'} · depth ${p.depth} m<br/>Golden time ${p.golden > -999 ? p.golden + ' min' : '-'}</div>`
          : `<b>${p.name}</b>`
        new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setHTML(html).addTo(map)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.summary.id])

  // switch layer / animation frame
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getStyle() || !map.getSource('flood')) return
    const name = frame === null ? layer : `snapshot-${frame}`
    setImage(map, 'flood', layerImage(id, name), d.bounds, opacity)
  }, [layer, frame, opacity, id, d.bounds])

  // preload animation frames so playback does not stutter
  useEffect(() => {
    d.snapshotTimes.forEach((_, i) => { const img = new Image(); img.src = layerImage(id, `snapshot-${i}`) })
  }, [id, d.snapshotTimes])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setFrame(f => ((f ?? -1) + 1) % d.snapshotTimes.length), 450)
    return () => clearInterval(t)
  }, [playing, d.snapshotTimes.length])

  const onMapClick = useCallback((ll: { lng: number; lat: number }) => {
    get<any>(`/api/runs/${id}/sample?lon=${ll.lng}&lat=${ll.lat}`).then(s => setSample(s.inside ? { ...s, lng: ll.lng, lat: ll.lat } : null))
  }, [id])

  const n = d.summary.numbers
  const layers: Layer[] = ['depth', 'hazard', 'arrival', 'velocity', ...(d.ensemble ? (['probability'] as Layer[]) : [])]
  const legendKey = frame !== null ? 'depth' : layer

  const flyTo = (lon: number, lat: number) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 13, duration: 900 })

  return (
    <Workspace wide side={<>
        <div className="side-head">
          <div className="row spread">
            <a href="#/results" className="back-link"><ArrowLeft size={13} aria-hidden /> All runs</a>
            <div className="row tight">
              <button className="btn icon ghost" disabled={!canSim} onClick={() => post<RunSummary>(`/api/runs/${id}/rerun`).then(r => go('results', r.id))} title="Run again" aria-label="Run again"><RotateCcw size={14} /></button>
              <button className="btn icon ghost" disabled={!canSim} title="Delete run" aria-label="Delete run" onClick={() => confirm('Delete this run and its files?') && del(`/api/runs/${id}`).then(() => go('results'))}><Trash2 size={14} /></button>
            </div>
          </div>
          <div>
            <h1>{d.summary.name}</h1>
            <div className="subtitle">{modeLabel[d.spec.mode] ?? d.spec.mode} · {n?.demSource} · finished {fmt.time(d.summary.finishedUtc)}</div>
          </div>
          <div className="tabs" role="tablist">
            {tabs.filter(t => (t !== 'SPH' || d.nearField) && (t !== 'Ensemble' || d.ensemble)).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        </div>

        <div className="side-body">
          {n?.syntheticDem && <div className="warn-box row" style={{ alignItems: 'flex-start' }}><AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} /> No terrain data was available here offline. These results use a synthetic valley and are for demonstration only.</div>}

          {tab === 'Overview' && (
            <div className="kpis">
              <div className="kpi-tile red"><div className="label"><Users size={13} aria-hidden /> People at risk</div><div className="value">{fmt.n(imp.populationAtRisk)}</div></div>
              <div className="kpi-tile amber"><div className="label"><Clock size={13} aria-hidden /> Water arrives in</div><div className="value">{fmt.min(n?.firstArrivalMin)}</div></div>
              <div className="kpi-tile blue"><div className="label"><Home size={13} aria-hidden /> Settlements hit</div><div className="value">{imp.settlementsAffected}</div></div>
              <div className="kpi-tile sky"><div className="label"><Waves size={13} aria-hidden /> Flooded area</div><div className="value">{imp.floodedAreaKm2.toFixed(1)}<small>km²</small></div></div>
              <div className="kpi-tile violet"><div className="label"><Gauge size={13} aria-hidden /> Peak outflow</div><div className="value">{fmt.n(d.summary.numbers?.peakDischarge)}<small>m³/s</small></div></div>
              <div className="kpi-tile green"><div className="label"><IndianRupee size={13} aria-hidden /> Est. loss</div><div className="value">{fmt.n(imp.loss.totalCrore, 0)}<small>crore</small></div></div>
            </div>
          )}

          {tab === 'Overview' && <Overview d={d} />}
          {tab === 'Impact' && <ImpactTab d={d} flyTo={flyTo} />}
          {tab === 'Hydraulics' && <HydraulicsTab d={d} />}
          {tab === 'SPH' && d.nearField && <SphPanel nf={d.nearField} />}
          {tab === 'Ensemble' && d.ensemble && <EnsembleTab e={d.ensemble} />}
          {tab === 'Export' && <ExportTab d={d} reload={reload} />}
          {tab === 'Log' && <pre className="code">{d.log.join('\n')}{'\n\n'}{JSON.stringify(d.model, null, 2)}</pre>}
        </div>
      </>}>

      <MapView onReady={onReady} onClick={onMapClick} initialBasemap="satellite" fitTo={d.bounds}>
        <div className="map-toolbar second">
          <div className="segmented" role="group" aria-label="Result layer">
            {layers.map(l => (
              <button key={l} className={frame === null && layer === l ? 'on' : ''} aria-pressed={frame === null && layer === l}
                onClick={() => { setPlaying(false); setFrame(null); setLayer(l) }}>{layerLabel[l]}</button>
            ))}
          </div>
        </div>

        <div className="map-panel map-legend">
          <button className="legend-toggle" onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}>
            <span className="legend-title" style={{ margin: 0 }}>{frame !== null ? 'Water depth' : layerLabel[legendKey as Layer] ?? legendKey}</span>
            {legendOpen ? <ChevronDown size={13} aria-hidden /> : <ChevronUp size={13} aria-hidden />}
          </button>
          {legendOpen && <>
          {(d.legends[legendKey] ?? []).map(({ item1, item2 }) => (
            <div key={item1} className="item"><span className="sw" style={{ background: item2 }} />{item1}</div>
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            <span className="faint">Opacity</span>
            <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e => setOpacity(+e.target.value)} aria-label="Layer opacity" />
          </div>
          <hr className="divider" style={{ margin: '8px 0 6px' }} />
          <div className="item"><span className="sw round" style={{ background: MARK.dam }} />Breach</div>
          <div className="item"><span className="sw round" style={{ background: hazardColor[4] }} />Settlement (by hazard)</div>
          <div className="item"><span className="sw round" style={{ background: MARK.bridgeOver }} />Bridge overtopped</div>
          <div className="item"><span className="sw round" style={{ background: MARK.staging }} />Relief staging area</div>
          <div className="item"><span className="sw round" style={{ background: MARK.sensor }} />Warning sensor</div>
          </>}
        </div>

        {d.snapshotTimes.length > 1 && (
          <div className="map-panel map-time">
            <div className="row">
              <button className="btn icon small primary" onClick={() => { if (frame === null) setFrame(0); setPlaying(p => !p) }} aria-label={playing ? 'Pause animation' : 'Play animation'}>
                {playing ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <input type="range" min={0} max={d.snapshotTimes.length - 1} value={frame ?? 0}
                onChange={e => { setPlaying(false); setFrame(+e.target.value) }} aria-label="Time step" />
              <span className="num-t" style={{ minWidth: 92, textAlign: 'right', fontWeight: 600 }}>
                {frame === null ? 'Peak (max)' : `T + ${fmt.min(d.snapshotTimes[frame] / 60)}`}
              </span>
              {frame !== null && <button className="btn icon small ghost" onClick={() => { setPlaying(false); setFrame(null) }} title="Back to maximum extent" aria-label="Back to maximum extent"><X size={12} /></button>}
            </div>
          </div>
        )}

        {sample && (
          <div className="map-panel map-sample">
            <div className="row spread"><b>At this point</b><button className="btn icon small ghost" onClick={() => setSample(null)} aria-label="Close"><X size={12} /></button></div>
            <div className="faint num-t">{sample.lat.toFixed(4)}, {sample.lng.toFixed(4)}</div>
            <div>Max depth <b>{sample.depth} m</b> · speed <b>{sample.velocity} m/s</b></div>
            <div>Water arrives <b>{fmt.min(sample.arrivalMin)}</b> · peaks {fmt.min(sample.peakMin)}</div>
            <div>Ground level {sample.ground} m</div>
            <div className="row tight">Hazard <span className="haz" style={hazStyle(sample.hazard)}>{sample.hazard ? 'H' + sample.hazard : '-'}</span></div>
            {sample.probability != null && <div>Chance of flooding <b>{(sample.probability * 100).toFixed(0)}%</b></div>}
            <button className="btn small block" style={{ marginTop: 6 }} onClick={() => go('inverse', `${id}?lon=${sample.lng}&lat=${sample.lat}`)}>How much release floods this point?</button>
          </div>
        )}
      </MapView>
    </Workspace>
  )
}

const layerLabel: Record<Layer, string> = { depth: 'Depth', hazard: 'Hazard', arrival: 'Arrival time', velocity: 'Velocity', probability: 'Probability' }
const MARK = { dam: '#d97706', bridge: '#64748b', bridgeOver: '#dc2626', staging: '#16a34a', sensor: '#0891b2' }

// ------------------------------------------------------------------ tabs

function Overview({ d }: { d: RunDetail }) {
  const hyd = rows(d.hydrograph.t, { q: d.hydrograph.v }, 1 / 60)
  return (
    <div className="stack">
      <div className="card">
        <h3>Recommended actions</h3>
        {d.impact.recommendations.length ? <ul className="recs">{d.impact.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul> : <div className="faint">No settlement in the modelled flood zone.</div>}
      </div>
      <div className="card">
        <div className="card-title"><h3>Breach outflow hydrograph</h3><span className="faint">{d.breach.method}</span></div>
        <Lines data={hyd} x="t" xLabel="time (min)" yLabel="m³/s" lines={[{ key: 'q', name: 'outflow' }]}
          refY={d.empiricalPeaks.slice(0, 3).map(p => ({ y: p.peakM3s, label: p.method.split(' (')[0] }))} />
        <div className="fields three" style={{ marginTop: 8 }}>
          <div className="stat"><div className="label">Breach width</div><div className="value">{d.breach.averageWidth.toFixed(0)} m</div></div>
          <div className="stat"><div className="label">Formation time</div><div className="value">{d.breach.formationTimeMin.toFixed(0)} min</div></div>
          <div className="stat"><div className="label">Breach depth</div><div className="value">{d.breach.depth.toFixed(0)} m</div></div>
        </div>
        <div className="faint" style={{ marginTop: 6 }}>Empirical cross-checks: {d.empiricalPeaks.map(p => `${p.method}: ${fmt.n(p.peakM3s)} m³/s`).join(' · ')}</div>
      </div>
      {d.cascade.length > 0 && (
        <div className="card">
          <h3>Cascade failure</h3>
          {d.cascade.map(c => (
            <div key={c.dam} className="row spread">
              <span>{c.dam}</span>
              {c.failedAtMin != null ? <span className="badge red">fails at T+{c.failedAtMin} min</span> : <span className="badge green">survives</span>}
            </div>
          ))}
        </div>
      )}
      {d.naturalDam && (
        <div className="card">
          <h3>Natural lake</h3>
          <div className="stats">
            <div className="stat"><div className="label">Spill level</div><div className="value">{d.naturalDam.crestElevation.toFixed(0)} m</div></div>
            <div className="stat"><div className="label">Blockage height</div><div className="value">{d.naturalDam.damHeight.toFixed(0)} m</div></div>
            <div className="stat"><div className="label">Lake volume</div><div className="value">{(d.naturalDam.lakeVolumeM3 / 1e6).toFixed(2)} MCM</div></div>
          </div>
        </div>
      )}
      <div className="card">
        <h3>Hazard area (depth × velocity)</h3>
        <Bars data={d.impact.hazardAreaKm2.slice(1).map((a, i) => ({ c: `H${i + 1}`, km2: a }))} x="c" y="km2" colors={hazardColor.slice(1)} />
      </div>
    </div>
  )
}

function ImpactTab({ d, flyTo }: { d: RunDetail; flyTo: (lon: number, lat: number) => void }) {
  const imp = d.impact
  return (
    <div className="stack">
      <h3>Settlements and facilities ({imp.places.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th className="num">Pop.</th><th className="num">Arrival</th><th className="num">Depth</th><th className="num">Vel.</th><th>Hazard</th><th className="num">Golden</th></tr></thead>
          <tbody>
            {imp.places.map(p => (
              <tr key={p.name + p.lat} className="clickable" onClick={() => flyTo(p.lon, p.lat)} title={p.advice}>
                <td>{p.name} <span className="faint">{p.kind !== 'Village' ? p.kind : ''}</span></td>
                <td className="num">{fmt.n(p.population)}</td>
                <td className="num">{fmt.min(p.arrivalMin)}</td>
                <td className="num">{p.maxDepth.toFixed(1)}</td>
                <td className="num">{p.maxSpeed.toFixed(1)}</td>
                <td><span className="haz" style={hazStyle(p.hazardClass)}>{p.hazardLabel}</span></td>
                <td className="num" style={{ color: p.goldenTimeMin != null && p.goldenTimeMin < 15 ? 'var(--danger-text)' : undefined, fontWeight: p.goldenTimeMin != null && p.goldenTimeMin < 15 ? 600 : undefined }}>{fmt.n(p.goldenTimeMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint">Golden time = flood arrival − warning dissemination ({d.spec.warningMinutes} min) − walking time to dry ground. Negative means people cannot get out in time without an earlier warning.</p>

      <h3>Bridges (Army / NDRF movement)</h3>
      <div className="table-wrap" style={{ maxHeight: 220 }}>
        <table>
          <thead><tr><th>Bridge</th><th>Status</th><th className="num">Max WS</th><th className="num">Deck</th><th className="num">Overtop at</th></tr></thead>
          <tbody>
            {[...imp.bridges].sort((a, b) => Number(b.overtopped) - Number(a.overtopped)).map((b, i) => (
              <tr key={i} className="clickable" onClick={() => flyTo(b.lon, b.lat)}>
                <td>{b.name}</td>
                <td>{b.overtopped ? <span className="badge red">overtopped</span> : <span className="badge green">clear</span>}</td>
                <td className="num">{b.maxWaterSurface.toFixed(1)}</td>
                <td className="num">{b.deckLevel.toFixed(1)}</td>
                <td className="num">{fmt.min(b.overtopMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {imp.roads.length > 0 && (
        <>
          <h3>Roads cut</h3>
          <div className="table-wrap" style={{ maxHeight: 180 }}>
            <table>
              <thead><tr><th>Road</th><th>Class</th><th className="num">km flooded</th><th className="num">First cut</th></tr></thead>
              <tbody>{imp.roads.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.category}</td><td className="num">{r.floodedKm}</td><td className="num">{fmt.min(r.firstCutMin)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      <h3>Relief staging areas / helicopter landing zones</h3>
      <div className="table-wrap" style={{ maxHeight: 200 }}>
        <table>
          <thead><tr><th>Type</th><th className="num">Area ha</th><th className="num">Slope°</th><th className="num">From flood</th><th>Road</th><th className="num">Score</th></tr></thead>
          <tbody>
            {imp.staging.map(s => (
              <tr key={s.id} className="clickable" onClick={() => flyTo(s.lon, s.lat)}>
                <td>{s.type}</td><td className="num">{s.areaHa}</td><td className="num">{s.meanSlope}</td><td className="num">{s.distanceToFloodKm} km</td>
                <td>{s.nearRoad ? 'yes' : '-'}</td><td className="num">{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Early-warning sensor placement</h3>
      {imp.sensors.map((s, i) => (
        <div key={i} className="card tight clickable" onClick={() => flyTo(s.lon, s.lat)} role="button" tabIndex={0}>
          <b>S{i + 1}</b> · {s.distanceFromDamKm} km below dam · flood there at {fmt.min(s.arrivalMin)}
          <div className="faint">{s.leadTimes.slice(0, 5).map(l => `${l.place} +${l.leadMin.toFixed(0)} min`).join(' · ') || 'no downstream settlement'}</div>
        </div>
      ))}

      <h3>Loss & damage (indicative)</h3>
      <div className="stats">
        <div className="stat"><div className="label">Residential</div><div className="value">₹{fmt.n(imp.loss.residentialInr / 1e7, 1)} cr</div></div>
        <div className="stat"><div className="label">Crops ({fmt.n(imp.loss.cropAreaHa)} ha)</div><div className="value">₹{fmt.n(imp.loss.cropInr / 1e7, 1)} cr</div></div>
        <div className="stat"><div className="label">Roads + bridges</div><div className="value">₹{fmt.n((imp.loss.roadsInr + imp.loss.bridgesInr) / 1e7, 1)} cr</div></div>
      </div>
      <p className="faint">{imp.loss.method}. Unit costs are configurable defaults - replace with the state schedule of rates before quoting.</p>
    </div>
  )
}

function HydraulicsTab({ d }: { d: RunDetail }) {
  const [profile, setProfile] = useState<any[] | null>(null)
  const [gauge, setGauge] = useState(0)
  useEffect(() => { get<any[]>(`/api/runs/${d.summary.id}/profile`).then(setProfile) }, [d.summary.id])
  const g = d.gauges[gauge]
  const gaugeRows = useMemo(() => (g ? rows(g.t, { depth: g.depth, speed: g.speed }, 1 / 60) : []), [g])
  return (
    <div className="stack">
      <div className="card">
        <h3>Longitudinal profile - maximum water surface</h3>
        {profile ? <Profile data={profile} /> : <Loader2 className="spin" />}
      </div>
      <div className="card">
        <h3>Arrival time along the river</h3>
        {profile && <Lines data={profile.filter(p => p.arrivalMin != null)} x="km" xLabel="km below dam" yLabel="min" lines={[{ key: 'arrivalMin', name: 'flood arrival', color: '#ef4444' }]} />}
      </div>
      {d.gauges.length > 0 && (
        <div className="card">
          <div className="card-title">
            <h3>Gauge</h3>
            <select value={gauge} onChange={e => setGauge(+e.target.value)} style={{ width: 'auto' }} aria-label="Gauge">
              {d.gauges.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
            </select>
          </div>
          <Lines data={gaugeRows} x="t" xLabel="time (min)" lines={[{ key: 'depth', name: 'depth (m)' }, { key: 'speed', name: 'velocity (m/s)' }]} />
        </div>
      )}
      {d.reservoirLevel && (
        <div className="card">
          <h3>Reservoir drawdown</h3>
          <Lines data={rows(d.reservoirLevel.t, { l: d.reservoirLevel.v }, 1 / 60)} x="t" xLabel="time (min)" yLabel="m" lines={[{ key: 'l', name: 'water level' }]} />
        </div>
      )}
      <pre className="code">{JSON.stringify(d.model, null, 2)}</pre>
    </div>
  )
}

function EnsembleTab({ e }: { e: any }) {
  const sorted = [...e.areas].sort((a: number, b: number) => a - b)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
  return (
    <div className="stack">
      <div className="info-box">{e.members} Monte Carlo runs over breach width, formation time, roughness{e.samples.some((s: any) => s.volumeFactor !== 1) ? ' and lake volume' : ''}. Switch the map to <b>probability</b> for the inundation probability map.</div>
      <div className="stats">
        <div className="stat"><div className="label">Area P10</div><div className="value">{pct(0.1).toFixed(2)}</div></div>
        <div className="stat"><div className="label">Area P50</div><div className="value">{pct(0.5).toFixed(2)}</div></div>
        <div className="stat"><div className="label">Area P90</div><div className="value">{pct(0.9).toFixed(2)}</div></div>
      </div>
      <h3>Probability each settlement floods (&gt; {e.threshold} m)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Place</th><th className="num">P(flooded)</th><th className="num">P90 depth</th></tr></thead>
          <tbody>
            {[...e.places].sort((a: any, b: any) => b.probability - a.probability).map((p: any) => (
              <tr key={p.name}><td>{p.name}</td><td className="num">{(p.probability * 100).toFixed(0)}%</td><td className="num">{p.p90.toFixed(1)} m</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Members</h3>
      <div className="table-wrap" style={{ maxHeight: 220 }}>
        <table>
          <thead><tr><th>#</th><th className="num">width ×</th><th className="num">time ×</th><th className="num">n ×</th><th className="num">area km²</th></tr></thead>
          <tbody>{e.samples.map((s: any, i: number) => (
            <tr key={i}><td>{s.index}</td><td className="num">{s.widthFactor.toFixed(2)}</td><td className="num">{s.timeFactor.toFixed(2)}</td><td className="num">{s.manningFactor.toFixed(2)}</td><td className="num">{e.areas[i]?.toFixed(2)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

const exportsList = [
  { f: 'pdf', label: 'HADR sitrep (PDF)', desc: 'One-page summary for District / NDRF / Army' },
  { f: 'shp', label: 'Shapefiles (.zip)', desc: 'Depth bands, hazard, arrival isochrones, settlements, bridges, staging' },
  { f: 'kmz', label: 'Google Earth (.kmz)', desc: 'Time-animated flood + placemarks' },
  { f: 'kml', label: 'KML', desc: 'Vector layers only' },
  { f: 'geojson', label: 'GeoJSON', desc: 'All layers in one FeatureCollection' },
  { f: 'asc', label: 'Rasters (ESRI ASCII)', desc: 'Max depth, velocity, arrival, hazard, probability' },
  { f: 'csv', label: 'CSV tables', desc: 'Settlements, bridges, hydrograph' },
  { f: 'cap', label: 'CAP 1.2 alert (XML)', desc: 'For NDMA SACHET / any CAP aggregator' },
  { f: 'delft3d', label: 'Delft3D FM model (.zip)', desc: '.mdu + UGRID net + forcing, ready to run' },
  { f: 'dualsphysics', label: 'DualSPHysics case (.zip)', desc: 'GenCase XML + bed STL + run scripts' },
]

function ExportTab({ d, reload }: { d: RunDetail; reload: () => void }) {
  const canSim = useCanSimulate()
  const [msg, setMsg] = useState<string | null>(null)
  const id = d.summary.id
  const wms = `${window.location.origin}/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`
  return (
    <div className="stack">
      {exportsList.map(e => (
        <button key={e.f} className="list-item row spread export-item" onClick={() => download(exportUrl(id, e.f)).catch(err => setMsg(err.message))}>
          <div><b>{e.label}</b><div className="faint">{e.desc}</div></div>
          <Download size={16} />
        </button>
      ))}
      <div className="card stack">
        <h3>Raise alert</h3>
        <p className="faint">Creates a CAP 1.2 alert (English + Hindi) from this run. Status defaults to <b>Exercise</b>; only switch to Actual for a real event.</p>
        <div className="row">
          <button className="btn accent" disabled={!canSim} onClick={() => post<any>(`/api/runs/${id}/alert?status=Exercise`).then(a => setMsg(a.headline)).catch(e => setMsg(e.message))}><Bell size={14} /> Exercise alert</button>
          <button className="btn danger solid" disabled={!canSim} onClick={() => confirm('Issue an ACTUAL alert? This is meant for real events only.') &&
            post<any>(`/api/runs/${id}/alert?status=Actual`).then(a => setMsg(a.headline)).catch(e => setMsg(e.message))}>Actual alert</button>
        </div>
        {msg && <div className="info-box">{msg} - see <a href="#/lakes">Lake watch & alerts</a></div>}
      </div>
      <div className="card">
        <h3>OGC WMS (Bhuvan / NDEM / QGIS)</h3>
        <pre className="code">{wms}{'\n'}layers: {id}:depth | hazard | arrival | velocity{d.ensemble ? ' | probability | p90' : ''}</pre>
      </div>
    </div>
  )
}
