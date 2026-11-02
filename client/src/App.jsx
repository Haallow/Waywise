import { useCallback, useMemo, useRef, useState } from 'react';
import { optimize } from './agent/optimizer.js';
import { googleMapsUrl } from './agent/googleMapsUrl.js';
import { DEMO_ORIGIN, demoSnapshot } from './services/demoData.js';
import MapPanel from './MapPanel.jsx';

const CATEGORIES = ['coffee', 'groceries', 'church', 'spa', 'pharmacy', 'restaurant'];
const LABEL = { coffee: 'Coffee', groceries: 'Groceries', church: 'Church', spa: 'Spa', pharmacy: 'Pharmacy', restaurant: 'Restaurant' };
const PROFILES = [['fastest', 'Fastest'], ['balanced', 'Balanced'], ['best-rated', 'Best-Rated']];
const initial = ['coffee', 'groceries', 'church', 'spa'];
const minutes = seconds => `${(seconds / 60).toFixed(1)} min`;
const km = meters => `${(meters / 1000).toFixed(1)} km`;
const percent = value => `${(value * 100).toFixed(1)}%`;

function RouteArrow() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 16 16 4M8 4h8v8" /></svg>;
}

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The local API returned an unreadable response. Check that the Express server is running.'); }
  if (!response.ok) throw new Error(data.error?.message || 'The request failed.');
  return data;
}

