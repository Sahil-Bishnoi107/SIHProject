import maplibregl, { GeoJSONSource, ImageSource, LayerSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Box, Globe, Map as MapIcon, Maximize, Mountain, MousePointerClick } from 'lucide-react'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useMapInset } from './Workspace'

export type Basemap = 'satellite' | 'streets' | 'terrain'
export type Bounds = [number, number, number, number]
export const INDIA: Bounds = [68, 7, 97.5, 35.5]

const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    streets: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Basemap &copy; Esri, HERE, Garmin, OpenStreetMap contributors',
    },
    imagery: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    },
    // served (and cached for offline use) by our own backend
    dem: {
      type: 'raster-dem',
      tiles: ['/api/tiles/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
      attribution: 'Terrain: AWS Terrain Tiles (SRTM, GMTED, ETOPO)',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eef2f6' } },
    { id: 'streets', type: 'raster', source: 'streets', layout: { visibility: 'none' } },
    { id: 'imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' } },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: { 'hillshade-shadow-color': '#475569', 'hillshade-exaggeration': 0.3, 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#64748b' },
    },
  ],
}

type Props = {
  center?: [number, number]
  zoom?: number
  /** Extent the map opens on (no fly-in from all-India) and returns to with the Fit button. */
  fitTo?: Bounds | null
  onReady?: (map: MlMap) => void
  onClick?: (lngLat: { lng: number; lat: number }) => void
  /** Pill shown at the top of the map, e.g. "Click the map to place the dam". */
  hint?: string | null
  children?: ReactNode
  initialBasemap?: Basemap
}

export default function MapView({ center = [79.5, 23.5], zoom = 4.2, fitTo, onReady, onClick, hint, children, initialBasemap = 'streets' }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const clickRef = useRef(onClick)
  const fitRef = useRef(fitTo)
  const [basemap, setBasemap] = useState<Basemap>(initialBasemap)
  const [terrain3d, setTerrain3d] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const fittedKey = useRef(fitTo?.join(','))
  const inset = useMapInset()
  const insetRef = useRef(inset)
  clickRef.current = onClick
  fitRef.current = fitTo
  insetRef.current = inset

  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: baseStyle,
      ...(fitTo ? { bounds: toLngLat(fitTo), fitBoundsOptions: { padding: 48 } } : { center, zoom }),
      maxPitch: 75,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.on('click', e => clickRef.current?.(e.lngLat))
    map.on('load', () => {
      // the constructor framed the extent before the grid settled; re-frame instantly at the real size
      map.resize()
      map.setPadding(pad(insetRef.current))
      if (fitRef.current) map.fitBounds(toLngLat(fitRef.current), { padding: 48, duration: 0, maxZoom: 14 })
      setLoaded(true)
      onReady?.(map)
    })
    mapRef.current = map

    // the grid column next to the map changes width (panels open, tabs switch); keep the canvas in sync
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // a new extent (another run, another dam) re-frames the map; the initial one is set in the constructor
  const fitKey = fitTo?.join(',')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitTo || fitKey === fittedKey.current) return
    fittedKey.current = fitKey
    fitBounds(map, fitTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  // the floating panel opened/closed: slide the visual centre instead of jumping
  useEffect(() => {
    const map = mapRef.current
    // skip no-op eases: any camera animation cancels one already running (e.g. a fly-to-dam)
    if (!map || !loaded || map.getPadding().left === inset) return
    map.easeTo({ padding: pad(inset), duration: 350 })
  }, [inset, loaded])

  // Style changes wait for 'load'. Camera moves only happen on an actual user toggle: an unconditional
  // easeTo here used to cancel the initial fly-to-the-flood animation and leave the map on all of India.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.setLayoutProperty('streets', 'visibility', basemap === 'streets' ? 'visible' : 'none')
    map.setLayoutProperty('imagery', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', basemap === 'terrain' ? 0.85 : basemap === 'streets' ? 0 : 0.25)
  }, [basemap, loaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    if (terrain3d) {
      map.setTerrain({ source: 'dem', exaggeration: 1.4 })
      map.easeTo({ pitch: 60, duration: 800 })
    } else if (map.getTerrain()) {
      map.setTerrain(null)
      map.easeTo({ pitch: 0, duration: 600 })
    }
  }, [terrain3d, loaded])

  const refit = () => {
    const map = mapRef.current
    if (map && fitRef.current) fitBounds(map, fitRef.current)
  }

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      <div className="map-toolbar">
        <div className="segmented" role="group" aria-label="Base map">
          <button className={basemap === 'streets' ? 'on' : ''} onClick={() => setBasemap('streets')} aria-pressed={basemap === 'streets'}>
            <MapIcon size={13} aria-hidden /> Map
          </button>
          <button className={basemap === 'satellite' ? 'on' : ''} onClick={() => setBasemap('satellite')} aria-pressed={basemap === 'satellite'}>
            <Globe size={13} aria-hidden /> Satellite
          </button>
          <button className={basemap === 'terrain' ? 'on' : ''} onClick={() => setBasemap('terrain')} aria-pressed={basemap === 'terrain'} title="Hillshade only - works offline">
            <Mountain size={13} aria-hidden /> Terrain
          </button>
        </div>
        <button className={`btn small ${terrain3d ? 'primary' : ''}`} onClick={() => setTerrain3d(v => !v)} aria-pressed={terrain3d} title="3D terrain">
          <Box size={13} aria-hidden /> 3D
        </button>
        {fitTo && (
          <button className="btn small" onClick={refit} title="Zoom back to the area of interest">
            <Maximize size={13} aria-hidden /> Fit
          </button>
        )}
      </div>
      {hint && <div className="map-hint" role="status"><MousePointerClick size={14} aria-hidden /> {hint}</div>}
      {children}
    </div>
  )
}

