import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import maplibregl from 'maplibre-gl'
import { ArrowLeft, Droplets, Globe, Info, Loader2, MapPin, Mountain, Play, Search, Snowflake } from 'lucide-react'
import { Dam, get, post, RunSummary, ScenarioSpec } from '../api'
import { useCanSimulate, viewerHint } from '../auth'
import MapView, { around, Bounds, INDIA, points, setGeoJson } from '../components/MapView'
import Workspace from '../components/Workspace'
import ScenarioOptions, { defaultSpec, initialSpec } from '../components/ScenarioOptions'
import { go } from '../App'

const categoryColor: Record<string, string> = {
  Reservoir: '#0369a1',
  NaturalLake: '#d97706',
  Glacial: '#0891b2',
  Transboundary: '#dc2626',
}
const categoryIcon: Record<string, typeof Droplets> = { Reservoir: Droplets, NaturalLake: Mountain, Glacial: Snowflake, Transboundary: Globe }
const categoryLabel: Record<string, string> ={ Reservoir: 'Reservoir', NaturalLake: 'Natural lake', Glacial: 'Glacial lake', Transboundary: 'Transboundary' }

export default function SimulatePage() {
  const canSim = useCanSimulate()
  const [dams, setDams] = useState<Dam[]>([])
  const [filter, setFilter] = useState('')
  const [cat, setCat] = useState('All')
  const [selected, setSelected] = useState<Dam | null>(null)
  const [spec, setSpec] = useState<ScenarioSpec>(initialSpec(defaultSpec()))
  const [cascade, setCascade] = useState(false)
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    get<Dam[]>('/api/dams').then(setDams).catch(e => setError(e.message))
  }, [])

  const pickDam = useCallback(async (d: Dam, withCascade = cascade) => {
    setSelected(d)
    setCustom(false)
    setError(null)
    try {
      const s = await get<ScenarioSpec>(`/api/dams/${d.id}/scenario?cascade=${withCascade}`)
      setSpec(initialSpec({ ...defaultSpec(), ...s, structure: s.structure ?? null }))
    } catch (e: any) {
      setError(e.message)
    }
  }, [cascade])

  const drawDams = useCallback((map: MlMap, list: Dam[]) => {
    setGeoJson(map, 'dams', points(list.map(d => ({ lon: d.lon, lat: d.lat, props: { id: d.id, name: d.name, color: categoryColor[d.category] ?? '#64748b' } }))), [
      { id: 'dams-sel', type: 'circle', filter: ['==', ['get', 'id'], -1], paint: { 'circle-radius': 15, 'circle-color': ['get', 'color'], 'circle-opacity': 0.25, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } } as any,
      { id: 'dams-dot', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    ])
  }, [])

  useEffect(() => {
    if (mapReady && mapRef.current && dams.length) drawDams(mapRef.current, dams)
  }, [dams, drawDams, mapReady])

  // ring around the selected dam
  useEffect(() => {
    const map = mapRef.current
    if (mapReady && map?.getLayer('dams-sel')) map.setFilter('dams-sel', ['==', ['get', 'id'], selected?.id ?? -1])
  }, [selected, mapReady, dams])

  const onReady = useCallback((map: MlMap) => {
    mapRef.current = map
    setMapReady(true)
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
    map.on('mouseenter', 'dams-dot', e => {
      map.getCanvas().style.cursor = 'pointer'
      const f = e.features?.[0]
      if (f) popup.setLngLat((f.geometry as any).coordinates).setHTML(`<b>${f.properties?.name}</b>`).addTo(map)
    })
    map.on('mouseleave', 'dams-dot', () => { map.getCanvas().style.cursor = ''; popup.remove() })
    map.on('click', 'dams-dot', e => {
      const id = e.features?.[0]?.properties?.id
      if (id) window.dispatchEvent(new CustomEvent('pd-pick-dam', { detail: id }))
    })
  }, [])

  // map clicks on a dam marker come through a DOM event so the handler always sees fresh state
  useEffect(() => {
    const h = (e: Event) => {
      const d = dams.find(x => x.id === (e as CustomEvent).detail)
      if (d && !custom) pickDam(d)
    }
    window.addEventListener('pd-pick-dam', h)
    return () => window.removeEventListener('pd-pick-dam', h)
  }, [dams, pickDam, custom])

  const onMapClick = useCallback((ll: { lng: number; lat: number }) => {
    if (!custom) return
    setSpec(s => ({ ...s, dam: { ...s.dam, lon: +ll.lng.toFixed(5), lat: +ll.lat.toFixed(5) } }))
    const map = mapRef.current
    if (map) setGeoJson(map, 'custom-dam', points([{ lon: ll.lng, lat: ll.lat }]), [
      { id: 'custom-dam', type: 'circle', paint: { 'circle-radius': 8, 'circle-color': '#d97706', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
    ])
  }, [custom])

  const clearCustomMarker = () => {
    const map = mapRef.current
    const src = map?.getSource('custom-dam') as maplibregl.GeoJSONSource | undefined
    src?.setData(points([]))
  }

  const startCustom = () => {
    setSelected(null)
    setCustom(true)
    setError(null)
    setSpec(initialSpec({ ...defaultSpec(), name: 'Custom dam failure' }))
  }

  const backToRegister = () => {
    setSelected(null)
    setCustom(false)
    setError(null)
    clearCustomMarker()
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      if (custom && spec.dam.lon === 0 && spec.dam.lat === 0) throw new Error('Click the dam location on the map first.')
      const r = await post<RunSummary>(`/api/runs${selected ? `?damId=${selected.id}` : ''}`, spec)
      go('results', r.id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => dams.filter(d => (cat === 'All' || d.category === cat) && (d.name + d.river + d.state).toLowerCase().includes(filter.toLowerCase())), [dams, filter, cat])
  const setDam = (patch: Partial<ScenarioSpec['dam']>) => setSpec(s => ({ ...s, dam: { ...s.dam, ...patch } }))
  const editing = !!selected || custom
  const customPlaced = custom && (spec.dam.lon !== 0 || spec.dam.lat !== 0)

  // the map follows what the panel is about: all of India, the chosen dam, or the placed custom dam
  const fitTo: Bounds = selected
    ? around(selected.lon, selected.lat, Math.max(15, Math.min(60, (spec.downstreamKm || 40) / 2)))
    : customPlaced ? around(spec.dam.lon, spec.dam.lat, 20) : INDIA

  return (
    <Workspace side={<>
        {!editing ? (
          <>
            <div className="side-head">
              <div className="row spread">
                <div>
                  <h1>Dam break scenario</h1>
                  <div className="subtitle">Choose a dam to simulate its failure</div>
                </div>
                <button className="btn small" onClick={startCustom}><MapPin size={13} aria-hidden /> Custom dam</button>
              </div>
              <div className="search">
                <Search size={14} aria-hidden />
                <input type="text" aria-label="Search dams" placeholder="Search by dam, river or state" value={filter} onChange={e => setFilter(e.target.value)} />
              </div>
              <div className="chips" role="group" aria-label="Filter by type">
                {['All', ...Object.keys(categoryLabel)].map(k => (
                  <button key={k} className={`chip ${cat === k ? 'on' : ''}`} aria-pressed={cat === k} onClick={() => setCat(k)}>
                    {k !== 'All' && <span className="cat-dot" style={{ background: categoryColor[k] }} />}
                    {k === 'All' ? `All ${dams.length}` : categoryLabel[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="side-body">
              <div className="list">
                {shown.map(d => {
                  const c = categoryColor[d.category] ?? '#64748b'
                  const Icon = categoryIcon[d.category] ?? Droplets
                  return (
                    <button key={d.id} className="list-item dam-row" onClick={() => pickDam(d)} title={`${d.name} - ${categoryLabel[d.category] ?? d.category}`}>
                      <span className="dam-icon" style={{ color: c }}><Icon size={17} aria-hidden /></span>
                      <span className="dam-meta">
                        <span className="title">{d.name}</span>
                        <span className="faint" style={{ display: 'block' }}>{d.river} · {d.state}</span>
                      </span>
                      <span className="dam-figs"><b>{d.heightM} m</b><br />{d.grossStorageMcm.toLocaleString('en-IN')} MCM</span>
                    </button>
                  )
                })}
                {shown.length === 0 && <div className="empty">No dams match "{filter}".</div>}
              </div>
              <div className="info-box row" style={{ alignItems: 'flex-start' }}>
                <Info size={14} style={{ flex: 'none', marginTop: 2 }} aria-hidden />
                <span>Pick a dam from the list or the map, or place a <b>custom dam</b>. For landslide or glacial lakes use <a href="#/natural">Natural dams</a>.</span>
              </div>
              {error && <div className="alert-box">{error}</div>}
            </div>
          </>
        ) : (
          <>
            <div className="side-head">
              <button className="back-link" onClick={backToRegister}><ArrowLeft size={13} aria-hidden /> All dams</button>
              <div>
                <h1>{selected ? selected.name : 'Custom dam'}</h1>
                <div className="subtitle">
                  {selected ? `${selected.river} · ${selected.state} · ${selected.type}` : customPlaced ? `${spec.dam.lat.toFixed(4)}, ${spec.dam.lon.toFixed(4)}` : 'Click on the river in the map to place the dam'}
                </div>
              </div>
            </div>
            <div className="side-body">
              {selected?.approximate && (
                <div className="warn-box">Values for this dam are approximate. {selected.notes}</div>
              )}

              <div className="field">
                <label htmlFor="sname">Scenario name</label>
                <input id="sname" type="text" value={spec.name} onChange={e => setSpec({ ...spec, name: e.target.value })} />
              </div>

              <div>
                <h3>Dam and failure</h3>
                <div className="fields">
                  <div className="field">
                    <label htmlFor="dtype">Dam type</label>
                    <select id="dtype" value={spec.dam.type} onChange={e => setDam({ type: e.target.value })}>
                      {['Earthfill', 'Rockfill', 'Concrete', 'LandslideDam', 'MoraineDam'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="mode">Failure mode</label>
                    <select id="mode" value={spec.dam.failureMode} onChange={e => setDam({ failureMode: e.target.value })}>
                      <option>Overtopping</option><option>Piping</option><option>Instantaneous</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="h">Dam height (m)</label>
                    <input id="h" type="number" value={spec.dam.heightM} onChange={e => setDam({ heightM: +e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="v">Reservoir volume (MCM)</label>
                    <input id="v" type="number" value={+(spec.dam.reservoirVolumeM3 / 1e6).toFixed(3)} onChange={e => setDam({ reservoirVolumeM3: +e.target.value * 1e6 })} />
                  </div>
                  <div className="field">
                    <label htmlFor="hw">Water depth at failure (m)</label>
                    <input id="hw" type="number" placeholder={`${(spec.dam.heightM * 0.95).toFixed(0)} (95% of height)`} value={spec.dam.waterDepthM ?? ''}
                      onChange={e => setDam({ waterDepthM: e.target.value === '' ? null : +e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="cl">Crest length (m)</label>
                    <input id="cl" type="number" value={spec.dam.crestLengthM} onChange={e => setDam({ crestLengthM: +e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="bm">Breach method</label>
                    <select id="bm" value={spec.dam.breachMethod ?? ''} onChange={e => setDam({ breachMethod: e.target.value || null })}>
                      <option value="">Auto (by dam type)</option>
                      <option value="Froehlich2008">Froehlich 2008</option>
                      <option value="MacDonaldLangridgeMonopolis">MacDonald & Langridge-Monopolis</option>
                      <option value="CostaSchuster">Costa & Schuster (landslide)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="bw">Breach width (m)</label>
                    <input id="bw" type="number" placeholder="empirical" value={spec.dam.breachWidthM ?? ''} onChange={e => setDam({ breachWidthM: e.target.value === '' ? null : +e.target.value })} />
                  </div>
                </div>
              </div>

              {!!selected?.cascadeWith?.length && (
                <label className="check card flat tight">
                  <input type="checkbox" checked={cascade} onChange={e => { setCascade(e.target.checked); pickDam(selected, e.target.checked) }} />
                  <span><b>Cascade failure</b> - include downstream dam(s): {selected.cascadeWith.join(', ')}</span>
                </label>
              )}
              {spec.mode === 'Cascade' && (
                <div className="info-box">{spec.downstreamDams.map(d => d.name).join(', ')} will be built into the grid and fail if overtopped.</div>
              )}

              <ScenarioOptions spec={spec} onChange={setSpec} />

              <p className="faint">
                Model chain: terrain → river tracing → breach outflow → near-field SPH → 2D flood routing → hazard, loss, golden time and
                staging areas → map exports.
              </p>
            </div>
            <div className="side-foot">
              {error && <div className="alert-box" role="alert">{error}</div>}
              <button className="btn primary lg block" onClick={run} disabled={busy || !canSim || (custom && !customPlaced)} title={canSim ? undefined : viewerHint}>
                {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} aria-hidden />} Run simulation
              </button>
              {!canSim && <div className="faint" style={{ textAlign: 'center' }}>{viewerHint}</div>}
            </div>
          </>
        )}
      </>}>
      <MapView onReady={onReady} onClick={onMapClick} fitTo={fitTo} initialBasemap="streets"
        hint={custom ? (customPlaced ? 'Click again to move the dam' : 'Click on the river to place the dam') : null}>
        <div className="map-panel map-legend">
          <div className="legend-title">Dam register</div>
          {Object.entries(categoryColor).map(([k, c]) => (
            <div key={k} className="item"><span className="sw round" style={{ background: c }} />{categoryLabel[k]}</div>
          ))}
        </div>
      </MapView>
    </Workspace>
  )
}