export default function App() {
  const [mode, setMode] = useState('demo');
  const [categories, setCategories] = useState(initial);
  const [profile, setProfile] = useState('balanced');
  const [demoScenario, setDemoScenario] = useState('standard');
  const [origin, setOrigin] = useState(DEMO_ORIGIN);
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [snapshot, setSnapshot] = useState(() => demoSnapshot(initial));
  const [statuses, setStatuses] = useState({});
  const [overrides, setOverrides] = useState({});
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState('');
  const [locating, setLocating] = useState(false);
  const geoRequest = useRef(0);
  const [error, setError] = useState('');
  const live = snapshot?.dataSource === 'google' && mode === 'live';
  const pending = categories.filter(category => statuses[category] !== 'skipped' && statuses[category] !== 'completed');
  const skipped = categories.filter(category => statuses[category] === 'skipped');
  const effectiveOrigin = completed.length ? { ...completed.at(-1), id: completed.at(-1).placeId } : snapshot?.origin || origin || DEMO_ORIGIN;
  const candidateGroups = useMemo(() => snapshot ? Object.fromEntries(Object.entries(snapshot.groups).map(([category, group]) => [category, overrides[category] ? group.filter(place => place.placeId === overrides[category]) : group])) : {}, [snapshot, overrides]);
  const result = useMemo(() => {
    if (!snapshot || (mode === 'live' && !live)) return null;
    return optimize({ errands: categories.map(category => ({ id: category, category, status: statuses[category] || 'pending' })), groups: candidateGroups, matrix: snapshot.matrix, profile, originId: effectiveOrigin.id });
  }, [snapshot, categories, statuses, profile, effectiveOrigin.id, mode, live, candidateGroups]);
  const plan = result?.plan;
  const mapOrigin = completed.length ? effectiveOrigin : snapshot?.origin || origin;
  const onPickOrigin = useCallback(point => {
    if (mode !== 'live' || loading) return;
    geoRequest.current++;
    setLocating(false);
    setOrigin(point); setDraftLat(String(point.latitude)); setDraftLng(String(point.longitude)); setSnapshot(null); setStatuses({}); setCompleted([]); setOverrides({}); setError('Starting point changed. Find places again to refresh route estimates.');
  }, [mode, loading]);

  const toggle = category => {
    if (loading) return;
    const next = categories.includes(category) ? categories.filter(item => item !== category) : [...categories, category];
    if (next.length < 2 || next.length > 4) return;
    setCategories(next); setStatuses({}); setCompleted([]); setOverrides({}); setError('');
    setSnapshot(mode === 'demo' ? demoSnapshot(next, demoScenario) : null);
  };
  const chooseMode = next => {
    if (loading) return;
    geoRequest.current++;
    setLocating(false);
    setMode(next); setStatuses({}); setCompleted([]); setOverrides({}); setError('');
    if (next === 'demo') { setOrigin(DEMO_ORIGIN); setSnapshot(demoSnapshot(categories, demoScenario)); }
    else { setSnapshot(null); setOrigin(null); setDraftLat(''); setDraftLng(''); }
  };
  const setManualOrigin = event => {
    event.preventDefault();
    const latitude = Number(draftLat), longitude = Number(draftLng);
    if (!draftLat.trim() || !draftLng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setError('Enter a latitude from −90 to 90 and a longitude from −180 to 180.'); return;
    }
    onPickOrigin({ id: 'origin', latitude, longitude, label: 'Manual coordinates' });
  };
  const find = async () => {
    setError('');
    if (locating) { setError('Wait for the location request to finish, or enter coordinates.'); return; }
    if (mode !== 'live') return;
    if (!origin) { setError('Set a starting point with location permission or by clicking the map.'); return; }
    try {
      setLoading('Searching nearby places…');
      const groups = {};
      const seenPlaces = new Set();
      for (const category of categories) {
        const data = await post('/api/places', { origin, category, radiusMeters: 4000 });
        if (data.dataSource !== 'google' || !Array.isArray(data.places) || data.places.some(place => place.dataSource !== 'google')) throw new Error('Place data was not confirmed as live Google data.');
        const unique = data.places.filter(place => !seenPlaces.has(place.placeId));
        if (!unique.length) throw new Error(`No distinct ${LABEL[category].toLowerCase()} candidates found within 4 km. Choose another origin or category.`);
        unique.forEach(place => seenPlaces.add(place.placeId));
        groups[category] = unique;
      }
      setLoading('Estimating directed driving times…');
      const nodes = [{ id: 'origin', latitude: origin.latitude, longitude: origin.longitude }, ...Object.values(groups).flat().map(place => ({ id: place.placeId, latitude: place.latitude, longitude: place.longitude }))];
      const matrix = await post('/api/matrix', { nodes, mode: 'DRIVE' });
      if (matrix.dataSource !== 'google') throw new Error('Route data was not confirmed as live Google data.');
      setSnapshot({ origin: { ...origin, id: 'origin' }, groups, matrix, dataSource: 'google' });
      setStatuses({}); setCompleted([]); setOverrides({});
    } catch (e) { setSnapshot(null); setError(e.name === 'TimeoutError' ? 'The request timed out. Try again or use Demo Mode.' : e instanceof TypeError ? 'The local API could not be reached. Check the Express server or use Demo Mode.' : e.message); }
    finally { setLoading(''); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setError('This browser cannot provide a location. Click the map or enter coordinates.'); return; }
    const request = ++geoRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== geoRequest.current) return;
      setLocating(false);
      onPickOrigin({ id: 'origin', latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'Current location' });
    }, () => {
      if (request !== geoRequest.current) return;
      setLocating(false);
      setError('Location access was denied. Click the map or enter coordinates to choose a starting point.');
    }, { timeout: 10000 });
  };
  const skip = category => { setStatuses(current => ({ ...current, [category]: 'skipped' })); setError(''); };
  const restore = category => { setStatuses(current => ({ ...current, [category]: 'pending' })); setError(''); };
  const complete = () => {
    if (!plan?.selectedStops.length) return;
    const stop = plan.selectedStops[0];
    setStatuses(current => ({ ...current, [stop.category]: 'completed' }));
    setCompleted(current => [...current, stop]);
  };
  const undoComplete = () => {
    const stop = completed.at(-1);
    if (!stop) return;
    setCompleted(current => current.slice(0, -1));
    setStatuses(current => ({ ...current, [stop.category]: 'pending' }));
  };
  const reset = () => { if (loading) return; geoRequest.current++; setLocating(false); setCategories(initial); setProfile('balanced'); setDemoScenario('standard'); setStatuses({}); setCompleted([]); setOverrides({}); setError(''); setMode('demo'); setOrigin(DEMO_ORIGIN); setDraftLat(''); setDraftLng(''); setSnapshot(demoSnapshot(initial)); };
  const navigation = plan ? googleMapsUrl(mapOrigin, plan.selectedStops) : null;
  const baseline = result?.baseline;
  const difference = plan && baseline ? plan.travelDurationSec - baseline.travelDurationSec : 0;
  const decisionSummary = !plan || !baseline ? '' : difference < 0
    ? `This plan saves ${minutes(-difference)} versus the nearest-next trip.`
    : difference > 0
      ? `This plan takes ${minutes(difference)} longer than nearest-next, with ${percent(plan.qualityScore)} modeled venue quality versus ${percent(baseline.qualityScore)}.`
      : plan.qualityScore > baseline.qualityScore
        ? `It matches nearest-next driving time with higher modeled venue quality: ${percent(plan.qualityScore)} versus ${percent(baseline.qualityScore)}.`
        : 'This plan matches the nearest-next trip on driving time and modeled venue quality.';

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><RouteArrow /></span><div><strong>PlanB</strong><span>Intelligent errand planning</span></div></div><div className="topbar-right"><span className="mode-badge">{mode === 'demo' ? 'DEMO DATA' : live ? 'LIVE GOOGLE DATA' : 'LIVE MODE · NO DATA'}</span><span className="drive-label">Driving only</span></div></header>
    <main>
      <section className="intro"><div><h1>Make every stop count.</h1><p>Choose your errands. PlanB compares complete trips, selecting both the places and the order that best match your priorities.</p></div><div className="intro-fact"><strong>{result?.enumerated ?? '—'}</strong><span>complete routes compared locally</span></div></section>
      <p className="sr-only" role="status" aria-live="polite">{plan ? `Route updated: ${plan.selectedStops.length} stops, ${minutes(plan.travelDurationSec)} estimated drive. First stop ${plan.selectedStops[0].name}.` : ''}</p>
      {plan && <aside className="mobile-route-preview" aria-label="Current route summary"><div className="mobile-route-top"><strong>{mode === 'demo' ? 'Demo route ready' : 'Route ready'}</strong><span>{minutes(plan.travelDurationSec)} estimated drive</span></div><p>{plan.selectedStops.map(stop => stop.name).join(' → ')}</p><div className="mobile-route-actions"><a className="secondary" href="#itinerary">View itinerary</a><a className="primary" href={navigation} target="_blank" rel="noopener noreferrer">Open in Maps <RouteArrow /></a></div></aside>}
      <div className="workspace"><aside className="controls">
        <div className="control-block"><h2>Plan your trip</h2><p className="muted">Two to four errands, one stop for each.</p></div>
        <div className="control-block"><h3>Data source</h3><div className="segmented"><button className={mode === 'demo' ? 'active' : ''} onClick={() => chooseMode('demo')} aria-pressed={mode === 'demo'} disabled={!!loading}>Demo</button><button className={mode === 'live' ? 'active' : ''} onClick={() => chooseMode('live')} aria-pressed={mode === 'live'} disabled={!!loading}>Live Google</button></div><p className="hint">Demo places and travel times are entirely fictional. Live searches may incur Google charges.</p></div>
        {mode === 'demo' && <div className="control-block"><h3>Demo scenario</h3><div className="segmented"><button className={demoScenario === 'standard' ? 'active' : ''} aria-pressed={demoScenario === 'standard'} onClick={() => { setDemoScenario('standard'); setSnapshot(demoSnapshot(categories, 'standard')); setStatuses({}); setCompleted([]); setOverrides({}); }}>Standard</button><button className={demoScenario === 'bottleneck' ? 'active' : ''} aria-pressed={demoScenario === 'bottleneck'} onClick={() => { setDemoScenario('bottleneck'); setSnapshot(demoSnapshot(categories, 'bottleneck')); setStatuses({}); setCompleted([]); setOverrides({}); }}>Bottleneck</button></div><p className="hint">Bottleneck simulates a slow coffee → groceries leg and a faster reverse leg; it is fictional traffic.</p></div>}
        <div className="control-block"><h3>Starting point</h3>{mode === 'live' ? <><button className="secondary wide" onClick={locate} disabled={!!loading || locating}>{locating ? 'Finding location…' : 'Use my current location'}</button><p className="hint">Or click the map, or enter coordinates. Location permission is requested only when you click the button.</p><form className="coordinate-form" onSubmit={setManualOrigin}><label>Latitude<input type="number" min="-90" max="90" step="any" value={draftLat} onChange={event => setDraftLat(event.target.value)} placeholder="14.5995" disabled={!!loading} /></label><label>Longitude<input type="number" min="-180" max="180" step="any" value={draftLng} onChange={event => setDraftLng(event.target.value)} placeholder="120.9842" disabled={!!loading} /></label><button className="secondary" type="submit" disabled={!!loading}>Set point</button></form></> : <p className="origin-text">Sample starting point · fictional trip</p>}<p className="coord">{origin ? `${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}` : 'No starting point selected'}</p></div>
        <div className="control-block"><div className="heading-row"><h3>Errands</h3><span>{categories.length}/4</span></div><div className="chips">{CATEGORIES.map(category => <button key={category} className={`chip ${categories.includes(category) ? 'selected' : ''}`} onClick={() => toggle(category)} aria-pressed={categories.includes(category)} aria-describedby="errand-limit" disabled={categories.includes(category) ? categories.length <= 2 : categories.length >= 4}>{LABEL[category]}</button>)}</div><p className="hint" id="errand-limit">{categories.length === 4 ? 'Four errands selected. Remove one to add another.' : `Choose ${4 - categories.length} more at most. Keep at least two.`}</p></div>
        <div className="control-block"><h3>Preference</h3><div className="profile-options">{PROFILES.map(([value, label]) => <button key={value} className={profile === value ? 'chosen' : ''} onClick={() => setProfile(value)} aria-pressed={profile === value}>{label}</button>)}</div><p className="hint">Changing this recomputes the best plan from the current candidate and travel snapshot.</p></div>
        {mode === 'live' && <button className="primary wide" onClick={find} disabled={!!loading}>{loading || 'Find places & optimize'} <RouteArrow /></button>}
        {loading && <p className="hint" role="status" aria-live="polite">{loading}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="text-button" onClick={reset} disabled={!!loading}>{mode === 'live' ? 'Reset to demo' : 'Reset demo'}</button>
      </aside>
      <section className="results"><div className="map-header"><div><h2>Your route, considered.</h2><p>{mode === 'demo' ? 'Synthetic travel times for a fictional trip' : live ? 'Google traffic-aware road estimate at calculation time' : 'Awaiting live place and road estimates'}</p></div><span className="snapshot">{snapshot?.matrix ? new Date(snapshot.matrix.fetchedAt).toLocaleString() : 'No snapshot'}</span></div>
        {mode === 'live' && !snapshot ? <div className="empty-state"><h3>Choose where to begin</h3><p>Use your location, click the map, or enter coordinates, then find places. A browser Maps key is needed for map selection.</p><MapPanel origin={origin} stops={[]} onPickOrigin={onPickOrigin} live /></div> : <MapPanel origin={mapOrigin} stops={plan?.selectedStops || []} onPickOrigin={onPickOrigin} live={live} />}
        {skipped.length > 0 && <section className="skipped-list" aria-label="Skipped errands"><strong>Skipped</strong>{skipped.map(category => <button key={category} className="secondary" onClick={() => restore(category)}>Restore {LABEL[category]}</button>)}</section>}
        {completed.length > 0 && <section className="completed-list" aria-label="Completed errands"><div><strong>Completed</strong> {completed.map(stop => stop.name).join(' → ')}</div><button className="secondary" onClick={undoComplete}>Undo {completed.at(-1).name} completion</button></section>}
        {plan ? <><div className="metrics"><div><span>Estimated drive</span><strong>{minutes(plan.travelDurationSec)}</strong></div><div><span>Distance</span><strong>{km(plan.travelDistanceMeters)}</strong></div><div><span>Utility score</span><strong>{percent(plan.utility)}</strong></div></div>
          {live && <p className="hint">Powered by Google, ©{new Date().getFullYear()} Google</p>}
          {decisionSummary && <p className="decision-summary">{decisionSummary}</p>}
          <div className="itinerary-head" id="itinerary"><div><h2>Selected itinerary</h2><p>{completed.length ? `${completed.length} completed · ${pending.length} remaining` : `${plan.selectedStops.length} stops in agent-selected order`}</p></div><button className="secondary" onClick={complete}>Mark {plan.selectedStops[0].name} complete</button></div>
          <ol className="itinerary">{plan.selectedStops.map((stop, index) => <li key={stop.placeId}><div className="stop-index">{index + 1}</div><div className="stop-body"><div className="stop-top"><strong>{stop.name}</strong><span>{minutes(plan.legs[index].durationSec)} drive</span></div><p>{LABEL[stop.category]} · {stop.address || 'Address unavailable'}</p><p>{stop.rating == null ? 'No rating available' : `${stop.rating.toFixed(1)} / 5 · ${stop.userRatingCount ?? 'unknown'} reviews`}</p>{snapshot.groups[stop.category].length > 1 && <label className="venue-choice">Venue choice <select value={overrides[stop.category] || ''} onChange={event => setOverrides(current => ({ ...current, [stop.category]: event.target.value || null }))}><option value="">Agent choice</option>{snapshot.groups[stop.category].map(place => <option key={place.placeId} value={place.placeId}>{place.name}</option>)}</select></label>}</div><button className="skip" onClick={() => skip(stop.category)} aria-label={`Skip ${LABEL[stop.category]}`}>Skip</button></li>)}</ol>
          <a className="primary navigate" href={navigation} target="_blank" rel="noopener noreferrer">Open ordered route in Google Maps <RouteArrow /></a>
          <p className="hint">Google Maps may recalculate the road path and ETA. Some clients may handle waypoints differently; keep this itinerary as the stop-order reference.</p>
          <details className="analysis-details"><summary>Show detailed comparison</summary>
          <div className="analysis-grid">
            <section className="analysis-panel">
              <h3>Why this plan?</h3>
              <p>PlanB evaluated {result.enumerated} complete choices and visit orders across {Object.values(candidateGroups).reduce((n, group) => n + group.length, 0)} {Object.values(overrides).some(Boolean) ? 'allowed' : 'shortlisted'} places. {result.feasible} had every required directed leg.</p>
              <p>The chosen plan scores {percent(plan.utility)}: {percent(plan.timeScore)} time score and {percent(plan.qualityScore)} modeled venue quality, weighted {percent(plan.weights.time)} / {percent(plan.weights.quality)}.</p>
              {result.runnerUp && <p>The next-best complete plan scores {percent(result.runnerUp.utility)}, takes {minutes(result.runnerUp.travelDurationSec)}, and visits {result.runnerUp.selectedStops.map(stop => stop.name).join(' → ')}.</p>}
              {baseline && <p>{difference < 0 ? `It saves ${minutes(-difference)} versus the greedy trip.` : difference > 0 ? `It takes ${minutes(difference)} longer than the greedy trip, trading time for venue quality.` : 'It matches the greedy trip’s estimated driving time.'} The selected venues and order maximize this utility over the shortlist.</p>}
              <p className="hint">Modeled quality smooths ratings and uses a neutral prior for unknown values; it is not a displayed Google rating.</p>
            </section>
            <section className="analysis-panel baseline">
              <h3>Nearest-next baseline</h3>
              {baseline ? <><p>Greedy next stop: <strong>{minutes(baseline.travelDurationSec)}</strong> · {km(baseline.travelDistanceMeters)} · {percent(baseline.utility)} utility.</p><p>Order: {baseline.selectedStops.map(stop => stop.name).join(' → ')}.</p><p>Modeled quality: {percent(baseline.qualityScore)}. Same candidates, directed matrix, and preference weights.</p></> : <p>No complete greedy route was reachable from this snapshot.</p>}
              <p className="hint">{live ? 'All travel legs use one traffic-aware snapshot at calculation time, not projected later-arrival traffic.' : 'All travel values are simulated, not Google road estimates.'}</p>
            </section>
          </div>
          </details>
        </> : snapshot && pending.length === 0 ? <div className="empty-state"><h3>All errands accounted for</h3><p>{completed.length ? `Completed: ${completed.map(stop => stop.name).join(' → ')}.` : 'All selected errands were skipped.'} Reset or choose new errands to plan another trip.</p></div> : snapshot && <div className="empty-state"><h3>No feasible itinerary</h3><p>{result?.reason || 'Choose errands and calculate a plan.'}</p></div>}
      </section></div>
    </main><footer><span>PlanB · Utility-based agent</span><span>Optimal within the retrieved shortlist and simplified scoring model.</span></footer>
  </div>;
}
