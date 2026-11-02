export const PLACE_TYPES = Object.freeze({
  coffee: ['coffee_shop', 'cafe'], groceries: ['grocery_store', 'supermarket'],
  church: ['church'], spa: ['spa'], pharmacy: ['pharmacy'], restaurant: ['restaurant'],
});
export const PLACES_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus';
export const ROUTES_MASK = 'originIndex,destinationIndex,duration,distanceMeters,status,condition';

export function validPoint(point) {
  return point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function parseDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)) return Number(value.slice(0, -1));
  return null;
}

export function normalizePlaces(response, category, origin) {
  const seen = new Set();
  const places = (Array.isArray(response.places) ? response.places : []).filter(place => {
    if (!place.id || !place.displayName?.text || seen.has(place.id) || !validPoint(place.location) || place.businessStatus && place.businessStatus !== 'OPERATIONAL') return false;
    seen.add(place.id);
    return true;
  }).map(place => ({
    placeId: place.id, name: place.displayName.text, category,
    latitude: place.location.latitude, longitude: place.location.longitude,
    address: place.formattedAddress || null,
    rating: Number.isFinite(place.rating) ? place.rating : null,
    userRatingCount: Number.isInteger(place.userRatingCount) ? place.userRatingCount : null,
    dataSource: 'google',
  }));
  const distance2 = place => (place.latitude - origin.latitude) ** 2 + ((place.longitude - origin.longitude) * Math.cos(origin.latitude * Math.PI / 180)) ** 2;
  const nearest = [...places].sort((a, b) => distance2(a) - distance2(b) || a.placeId.localeCompare(b.placeId))[0];
  const rated = [...places].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.userRatingCount ?? -1) - (a.userRatingCount ?? -1) || a.placeId.localeCompare(b.placeId))[0];
  return [nearest, rated, ...places].filter((place, i, all) => place && all.findIndex(other => other?.placeId === place.placeId) === i).slice(0, 2);
}

export function normalizeMatrix(nodes, raw, fetchedAt = new Date().toISOString()) {
  const size = nodes.length;
  const durationSec = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? 0 : null));
  const distanceMeters = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? 0 : null));
  const elements = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  for (const element of elements) {
    const i = element.originIndex, j = element.destinationIndex;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= size || j >= size || i === j) continue;
    const good = (!element.status || element.status.code === 0 || element.status.code === undefined) &&
      (!element.condition || element.condition === 'ROUTE_EXISTS');
    const duration = parseDuration(element.duration);
    const distance = element.distanceMeters;
    if (good && duration !== null && Number.isFinite(distance) && distance >= 0) {
      durationSec[i][j] = duration;
      distanceMeters[i][j] = distance;
    }
  }
  return { nodes, durationSec, distanceMeters, fetchedAt, trafficMode: 'TRAFFIC_AWARE', dataSource: 'google' };
}

export function providerError(status) {
  if (status === 429) return { status: 429, code: 'UPSTREAM_RATE_LIMITED', message: 'Google quota is unavailable. Try later or switch to Demo Mode.' };
  return { status: 502, code: 'UPSTREAM_ERROR', message: 'Google data is temporarily unavailable. Try again or switch to Demo Mode.' };
}

export async function googlePost(url, body, fieldMask, key) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
      body: JSON.stringify(body),
    });
  } catch {
    throw { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'Google did not respond in time. Try again or switch to Demo Mode.' };
  }
  if (!response.ok) throw providerError(response.status);
  try { return await response.json(); }
  catch { throw { status: 502, code: 'UPSTREAM_ERROR', message: 'Google returned an unreadable response.' }; }
}
