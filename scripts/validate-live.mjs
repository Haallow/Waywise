/** One bounded, explicit end-to-end provider validation. Never prints credentials. */
import 'dotenv/config';
import { optimize } from '../client/src/agent/optimizer.js';
import { googleMapsUrl } from '../client/src/agent/googleMapsUrl.js';

if (!process.argv.includes('--confirm-live')) {
  console.error('Pass --confirm-live to make live OSM venue and ORS requests.');
  process.exit(2);
}
if (!process.env.ORS_API_KEY) {
  console.error('ORS_API_KEY is missing from the root .env.');
  process.exit(2);
}
const originArg = process.argv.find(arg => arg.startsWith('--origin='))?.slice(9);
const originParts = originArg?.split(',').map(Number);
if (originArg && (originParts.length !== 2 || !Number.isFinite(originParts[0]) || !Number.isFinite(originParts[1]) || Math.abs(originParts[0]) > 90 || Math.abs(originParts[1]) > 180)) {
  console.error('Use --origin=LAT,LNG with valid coordinates.');
  process.exit(2);
}
const origin = { id: 'origin', latitude: originParts?.[0] ?? 14.5995, longitude: originParts?.[1] ?? 120.9842 };
const categories = ['coffee', 'groceries', 'church', 'spa'];
process.env.NODE_ENV = 'test';
const { app } = await import('../server/index.js');
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
const base = `http://127.0.0.1:${server.address().port}`;
let calls = 0;
async function post(path, body, timeoutMs = 25000) {
  calls++;
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error?.code || response.status} — ${data.error?.message || 'request failed'}`);
  return data;
}
try {
  const groups = {}, venueSources = {}, searchRadii = {}, seen = new Set();
  for (const category of categories) {
    const data = await post('/api/places', { category, origin, radiusMeters: 4000 });
    const unique = data.places.filter(place => !seen.has(place.placeId));
    if (data.dataSource !== 'osm' || !unique.length) throw new Error(`No distinct real OSM candidates for ${category}.`);
    unique.forEach(place => seen.add(place.placeId)); groups[category] = unique;
    venueSources[category] = data.venueSource; searchRadii[category] = data.searchRadiusMeters;
  }
  const nodes = [origin, ...Object.values(groups).flat().map(place => ({ id: place.placeId, latitude: place.latitude, longitude: place.longitude }))];
  const matrix = await post('/api/matrix', { nodes, mode: 'DRIVE' });
  if (matrix.dataSource !== 'ors') throw new Error(`Expected ORS road matrix; received ${matrix.dataSource}. ${matrix.fallbackReason || ''}`);
  const results = Object.fromEntries(['fastest', 'shortest', 'balanced'].map(profile => [profile, optimize({ errands: categories.map(category => ({ id: category, category })), groups, matrix, profile })]));
  for (const [profile, value] of Object.entries(results)) if (!value.plan || value.plan.selectedStops.length !== 4) throw new Error(`${profile}: ${value.reason || 'No complete road itinerary.'}`);
  const result = results.balanced;
  let route = null, routeGeometryStatus = 'verified';
  try {
    route = await post('/api/route', { points: [origin, ...result.plan.selectedStops].map(point => ({ latitude: point.latitude, longitude: point.longitude })) }, 40000);
    if (route.dataSource !== 'ors' || route.positions.length < 2) throw new Error('ORS road geometry unavailable.');
  } catch (error) { route = null; routeGeometryStatus = `unavailable: ${error.message}`; }
  const url = new URL(googleMapsUrl(origin, result.plan.selectedStops));
  const encodedStops = [...(url.searchParams.get('waypoints') || '').split('|'), url.searchParams.get('destination')];
  if (encodedStops.join('|') !== result.plan.selectedStops.map(place => `${place.latitude},${place.longitude}`).join('|')) throw new Error('Google Maps stop order differs from optimizer order.');
  console.log(JSON.stringify({ source: 'OSM venues + ORS road estimates', venueSources, searchRadii, requestCount: calls, candidatesPerCategory: Object.fromEntries(categories.map(category => [category, groups[category].length])), nodes: nodes.length, profiles: Object.fromEntries(Object.entries(results).map(([profile, value]) => [profile, { enumerated: value.enumerated, feasible: value.feasible, utility: Number(value.plan.utility.toFixed(4)), stopIds: value.plan.selectedStops.map(place => place.placeId) }])), selectedStops: result.plan.selectedStops.map(place => ({ category: place.category, name: place.name, osmId: place.placeId })), travelDurationMinutes: Number((result.plan.travelDurationSec / 60).toFixed(1)), roadDistanceKm: Number((result.plan.travelDistanceMeters / 1000).toFixed(1)), baselineDurationMinutes: result.baseline ? Number((result.baseline.travelDurationSec / 60).toFixed(1)) : null, geometryPoints: route?.positions?.length ?? null, routeGeometryStatus, mapsWaypointCount: encodedStops.length - 1, snapshotTime: matrix.fetchedAt }, null, 2));
} catch (error) {
  console.error(`Live validation failed after ${calls} local API requests: ${error.message}`);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
}
