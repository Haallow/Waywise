import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEMO_ORIGIN } from './services/demoData.js';

const icon = label => L.divIcon({ className: 'waywise-marker', html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const candidateIcon = L.divIcon({ className: 'waywise-candidate-marker', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
function Controls({ points, pointsKey, onPickOrigin, live }) {
  const map = useMap();
  useMapEvents({ click: e => { if (live) onPickOrigin({ id: 'origin', latitude: e.latlng.lat, longitude: e.latlng.lng, label: 'Map selection' }); } });
  useEffect(() => { if (points.length > 1) map.fitBounds(points.map(p => [p.latitude, p.longitude]), { padding: [35, 35], maxZoom: 14 }); else if (points.length) map.setView([points[0].latitude, points[0].longitude], 13); }, [map, pointsKey]);
  return null;
}
export default function MapPanel({ origin, stops = [], candidates = [], onPickOrigin = () => {}, live = false, roadPositions = null }) {
  const points = [...(origin ? [origin] : []), ...stops];
  const selectedIds = new Set(stops.map(p => p.placeId));
  const alternatives = [...new Map(candidates.filter(p => !selectedIds.has(p.placeId)).map(p => [p.placeId, p])).values()];
  const pointsKey = [...points, ...alternatives].map(p => `${p.latitude},${p.longitude}`).join('|');
  const center = origin || (live ? { latitude: 0, longitude: 0 } : DEMO_ORIGIN);
  return <div className={`map-wrap ${live ? '' : 'demo-map'}`} role="region" aria-label={live ? 'Interactive route map' : 'Fictional demo route map'}><MapContainer key={live ? 'live' : 'demo'} className="leaflet-map" center={[center.latitude, center.longitude]} zoom={origin ? 13 : 2} scrollWheelZoom={false}>
    {live && <TileLayer url={import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' />}
    <Controls points={[...points, ...alternatives]} pointsKey={pointsKey} onPickOrigin={onPickOrigin} live={live} />
    {alternatives.map(p => <Marker key={`candidate-${p.placeId}`} position={[p.latitude, p.longitude]} icon={candidateIcon}><Popup><strong>{p.name}</strong><br />{p.category} candidate · {p.dataSource === 'demo' ? 'fictional' : p.dataSource === 'google' ? 'Google Places' : 'OpenStreetMap'}</Popup></Marker>)}
    {points.map((p, i) => <Marker key={`${p.id || p.placeId}-${i}`} position={[p.latitude, p.longitude]} icon={icon(i || 'S')}><Popup>{i ? `${i}. ${p.name}` : 'Start'}</Popup></Marker>)}
    {roadPositions?.length > 1 ? <Polyline positions={roadPositions} pathOptions={{ className: 'waywise-route-line', weight: 4 }} /> : points.length > 1 && <Polyline positions={points.map(p => [p.latitude, p.longitude])} pathOptions={{ className: 'waywise-route-line', weight: 3, dashArray: '7 8' }} />}
  </MapContainer>{!live && <div className="demo-map-key" aria-hidden="true"><strong>Fictional trip plot</strong><span>Offline · no map tiles</span></div>}<p className="map-note">{live ? origin ? 'Click the map to change your start. ' : 'World view until you choose a start. Click the map, search an address, or use your location. ' : 'Offline fictional coordinate plot. '}S marks the start; numbered markers are chosen stops. {alternatives.length > 0 && 'Small dots are other venues considered. '}{roadPositions?.length > 1 ? 'Solid line: ORS road route. ' : points.length > 1 ? 'Dashed line shows stop order, not roads. ' : ''}{live && 'Map data © OpenStreetMap contributors.'}</p></div>;
}
