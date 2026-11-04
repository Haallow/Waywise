import { useEffect, useMemo, useRef, useState } from 'react';
import { optimize } from './agent/optimizer.js';
import { googleMapsUrl } from './agent/googleMapsUrl.js';
import { DEMO_ORIGIN, demoSnapshot } from './services/demoData.js';
import { errandsInSnapshot, groupsForPlanning, hasDistinctVenueAssignment, matrixNodesForGroups, savedGroupsForRefresh } from './services/refreshSnapshot.js';
import MapPanel from './MapPanel.jsx';

const CATEGORIES = ['coffee', 'groceries', 'church', 'spa', 'pharmacy', 'restaurant', 'bakery', 'bank', 'fuel', 'laundry', 'parking', 'other'];
const LABEL = { coffee: 'Coffee', groceries: 'Groceries', church: 'Church', spa: 'Spa', pharmacy: 'Pharmacy', restaurant: 'Restaurant', bakery: 'Bakery', bank: 'Bank', fuel: 'Gas station', laundry: 'Laundry', parking: 'Parking', other: 'Other shop' };
const initial = [];
const profiles = [['fastest', 'Fastest'], ['shortest', 'Shortest'], ['balanced', 'Balanced'], ['rated', 'Highly rated']];
const strategyHelp = {
  fastest: 'Prioritizes estimated driving time. When road time is unavailable, it uses approximate distance and labels the estimate.',
  shortest: 'Prioritizes travel distance. Without road routing, this is straight-line distance rather than road distance.',
  balanced: 'Gives driving time and distance equal weight. When road time is unavailable, it scores approximate distance alone.',
  rated: 'Favors confirmed Google ratings (70%) while still considering travel (30%). Unmatched venues have no claimed rating; without road time, travel uses approximate distance.'
};
const time = sec => sec == null ? 'Unavailable' : `${(sec / 60).toFixed(1)} min`;
const km = m => `${(m / 1000).toFixed(1)} km`;
const pct = x => `${(x * 100).toFixed(1)}%`;
const ArrowIcon = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 15 15 5M7 5h8v8" /></svg>;
const WaywiseLogo = () => <svg className="waywise-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false"><path d="M8 29c3.5-9.5 8.2-14.2 14.1-14.2 4.4 0 6.1 2.7 9.9-3.8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/><circle cx="8" cy="29" r="3.2" fill="currentColor"/><circle cx="22.1" cy="14.8" r="2.7" fill="currentColor"/><path d="M32 7.5c-3.1 0-5.6 2.4-5.6 5.4 0 4.1 5.6 10.1 5.6 10.1s5.6-6 5.6-10.1c0-3-2.5-5.4-5.6-5.4Z" fill="var(--color-accent)"/><circle cx="32" cy="12.9" r="1.8" fill="var(--color-deep)"/></svg>;
const sessionId = (() => {
  if (typeof window === 'undefined') return '';
  try {
    const key = 'waywise-session-id';
    let value = window.localStorage.getItem(key);
    if (!value) { value = crypto.randomUUID(); window.localStorage.setItem(key, value); }
    return value;
  } catch { return ''; }
})();
const locationErrorMessage = error => error?.code === 1 ? 'Location permission was denied. Search an address or enter coordinates.' : error?.code === 3 ? 'Location request timed out. Try again, search an address, or enter coordinates.' : 'Current location could not be determined. Click the map, search an address, or enter coordinates.';
const requestMessage = error => error?.name === 'AbortError' ? 'Search canceled.' : error?.name === 'TimeoutError' ? 'The request timed out.' : error instanceof TypeError ? 'Cannot reach the local Waywise API. Check that the server is running.' : error?.message || 'Request failed.';
async function responseData(response) {
  try { return await response.json(); }
  catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error;
    throw new Error('The local Waywise API returned unreadable data. Check that the server is running.');
  }
}
async function post(path, body, signal, timeoutMs = 20000) {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'X-Waywise-Session': sessionId } : {}) }, body: JSON.stringify(body), signal: requestSignal });
  const data = await responseData(r);
  if (!r.ok) throw new Error(data.error?.message || 'Request failed');
  return data;
}
async function geocode(q, signal) {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const r = await fetch(`/api/geocode?${new URLSearchParams({ q })}`, { headers: sessionId ? { 'X-Waywise-Session': sessionId } : {}, signal: requestSignal });
  const data = await responseData(r);
  if (!r.ok) throw new Error(data.error?.message || 'Address search failed');
  return data.results;
}
export default function App() {
  const [mode, setMode] = useState('demo');
  const [categories, setCategories] = useState(initial);
  const [profile, setProfile] = useState('balanced');
  const [scenario, setScenario] = useState('standard');
  const [radius, setRadius] = useState(4000);
  const [origin, setOrigin] = useState(DEMO_ORIGIN);
  const [lat, setLat] = useState(''), [lng, setLng] = useState('');
  const [query, setQuery] = useState(''), [searchResults, setSearchResults] = useState([]);
  const [snapshot, setSnapshot] = useState(() => demoSnapshot(initial));
  const [statuses, setStatuses] = useState({}), [completed, setCompleted] = useState([]), [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [venueNotice, setVenueNotice] = useState('');
  const [ratingNotice, setRatingNotice] = useState('');
  const [stale, setStale] = useState(false);
  const mobilePreviewRef = useRef(null), resultsHeadingRef = useRef(null), afterSearch = useRef(false), locationRequest = useRef(0), findController = useRef(null), addressController = useRef(null);
  const [roadPositions, setRoadPositions] = useState(null);
  const source = snapshot?.matrix?.dataSource;
  const live = mode === 'live' && snapshot?.dataSource === 'osm';
  const { errands: snapshotErrands, unplanned: unplannedCategories } = errandsInSnapshot(categories, statuses, snapshot, live);
  const unplannedKey = unplannedCategories.join('|');
  const effectiveOrigin = completed.length ? { ...completed.at(-1), id: completed.at(-1).placeId } : snapshot?.origin || origin;
  const groups = useMemo(() => groupsForPlanning(snapshot, overrides, completed, statuses), [snapshot, overrides, completed, statuses]);
  const result = useMemo(() => snapshot && (mode === 'demo' || live) ? optimize({ errands: snapshotErrands, groups, matrix: snapshot.matrix, profile, originId: effectiveOrigin.id }) : null, [snapshot, mode, live, categories, statuses, unplannedKey, groups, profile, effectiveOrigin?.id]);
  const plan = result?.plan, baseline = result?.baseline;
  const approx = source === 'approximate';
  const mapOrigin = completed.length ? effectiveOrigin : snapshot?.origin || origin;
  const navigation = plan ? googleMapsUrl(mapOrigin, plan.selectedStops) : null;
  useEffect(() => {
    if (!snapshot || !afterSearch.current) return;
    afterSearch.current = false;
    const target = plan && window.matchMedia('(max-width: 760px)').matches ? mobilePreviewRef.current : resultsHeadingRef.current;
    target?.focus(); target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [plan, snapshot]);
  const routeKey = source === 'ors' && plan ? [mapOrigin, ...plan.selectedStops].map(p => `${p.latitude},${p.longitude}`).join('|') : '';
  useEffect(() => {
    setRoadPositions(null);
    if (!routeKey) return;
    let active = true;
    post('/api/route', { points: [mapOrigin, ...plan.selectedStops].map(p => ({ latitude: p.latitude, longitude: p.longitude })) }, undefined, 35000).then(data => { if (active && data.dataSource === 'ors') setRoadPositions(data.positions); }).catch(() => {});
    return () => { active = false; };
  }, [routeKey]);
  const pending = categories.filter(c => !statuses[c] || statuses[c] === 'pending');
  const skipped = categories.filter(c => statuses[c] === 'skipped');
  const pickOrigin = point => { if (mode !== 'live' || busy) return; locationRequest.current++; setOrigin(point); setLat(String(point.latitude)); setLng(String(point.longitude)); setSnapshot(null); setCompleted([]); setStatuses({}); setOverrides({}); setStale(false); setVenueNotice(''); setRatingNotice(''); setError('Starting point changed. Optimize again to refresh the route.'); };
  const setCategory = cat => {
    const removing = categories.includes(cat);
    const next = removing ? categories.filter(c => c !== cat) : [...categories, cat];
    if (next.length > 4 || busy) return;
    if (snapshot) {
      setCategories(next);
      setStatuses(current => Object.fromEntries(Object.entries(current).filter(([category]) => next.includes(category))));
      setCompleted(current => current.filter(place => next.includes(place.category)));
      setOverrides(current => Object.fromEntries(Object.entries(current).filter(([category]) => next.includes(category))));
      if (mode === 'demo' && !removing) setSnapshot(demoSnapshot(next, scenario));
      if (mode === 'live' && !removing) {
        setStale(true);
        setError('Errand added. Find places & optimize to include it in a new route.');
      } else {
        setError(''); afterSearch.current = true;
      }
      return;
    }
    setCategories(next); setStatuses({}); setCompleted([]); setOverrides({}); setError(''); setStale(false);
    setSnapshot(mode === 'demo' ? demoSnapshot(next, scenario) : null);
  };
  const chooseMode = next => {
    if (busy) return;
    locationRequest.current++;
    setMode(next); setStatuses({}); setCompleted([]); setOverrides({}); setError(''); setVenueNotice(''); setRatingNotice(''); setStale(false);
    if (next === 'demo' && profile === 'rated') setProfile('balanced');
    if (next === 'demo') { setOrigin(DEMO_ORIGIN); setSnapshot(demoSnapshot(categories, scenario)); }
    else { setOrigin(null); setSnapshot(null); }
  };
  const setCoordinates = e => { e.preventDefault(); const latitude = Number(lat), longitude = Number(lng); if (!lat.trim() || !lng.trim() || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { setError('Enter valid latitude and longitude.'); return; } pickOrigin({ id: 'origin', latitude, longitude, label: 'Manual coordinates' }); };
  const useLocation = () => { if (!navigator.geolocation) { setError('Geolocation is unavailable. Search an address or enter coordinates.'); return; } const request = ++locationRequest.current; navigator.geolocation.getCurrentPosition(p => { if (request === locationRequest.current) pickOrigin({ id: 'origin', latitude: p.coords.latitude, longitude: p.coords.longitude, label: 'Current location' }); }, error => { if (request === locationRequest.current) setError(locationErrorMessage(error)); }, { timeout: 10000 }); };
  const search = async e => { e.preventDefault(); if (busy) return; const controller = new AbortController(); addressController.current = controller; setError(''); setBusy('Searching address…'); try { const data = await geocode(query.trim(), controller.signal); if (controller.signal.aborted) return; setSearchResults(data); if (!data.length) setError('No address found. Try a more specific query.'); } catch (e) { setError(requestMessage(e)); } finally { addressController.current = null; setBusy(''); } };
  const find = async () => {
    if (busy) return;
    if (!categories.length) { const message = 'Add at least one errand before finding places and optimizing.'; setError(message); window.alert(message); return; }
    if (!origin) { setError('Choose a starting point first.'); return; }
    const pendingCategories = categories.filter(category => !statuses[category] || statuses[category] === 'pending');
    if (!pendingCategories.length) { setError('No errands remain to plan. Restore a skipped errand or start another trip.'); return; }
    const controller = new AbortController(); findController.current = controller;
    setBusy('Finding nearby venues…'); setError('');
    try {
      const nextGroups = savedGroupsForRefresh(categories, statuses, snapshot, completed);
      let fallbackRadius = null;
      const googleCategories = [], osmCategories = [];
      const searchOrigin = completed.at(-1) || origin;
      for (const [index, category] of pendingCategories.entries()) {
        setBusy(`Finding ${LABEL[category].toLowerCase()} (${index + 1} of ${pendingCategories.length})…`);
        const data = await post('/api/places', { origin: searchOrigin, category, radiusMeters: radius }, controller.signal, 30000);
        if (!['google', 'osm'].includes(data.dataSource) || !Array.isArray(data.places) || data.places.some(p => !['google', 'osm'].includes(p.dataSource))) throw new Error('Venue source was not confirmed.');
        if (data.dataSource === 'google') googleCategories.push(category); else osmCategories.push(category);
        if (data.venueSource === 'ors-poi') fallbackRadius = data.searchRadiusMeters;
        if (!data.places.length) throw new Error(`No ${LABEL[category].toLowerCase()} found within ${(data.searchRadiusMeters || radius) / 1000} km. Change the origin or try again when Overpass is available.`);
        nextGroups[category] = data.places;
      }
      setBusy('Calculating route matrix…');
      const availableGroups = groupsForPlanning({ groups: nextGroups }, {}, completed, statuses);
      if (!hasDistinctVenueAssignment(pendingCategories, availableGroups)) throw new Error('The nearby shortlists cannot cover every errand with a different venue. Change the radius, origin, or errands.');
      const nodes = matrixNodesForGroups(origin, nextGroups);
      const matrix = await post('/api/matrix', { nodes, mode: 'DRIVE' }, controller.signal);
      if (controller.signal.aborted) throw new DOMException('Search canceled.', 'AbortError');
      if (!['ors', 'approximate'].includes(matrix.dataSource)) throw new Error('Route source was not confirmed.');
      const allVenues = Object.values(nextGroups).flat();
      const fallbackVenues = [...new Map(allVenues.filter(place => place.dataSource === 'osm').map(place => [place.placeId, place])).values()];
      let ratingStatus = fallbackVenues.length ? 'unavailable' : 'ready';
      let matchedCount = allVenues.filter(place => place.rating).length;
      if (fallbackVenues.length) {
        setBusy('Checking Google ratings…');
        try {
          const data = await post('/api/ratings', { places: fallbackVenues }, controller.signal, 40000);
          if (data.dataSource === 'google' && ['ready', 'partial', 'unconfigured'].includes(data.status)) {
            ratingStatus = data.status; matchedCount += data.matchedCount;
            for (const group of Object.values(nextGroups)) for (const place of group) if (data.ratings[place.placeId]) place.rating = data.ratings[place.placeId];
          }
        } catch (ratingError) { if (controller.signal.aborted) throw ratingError; }
      }
      const sourceSummary = [
        googleCategories.length ? `${googleCategories.map(category => LABEL[category]).join(', ')} from Google Places` : '',
        osmCategories.length ? `${osmCategories.map(category => LABEL[category]).join(', ')} from OpenStreetMap fallback` : ''
      ].filter(Boolean).join(' · ');
      setRatingNotice(ratingStatus === 'unconfigured' ? `${sourceSummary}. Google ratings are unavailable until a Places API key is configured on the server.` :
        ratingStatus === 'unavailable' ? `${sourceSummary}. Google ratings could not be checked for fallback venues.` :
        `${sourceSummary}. ${matchedCount} shortlisted venues have Google ratings.${ratingStatus === 'partial' ? ' Some fallback lookups failed or reached a limit.' : ''}`);
      setSnapshot({ origin: { ...origin, id: 'origin' }, groups: nextGroups, matrix, dataSource: 'osm' });
      setOverrides(current => Object.fromEntries(Object.entries(current).filter(([category, placeId]) => nextGroups[category]?.some(place => place.placeId === placeId))));
      setStale(false); afterSearch.current = true;
      setVenueNotice(fallbackRadius ? `Overpass was unavailable. Some live OSM venues came from the ORS POI service within ${fallbackRadius / 1000} km of the start${radius > fallbackRadius ? ` (requested ${radius / 1000} km)` : ''}.` : '');
      if (matrix.fallbackReason) setError(matrix.fallbackReason);
    } catch (e) { setStale(!!snapshot); setError(`${requestMessage(e)}${snapshot ? ' The earlier route remains visible; run Find places & optimize to refresh it.' : ' Try again or use Demo Mode.'}`); }
    finally { findController.current = null; setBusy(''); }
  };
  const skip = c => setStatuses(s => ({ ...s, [c]: 'skipped' }));
  const restore = c => setStatuses(s => ({ ...s, [c]: 'pending' }));
  const complete = () => { if (!plan) return; const p = plan.selectedStops[0]; setCompleted(a => [...a, p]); setStatuses(s => ({ ...s, [p.category]: 'completed' })); };
  const undo = () => { const p = completed.at(-1); if (!p) return; setCompleted(a => a.slice(0, -1)); setStatuses(s => ({ ...s, [p.category]: 'pending' })); };
  const reset = () => { locationRequest.current++; setMode('demo'); setCategories(initial); setProfile('balanced'); setScenario('standard'); setOrigin(DEMO_ORIGIN); setSnapshot(demoSnapshot(initial)); setStatuses({}); setCompleted([]); setOverrides({}); setStale(false); setVenueNotice(''); setRatingNotice(''); setError(''); };
  const comparison = plan && baseline ? `Selected ${km(plan.travelDistanceMeters)}${plan.travelDurationSec == null ? '' : ` / ${time(plan.travelDurationSec)}`} versus nearest-next ${km(baseline.travelDistanceMeters)}${baseline.travelDurationSec == null ? '' : ` / ${time(baseline.travelDurationSec)}`}. Both use the same candidates and ${approx ? 'straight-line distance matrix' : 'directed matrix'}.` : '';
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><WaywiseLogo /></span><div><strong>Waywise</strong><span>Intelligent errand planning</span></div></div><div className="topbar-right"><span className="mode-badge">{mode === 'demo' ? 'FICTIONAL DEMO' : live ? approx ? 'LIVE OSM · APPROXIMATE' : 'LIVE OSM · ORS ROADS' : 'LIVE · NO ROUTE'}</span><span className="drive-label">Driving only</span></div></header>
    <main><section className="intro"><div><h1>Make every stop count.</h1><p>Choose your errands. Waywise compares complete trips, selecting both the places and visit order for your strategy.</p></div><div className="intro-fact"><strong>{result?.enumerated ?? '—'}</strong><span>complete routes compared locally</span></div></section>
      <p className="sr-only" role="status" aria-live="polite">{busy || (unplannedCategories.length ? `New errand not included yet. ${plan ? 'Previous route remains visible.' : ''} Find places and optimize to refresh.` : plan ? `Route updated: ${plan.selectedStops.length} stops. First stop ${plan.selectedStops[0].name}. ${approx ? `${km(plan.travelDistanceMeters)} straight-line distance; driving time unavailable.` : `${time(plan.travelDurationSec)} estimated drive.`}` : result?.reason || '')}</p>
      {plan && <aside className="mobile-route-preview" ref={mobilePreviewRef} tabIndex="-1" aria-label="Current route summary"><div className="mobile-route-top"><strong>{unplannedCategories.length ? 'Previous route' : 'Route ready'}</strong><span>{approx ? `${km(plan.travelDistanceMeters)} straight-line` : time(plan.travelDurationSec)}</span></div><p>{plan.selectedStops.map(p => p.name).join(' → ')}</p>{unplannedCategories.length > 0 && <p>New errand not included yet. Refresh the route before navigating.</p>}<div className="mobile-route-actions"><a className="secondary" href="#itinerary">View itinerary</a>{!unplannedCategories.length && <a className="primary" href={navigation} target="_blank" rel="noopener noreferrer">Open in Maps <ArrowIcon /></a>}</div></aside>}
      <div className="workspace"><aside className="controls origin-panel">
        <div className="control-block"><h2>Plan your trip</h2><p className="muted">Choose a starting point, then build your list of up to four stops.</p></div>
        <div className="control-block"><h3>Data source</h3><div className="segmented"><button className={mode === 'demo' ? 'active' : ''} onClick={() => chooseMode('demo')} aria-pressed={mode === 'demo'} disabled={!!busy}>Demo</button><button className={mode === 'live' ? 'active' : ''} onClick={() => chooseMode('live')} aria-pressed={mode === 'live'} disabled={!!busy}>Live map data</button></div><p className="hint">Demo data is fictional and offline. Live venues use OpenStreetMap; driving estimates appear when road routing is available.</p></div>
        {mode === 'demo' && <div className="control-block"><h3>Demo scenario</h3><div className="segmented"><button className={scenario === 'standard' ? 'active' : ''} onClick={() => { setScenario('standard'); setSnapshot(demoSnapshot(categories, 'standard')); setStatuses({}); setCompleted([]); setOverrides({}); }}>Standard</button><button className={scenario === 'bottleneck' ? 'active' : ''} onClick={() => { setScenario('bottleneck'); setSnapshot(demoSnapshot(categories, 'bottleneck')); setStatuses({}); setCompleted([]); setOverrides({}); }}>Bottleneck</button></div><p className="hint">Bottleneck changes one fictional directed leg.</p></div>}
        <div className="control-block"><h3>Starting point</h3>{mode === 'live' ? <><button className="secondary wide" onClick={useLocation} disabled={!!busy}>Use my current location</button><p className="hint">Or click the map, search an address, or enter coordinates.</p><form className="coordinate-form" onSubmit={search}><label className="wide">Address<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search address" minLength="3" /></label><button className="secondary" type="submit" disabled={!!busy}>Search</button></form>{busy && addressController.current && <button className="secondary wide" onClick={() => addressController.current?.abort()}>Cancel address search</button>}{searchResults.length > 0 && <div className="search-results">{searchResults.map((p, i) => <button key={i} onClick={() => { pickOrigin({ ...p, id: 'origin' }); setSearchResults([]); }}>{p.label}</button>)}</div>}<form className="coordinate-form" onSubmit={setCoordinates}><label>Latitude<input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} /></label><label>Longitude<input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} /></label><button className="secondary" type="submit" disabled={!!busy}>Set point</button></form></> : <p className="origin-text">Sample starting point · fictional trip</p>}<p className="coord">{origin ? `${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}` : 'No starting point selected'}</p></div>
        </aside><section className="results"><div className="map-header"><div><h2 ref={resultsHeadingRef} tabIndex="-1">Your route, considered.</h2><p>{source === 'demo' ? 'Synthetic directional travel data' : source === 'ors' ? 'Road driving estimate at calculation time; no traffic prediction' : approx ? 'Approximate straight-line distances; driving time unavailable' : 'Choose a start and optimize to see a route'}</p></div><span className="snapshot">{snapshot?.matrix ? `Calculated ${new Date(snapshot.matrix.fetchedAt).toLocaleString()}` : 'No snapshot'}</span></div>
        {mode === 'live' && venueNotice && <p className="hint" role="status">{venueNotice}</p>}
        {mode === 'live' && ratingNotice && <p className="hint" role="status">{ratingNotice}</p>}
        {stale && snapshot && <p className="hint" role="status">{unplannedCategories.length ? `${unplannedCategories.map(category => LABEL[category]).join(', ')} not included in the previous route. Run Find places & optimize to include the new errand.` : 'Search settings or errands changed. Run Find places & optimize to refresh the snapshot.'}</p>}
        <MapPanel origin={mapOrigin} stops={plan?.selectedStops || []} candidates={pending.flatMap(category => groups[category] || [])} onPickOrigin={pickOrigin} live={mode === 'live'} roadPositions={roadPositions} />
        {skipped.length > 0 && <section className="skipped-list"><strong>Skipped</strong>{skipped.map(c => <button key={c} className="secondary" onClick={() => restore(c)}>Restore {LABEL[c]}</button>)}</section>}
        {completed.length > 0 && <section className="completed-list"><div><strong>Completed</strong> {completed.map(p => p.name).join(' → ')}</div><button className="secondary" onClick={undo}>Undo {completed.at(-1).name} completion</button></section>}
        {plan ? <><div className="metrics"><div><span>{approx ? 'Drive time' : 'Estimated drive'}</span><strong>{time(plan.travelDurationSec)}</strong></div><div><span>{approx ? 'Straight-line distance' : 'Road distance'}</span><strong>{km(plan.travelDistanceMeters)}</strong></div><div><span>Plan score</span><strong>{pct(plan.utility)}</strong></div></div><p className="hint">{profile === 'rated' ? `Highly rated weighs matched Google ratings (70%) and travel (30%). ${plan.ratedStops} of ${plan.selectedStops.length} selected stops have Google ratings; unrated stops are neutral in the rating term.` : 'Plan score reflects your strategy’s travel time and distance, or distance alone when road time is unavailable.'}</p>
          <p className="decision-summary">{comparison} {!baseline ? 'Nearest-next could not complete every errand from this snapshot; the selected plan has all required legs.' : plan.utility > baseline.utility + 1e-9 ? `The selected plan scores ${pct(plan.utility)} versus ${pct(baseline.utility)} for ${profiles.find(p => p[0] === profile)?.[1]}.` : 'The selected plan matches the nearest-next score.'}</p>
          <div className="itinerary-head" id="itinerary"><div><h2>{unplannedCategories.length ? 'Previous itinerary' : 'Selected itinerary'}</h2><p>{completed.length ? `${completed.length} completed · ${plan.selectedStops.length} in this route${unplannedCategories.length ? ` · ${unplannedCategories.length} not yet included` : ''}` : `${plan.selectedStops.length} stops in agent-selected order${unplannedCategories.length ? ` · ${unplannedCategories.length} not yet included` : ''}`}</p></div><button className="secondary" onClick={complete} disabled={unplannedCategories.length > 0}>Mark {plan.selectedStops[0].name} complete</button></div>
          <ol className="itinerary">{plan.selectedStops.map((p, i) => <li key={p.placeId}><div className="stop-index">{i + 1}</div><div className="stop-body"><div className="stop-top"><strong>{p.name}</strong><span>{approx ? km(plan.legs[i].distanceMeters) + ' straight-line' : time(plan.legs[i].durationSec) + ' drive'}</span></div><p>{LABEL[p.category]} · {p.address || 'Address unavailable'} · {p.dataSource === 'demo' ? 'fictional' : 'OpenStreetMap'}</p>{live && <p>{p.rating ? <a href={p.rating.url} target="_blank" rel="noopener noreferrer">Google Maps ★ {p.rating.value.toFixed(1)} / 5 · {p.rating.count} reviews</a> : 'No confirmed Google rating'}</p>}{snapshot.groups[p.category].length > 1 && <label className="venue-choice">Venue choice <select value={overrides[p.category] || ''} onChange={e => setOverrides(s => ({ ...s, [p.category]: e.target.value || null }))}><option value="">Agent choice</option>{snapshot.groups[p.category].map(q => <option key={q.placeId} value={q.placeId}>{q.name}{q.rating ? ` · Google ${q.rating.value.toFixed(1)} (${q.rating.count})` : ''}</option>)}</select></label>}</div><button className="skip" onClick={() => skip(p.category)}>Skip</button></li>)}</ol>
          {!unplannedCategories.length && <a className="primary navigate" href={navigation} target="_blank" rel="noopener noreferrer">Open ordered route in Google Maps <ArrowIcon /></a>}<p className="hint">{unplannedCategories.length ? 'Refresh the route before navigating or completing a stop; the new errand is not included yet.' : 'Google Maps may recalculate the route and ETA after handoff. Keep this itinerary for the selected stop order.'}</p>
          <details className="analysis-details"><summary>Show detailed comparison</summary><div className="analysis-grid"><section className="analysis-panel"><h3>Decision details</h3><p>{result.enumerated} complete plans evaluated; {result.feasible} had usable trips between consecutive stops. The best plan is optimal within this shortlist and scoring model.</p><p>Time score {plan.timeScore == null ? 'unavailable' : pct(plan.timeScore)}, distance score {pct(plan.distanceScore)}{profile === 'rated' ? `, rating term ${pct(plan.ratingScore)}` : ''}. Effective weights: time {pct(plan.weights.time)}, distance {pct(plan.weights.distance)}{profile === 'rated' ? `, rating ${pct(plan.weights.rating)}` : ''}.</p>{result.runnerUp && <p>Next best: {result.runnerUp.selectedStops.map(p => p.name).join(' → ')} · {pct(result.runnerUp.utility)}.</p>}</section><section className="analysis-panel baseline"><h3>Nearest-next baseline</h3><p>This comparison picks the closest available next stop at each step.</p>{baseline ? <><p>{baseline.selectedStops.map(p => p.name).join(' → ')}</p><p>{km(baseline.travelDistanceMeters)} · {time(baseline.travelDurationSec)} · {pct(baseline.utility)} utility.</p></> : <p>No complete greedy route was reachable.</p>}</section></div></details>
        </> : categories.length === 0 ? <div className="empty-state"><h3>Add errands to begin</h3><p>Choose one or more errands in the panel above. You can start with a single stop.</p></div> : snapshot && unplannedCategories.length ? <div className="empty-state"><h3>New errand awaits search</h3><p>Run Find places & optimize to include {unplannedCategories.map(category => LABEL[category]).join(', ')}.</p></div> : snapshot && !pending.length ? <div className="empty-state"><h3>All errands accounted for</h3><p>Restore a skipped errand or start another trip.</p></div> : snapshot ? <div className="empty-state"><h3>No feasible itinerary</h3><p>{result?.reason}</p>{Object.values(overrides).some(Boolean) && <button className="secondary" onClick={() => setOverrides({})}>Clear venue choices</button>}</div> : <div className="empty-state"><h3>Choose where to begin</h3><p>Set your origin, then find nearby venues and optimize.</p></div>}
      </section><aside className="controls options-panel">
        <div className="control-block"><div className="heading-row"><h3>Errands</h3><span>{categories.length}/4</span></div><div className="chips">{CATEGORIES.map(c => <button key={c} className={`chip ${categories.includes(c) ? 'selected' : ''}`} onClick={() => setCategory(c)} aria-pressed={categories.includes(c)} disabled={!!busy || (categories.includes(c) ? categories.length <= 1 : categories.length >= 4)}>{LABEL[c]}</button>)}</div><p className="hint">{categories.length === 0 ? 'Choose at least one errand to get started.' : categories.length === 4 ? 'Remove one to add another.' : 'Choose one to four errands.'}</p></div>
        <div className="control-block"><h3>Strategy</h3><div className="profile-options">{profiles.filter(([value]) => mode === 'live' || value !== 'rated').map(([value, label]) => <button key={value} className={profile === value ? 'chosen' : ''} onClick={() => setProfile(value)} aria-pressed={profile === value}>{label}</button>)}</div><p className="hint strategy-help" aria-live="polite">{strategyHelp[profile]}</p></div>
        {mode === 'live' && <><div className="control-block"><label>Search radius <strong>{radius / 1000} km</strong><input type="range" min="1000" max="5000" step="1000" value={radius} onChange={e => { setRadius(Number(e.target.value)); if (snapshot) setStale(true); }} /></label></div><button className="primary wide" onClick={find} disabled={!!busy}>{busy || 'Find places & optimize'} <ArrowIcon /></button>{busy && findController.current && <button className="secondary wide" onClick={() => findController.current?.abort()}>Cancel search</button>}</>}
        {error && <p className="error" role="alert">{error}</p>}<button className="text-button" onClick={reset} disabled={!!busy}>Reset to demo</button>
      </aside></div></main><footer><span>Waywise · Utility based agent</span><span>Optimal within the retrieved shortlist and simplified scoring model.</span></footer>
  </div>;
}