// ---------- helpers used by the pages ----------

const pad = (left: number) => ({ left, top: 0, right: 0, bottom: 0 })

const toLngLat = (b: Bounds): [[number, number], [number, number]] => [[b[0], b[1]], [b[2], b[3]]]

export function setGeoJson(map: MlMap, id: string, data: GeoJSON.GeoJSON, layers: Omit<LayerSpecification, 'source'>[]) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (src) src.setData(data as any)
  else map.addSource(id, { type: 'geojson', data: data as any })
  for (const l of layers) {
    if (!map.getLayer(l.id)) map.addLayer({ ...l, source: id } as LayerSpecification)
  }
}

export function removeSource(map: MlMap, id: string) {
  const style = map.getStyle()
  if (!style) return
  for (const l of style.layers) if ((l as any).source === id) map.removeLayer(l.id)
  if (map.getSource(id)) map.removeSource(id)
}

/** Image overlay (EPSG:4326 PNG from the backend) placed on the run's bounds. */
export function setImage(map: MlMap, id: string, url: string, b: Bounds, opacity = 0.85, before?: string) {
  const coords: [[number, number], [number, number], [number, number], [number, number]] = [
    [b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]],
  ]
  const src = map.getSource(id) as ImageSource | undefined
  if (src) src.updateImage({ url, coordinates: coords })
  else {
    map.addSource(id, { type: 'image', url, coordinates: coords })
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } },
      before && map.getLayer(before) ? before : undefined)
  }
  map.setPaintProperty(id, 'raster-opacity', opacity)
}

export function points(features: { lon: number; lat: number; props?: Record<string, unknown> }[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: f.props ?? {} })),
  }
}

export function fitBounds(map: MlMap, b: Bounds, padding = 48) {
  map.fitBounds(toLngLat(b), { padding, duration: 800, maxZoom: 14 })
}

/** Small box around a point, for "zoom to this dam" style framing. */
export function around(lon: number, lat: number, km = 12): Bounds {
  const dLat = km / 111
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}

/** Bounds of a set of points (null when empty). */
export function extent(pts: { lon: number; lat: number }[]): Bounds | null {
  if (!pts.length) return null
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const p of pts) { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat) }
  if (e - w < 0.02 && n - s < 0.02) return around((w + e) / 2, (s + n) / 2, 10)
  return [w, s, e, n]
}
