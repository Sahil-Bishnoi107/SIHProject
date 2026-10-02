import { useState } from 'react'
import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { ScenarioSpec } from '../api'

type Props = { spec: ScenarioSpec; onChange: (s: ScenarioSpec) => void }

/** Model / SPH / ensemble options shared by the dam-break and natural-dam forms. */
export default function ScenarioOptions({ spec, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<ScenarioSpec>) => onChange({ ...spec, ...patch })
  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Simulation settings</h3>
        <button type="button" className="btn small" onClick={() => onChange(quickSpec(spec))}
          title="No SPH, 3 h, 40 km, coarser grid - finishes in a few minutes even on a small server">
          <Zap size={13} aria-hidden /> Quick demo
        </button>
      </div>
      {hosted && isQuick(spec) && (
        <div className="faint" style={{ marginBottom: 8 }}>Quick settings are on so the run finishes in a few minutes on this server.</div>
      )}
      <div className="fields">
        <div className="field">
          <label htmlFor="dur">Simulated duration (h)</label>
          <input id="dur" type="number" min={0.5} max={72} step={0.5} value={spec.durationHours} onChange={e => set({ durationHours: num(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="dkm">Downstream reach (km)</label>
          <input id="dkm" type="number" min={5} max={300} value={spec.downstreamKm} onChange={e => set({ downstreamKm: num(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="ens">Ensemble members</label>
          <input id="ens" type="number" min={0} max={100} value={spec.ensembleMembers} onChange={e => set({ ensembleMembers: num(e.target.value) })} />
          <span className="hint">0 = deterministic only; 20-50 for a probability map</span>
        </div>
        <div className="field">
          <label htmlFor="warn">Warning dissemination (min)</label>
          <input id="warn" type="number" min={0} max={240} value={spec.warningMinutes} onChange={e => set({ warningMinutes: num(e.target.value) })} />
        </div>
      </div>

      <label className="check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={spec.runSph} onChange={e => set({ runSph: e.target.checked })} />
        <span>
          Detailed breach-zone simulation (SPH)
          <span className="faint" style={{ display: 'block' }}>Impact forces near the dam, SPH vs 2D comparison. Slower.</span>
        </span>
      </label>

      <button className="btn ghost small" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginTop: 6, marginLeft: -8 }}>
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Advanced model settings
      </button>

      {open && (
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="fields">
            <div className="field">
              <label htmlFor="eng">Far-field engine</label>
              <select id="eng" value={spec.engine} onChange={e => set({ engine: e.target.value as ScenarioSpec['engine'] })}>
                <option value="Internal">SWE-2D (built in)</option>
                <option value="Delft3D">Delft3D FM (if installed)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cells">Max grid cells</label>
              <input id="cells" type="number" step={10000} min={5000} value={spec.maxCells} onChange={e => set({ maxCells: num(e.target.value) })} />
              <span className="hint">DEM is coarsened to fit</span>
            </div>
            <div className="field">
              <label htmlFor="n">Manning n (floodplain)</label>
              <input id="n" type="number" step={0.005} value={spec.manning} onChange={e => set({ manning: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="nc">Manning n (channel)</label>
              <input id="nc" type="number" step={0.005} value={spec.channelManning} onChange={e => set({ channelManning: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="burn">Channel burn depth (m)</label>
              <input id="burn" type="number" step={0.5} value={spec.channelBurnM} onChange={e => set({ channelBurnM: num(e.target.value) })} />
              <span className="hint">no bathymetry in open DEMs</span>
            </div>
            <div className="field">
              <label htmlFor="zoom">DEM zoom (terrain tiles)</label>
              <select id="zoom" value={spec.demZoom} onChange={e => set({ demZoom: num(e.target.value) })}>
                <option value={11}>11 (~76 m)</option>
                <option value={12}>12 (~38 m)</option>
                <option value={13}>13 (~19 m)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="arr">Arrival threshold (m)</label>
              <input id="arr" type="number" step={0.1} value={spec.arrivalDepth} onChange={e => set({ arrivalDepth: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="up">Upstream reach (km)</label>
              <input id="up" type="number" value={spec.upstreamKm} onChange={e => set({ upstreamKm: num(e.target.value) })} />
            </div>
          </div>

          {spec.runSph && (
            <div className="card flat tight stack">
              <h3>SPH near field</h3>
              <div className="fields">
                <div className="field">
                  <label htmlFor="res">Particles over dam height</label>
                  <input id="res" type="number" min={12} max={60} value={spec.sphResolution} onChange={e => set({ sphResolution: num(e.target.value) })} />
                </div>
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <label className="check">
                    <input type="checkbox" checked={spec.debrisFlow} onChange={e => set({ debrisFlow: e.target.checked })} /> Debris flow (Chamoli type)
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={spec.sphHandover} onChange={e => set({ sphHandover: e.target.checked })} /> SPH hydrograph handover
                  </label>
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={!!spec.structure}
                  onChange={e => set({ structure: e.target.checked ? { name: 'Barrage', distanceKm: 2, heightM: 15, widthM: 60 } : null })} />
                Compute impact force on a downstream structure
              </label>
              {spec.structure && (
                <div className="fields">
                  <div className="field">
                    <label htmlFor="sn">Structure</label>
                    <input id="sn" type="text" value={spec.structure.name} onChange={e => set({ structure: { ...spec.structure!, name: e.target.value } })} />
                  </div>
                  <div className="field">
                    <label htmlFor="sd">Distance below dam (km)</label>
                    <input id="sd" type="number" step={0.1} value={spec.structure.distanceKm} onChange={e => set({ structure: { ...spec.structure!, distanceKm: num(e.target.value) } })} />
                  </div>
                  <div className="field">
                    <label htmlFor="sh">Height (m)</label>
                    <input id="sh" type="number" value={spec.structure.heightM} onChange={e => set({ structure: { ...spec.structure!, heightM: num(e.target.value) } })} />
                  </div>
                  <div className="field">
                    <label htmlFor="sw">Width (m)</label>
                    <input id="sw" type="number" value={spec.structure.widthM} onChange={e => set({ structure: { ...spec.structure!, widthM: num(e.target.value) } })} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Settings that finish in a few minutes even on a small cloud instance (Render free has 0.1 CPU, 512 MB). */
export const quickSpec = (s: ScenarioSpec): ScenarioSpec => ({
  ...s,
  runSph: false,
  sphHandover: false,
  ensembleMembers: 0,
  // measured at 0.1 CPU (Render free) on Bhakra: ~4 min. Cost grows ~cells^1.5, so the grid is coarsened
  // rather than the reach shortened - a 20 km reach often ends before the first village.
  durationHours: Math.min(s.durationHours, 3),
  downstreamKm: Math.min(s.downstreamKm, 40),
  maxCells: Math.min(s.maxCells, 30000),
  demZoom: 11,
})

/** Deployed copies start with the quick settings; running on the laptop keeps full quality. */
export const hosted = !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const isQuick = (s: ScenarioSpec) => !s.runSph && s.ensembleMembers === 0 && s.maxCells <= 30000
export const initialSpec =(s: ScenarioSpec) => (hosted ? quickSpec(s) : s)

export const defaultSpec = (): ScenarioSpec => ({
  name: 'Scenario',
  mode: 'DamBreak',
  dam: {
    name: 'Custom dam', lon: 0, lat: 0, type: 'Earthfill', heightM: 50, waterDepthM: null, reservoirVolumeM3: 50e6,
    crestLengthM: 300, crestWidthM: 10, failureMode: 'Overtopping', breachMethod: null, breachWidthM: null, formationTimeMin: null, storageExponent: 2.5,
  },
  naturalDam: null,
  downstreamDams: [],
  durationHours: 6,
  manning: 0.045,
  channelManning: 0.035,
  channelBurnM: 1.5,
  maxCells: 250000,
  downstreamKm: 40,
  upstreamKm: 8,
  engine: 'Internal',
  runSph: true,
  sphHandover: false,
  sphResolution: 24,
  debrisFlow: false,
  structure: null,
  ensembleMembers: 0,
  ensembleSeed: 42,
  arrivalDepth: 0.3,
  warningMinutes: 15,
  demZoom: 12,
})
