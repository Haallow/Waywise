export const TAGS = Object.freeze({
  coffee: [['amenity', 'cafe'], ['shop', 'coffee']],
  groceries: [['shop', 'supermarket'], ['shop', 'convenience'], ['shop', 'grocery']],
  church: [['amenity', 'place_of_worship', 'religion', 'christian']],
  spa: [['leisure', 'spa'], ['shop', 'beauty', 'beauty', 'spa']],
  pharmacy: [['amenity', 'pharmacy'], ['shop', 'chemist']],
  restaurant: [['amenity', 'restaurant']],
  other: [['shop', 'general']],
  bakery: [['shop', 'bakery']],
  bank: [['amenity', 'bank']],
  fuel: [['amenity', 'fuel']],
  laundry: [['shop', 'laundry']],
  parking: [['amenity', 'parking']],
});
// OpenPOIService category IDs map to OSM tags; keep the final name checks conservative
// where its response does not expose religion or beauty subcategory tags.
export const POI_CATEGORY_IDS = Object.freeze({
  coffee: [564, 448, 435], groceries: [518, 451, 475], church: [135],
  spa: [306, 391], pharmacy: [208, 443], restaurant: [570], other: [472],
  bakery: [], bank: [], fuel: [], laundry: [], parking: [],
});
export const validPoint = p => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
export const qualifies = (tags, category) => TAGS[category]?.some(([key, value, key2, value2]) =>
  tags?.[key] === value && (!key2 || String(tags[key2] || '').split(';').map(part => part.trim()).includes(value2))) || false;
export const haversine = (a, b) => {
  const rad = Math.PI / 180, dlat = (b.latitude - a.latitude) * rad, dlon = (b.longitude - a.longitude) * rad;
  const x = Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dlon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(x)));
};
export function overpassQuery(category, origin, radiusMeters) {
  const at = `(around:${Math.round(radiusMeters)},${origin.latitude},${origin.longitude})`;
  return `[out:json][timeout:15];(${TAGS[category].map(([key, value, key2, value2]) => `nwr${at}["${key}"="${value}"]${key2 ? key2 === 'beauty' ? `["${key2}"~"(^|;)${value2}(;|$)"]` : `["${key2}"="${value2}"]` : ''}[name];`).join('')});out center;`;
}
export function normalizePlaces(raw, category, origin) {
  const seen = new Set();
  return (raw.elements || []).map(item => {
    const latitude = item.lat ?? item.center?.lat, longitude = item.lon ?? item.center?.lon;
    const placeId = `${item.type}/${item.id}`;
    if (!item.tags?.name || !qualifies(item.tags, category) || !validPoint({ latitude, longitude }) || seen.has(placeId)) return null;
    seen.add(placeId);
    const address = [item.tags['addr:housenumber'], item.tags['addr:street'], item.tags['addr:city']].filter(Boolean).join(' ') || null;
    return { placeId, name: item.tags.name, category, latitude, longitude, address, dataSource: 'osm' };
  }).filter(Boolean).sort((a, b) => haversine(origin, a) - haversine(origin, b) || a.placeId.localeCompare(b.placeId)).slice(0, 3);
}
export function normalizePoiPlaces(raw, category, origin, radiusMeters) {
  const seen = new Set();
  return (raw.features || []).map(feature => {
    const properties = feature.properties || {}, tags = properties.osm_tags || {};
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    const osmType = { 1: 'node', 2: 'way', 3: 'relation' }[properties.osm_type];
    const ids = Object.keys(properties.category_ids || {}).map(Number);
    const name = typeof tags.name === 'string' ? tags.name.trim() : '';
    const placeId = `${osmType}/${properties.osm_id}`;
    if (!name || !osmType || !Number.isSafeInteger(properties.osm_id) || !validPoint({ latitude, longitude }) ||
        !ids.some(id => POI_CATEGORY_IDS[category]?.includes(id)) || seen.has(placeId)) return null;
    if (category === 'church' && !/\b(church|chapel|parish|cathedral|basilica|shrine|santuario)\b/i.test(name)) return null;
    if (category === 'spa' && !ids.includes(306) && !/\bspa\b/i.test(name)) return null;
    const place = { placeId, name, category, latitude, longitude,
      address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ') || null,
      dataSource: 'osm' };
    if (haversine(origin, place) > radiusMeters) return null;
    seen.add(placeId);
    return place;
  }).filter(Boolean).sort((a, b) => haversine(origin, a) - haversine(origin, b) || a.placeId.localeCompare(b.placeId)).slice(0, 3);
}
export function normalizeMatrix(nodes, raw) {
  const n = nodes.length;
  if (!Array.isArray(raw?.durations) || !Array.isArray(raw?.distances) || raw.durations.length !== n || raw.distances.length !== n ||
    raw.durations.some(row => !Array.isArray(row) || row.length !== n) || raw.distances.some(row => !Array.isArray(row) || row.length !== n)) {
    throw new Error('Road matrix response is incomplete.');
  }
  const durationSec = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0 : null));
  const distanceMeters = durationSec.map(row => [...row]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const time = raw.durations?.[i]?.[j], distance = raw.distances?.[i]?.[j];
    if (i !== j && Number.isFinite(time) && time >= 0 && Number.isFinite(distance) && distance >= 0) {
      durationSec[i][j] = time; distanceMeters[i][j] = distance;
    }
  }
  return { nodes, durationSec, distanceMeters, fetchedAt: new Date().toISOString(), dataSource: 'ors' };
}
export function approximateMatrix(nodes) {
  return { nodes, durationSec: nodes.map((_, i) => nodes.map((_, j) => i === j ? 0 : null)),
    distanceMeters: nodes.map((a, i) => nodes.map((b, j) => i === j ? 0 : Math.round(haversine(a, b)))),
    fetchedAt: new Date().toISOString(), dataSource: 'approximate' };
}
export async function upstream(url, options = {}, timeoutMs = 15000) {
  const { quotaForbidden = false, ...requestOptions } = options;
  let response;
  try { response = await fetch(url, { ...requestOptions, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'Map service timed out. Try again.' };
    throw { status: 502, code: 'NETWORK_UNAVAILABLE', message: 'Cannot reach the map service. Check your connection and retry.' };
  }
  if (response.status === 429 || (quotaForbidden && response.status === 403)) throw { status: 429, code: 'PROVIDER_LIMITED', message: 'Map service rate or quota limit reached. Try again later.' };
  if (!response.ok) throw { status: 502, code: 'UPSTREAM_ERROR', message: 'Map service is unavailable. Try again later.' };
  try { return await response.json(); }
  catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'Map service timed out. Try again.' };
    throw { status: 502, code: 'UPSTREAM_ERROR', message: 'Map service returned unreadable data.' };
  }
}
