import { useEffect, useRef, useState } from 'react';
import { DEMO_ORIGIN } from './services/demoData.js';

const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
let mapLoader;
function loadGoogleMap() {
  if (!mapLoader) mapLoader = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Map failed to load'));
    script.onerror = () => reject(new Error('Map failed to load'));
    document.head.appendChild(script);
  });
  return mapLoader;
}

export default function MapPanel({ origin, stops, onPickOrigin, live }) {
  const host = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!live || !key || !host.current) return;
    let cancelled = false;
    loadGoogleMap().then(maps => {
      if (cancelled || !host.current) return;
      map.current ||= new maps.Map(host.current, { center: { lat: (origin || DEMO_ORIGIN).latitude, lng: (origin || DEMO_ORIGIN).longitude }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      maps.event.clearListeners(map.current, 'click');
      map.current.addListener('click', event => onPickOrigin({ id: 'origin', latitude: event.latLng.lat(), longitude: event.latLng.lng(), label: 'Map selection' }));
      markers.current.forEach(marker => marker.setMap(null));
      markers.current = [...(origin ? [{ ...origin, name: 'Start' }] : []), ...stops].map((point, index) => new maps.Marker({
        map: map.current, position: { lat: point.latitude, lng: point.longitude },
        label: index ? String(index) : 'S', title: point.name || point.label || 'Start',
      }));
      const bounds = new maps.LatLngBounds();
      if (origin) {
        [origin, ...stops].forEach(point => bounds.extend({ lat: point.latitude, lng: point.longitude }));
        map.current.fitBounds(bounds, 60);
      }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [origin, stops, onPickOrigin]);

  if (live && key && !failed) return <div className="map-wrap"><div className="google-map" ref={host} role="region" aria-label="Map showing the starting point and selected stops" /><p className="map-note">Click the map to set a starting point. Markers show stop order; Google Maps calculates the road path after handoff.</p></div>;
  if (!origin) return <div className="map-wrap schematic map-empty"><p>Choose a starting point to begin.</p><p className="map-note">{key ? 'Click the map when it loads, use your current location, or enter coordinates.' : 'No browser map key is configured. Use your current location or enter coordinates.'}</p></div>;
  const points = [origin, ...stops];
  const minLat = Math.min(...points.map(p => p.latitude)), maxLat = Math.max(...points.map(p => p.latitude));
  const minLng = Math.min(...points.map(p => p.longitude)), maxLng = Math.max(...points.map(p => p.longitude));
  const xy = p => ({ x: 8 + 84 * (p.longitude - minLng) / Math.max(0.005, maxLng - minLng), y: 85 - 70 * (p.latitude - minLat) / Math.max(0.005, maxLat - minLat) });
  return <div className="map-wrap schematic"><svg viewBox="0 0 100 100" role="img" aria-label="Schematic plot of the selected stops">
    <path d={points.map((p, i) => `${i ? 'L' : 'M'}${xy(p).x} ${xy(p).y}`).join(' ')} fill="none" stroke="var(--color-map-route)" strokeWidth="1.1" strokeDasharray="2.5 2" />
    {points.map((p, i) => <g key={i}><circle cx={xy(p).x} cy={xy(p).y} r="4" fill={i ? 'var(--color-deep)' : 'var(--color-map-route)'} /><text x={xy(p).x} y={xy(p).y + 1.5} fill="var(--color-surface)" textAnchor="middle" fontSize="4" fontWeight="700">{i || 'S'}</text></g>)}
  </svg><p className="map-note">Schematic straight-line plot of the stop order. It is not a road route. {live ? 'Add a restricted browser Maps key for an interactive map and manual origin selection.' : 'Demo locations are fictional.'}</p></div>;
}
