import test from 'node:test';
import assert from 'node:assert/strict';
import { overpassQuery, normalizePlaces, normalizePoiPlaces, normalizeMatrix, approximateMatrix, qualifies, upstream } from '../server/providers.js';

test('Overpass query is bounded and OSM venues normalize without ratings', () => {
  const origin = { latitude: 14.6, longitude: 121 };
  assert.match(overpassQuery('coffee', origin, 4000), /around:4000,14.6,121/);
  const places = normalizePlaces({ elements: [
    { type: 'node', id: 1, lat: 14.601, lon: 121.001, tags: { name: 'Cafe One', amenity: 'cafe' } },
    { type: 'way', id: 2, center: { lat: 14.602, lon: 121.002 }, tags: { name: 'Cafe Two', shop: 'coffee' } },
    { type: 'node', id: 3, lat: 14.603, lon: 121.003, tags: {} },
  ] }, 'coffee', origin);
  assert.deepEqual(places.map(p => p.placeId), ['node/1', 'way/2']);
  assert.equal(places[0].dataSource, 'osm'); assert.equal('rating' in places[0], false);
});
test('spa candidates require an explicit spa tag', () => {
  assert.equal(qualifies({ shop: 'beauty', beauty: 'nails' }, 'spa'), false);
  assert.equal(qualifies({ shop: 'beauty', beauty: 'nails;spa' }, 'spa'), true);
  assert.equal(qualifies({ leisure: 'spa' }, 'spa'), true);
  assert.match(overpassQuery('spa', { latitude: 14.6, longitude: 121 }, 4000), /\["beauty"~"\(\^\|;\)spa\(;\|\$\)"\]/);
});
test('POI fallback keeps real OSM IDs and excludes ambiguous worship and beauty shops', () => {
  const origin = { latitude: 14.6, longitude: 121 };
  const feature = (id, name, categoryId, lat = 14.601) => ({ geometry: { coordinates: [121.001, lat] },
    properties: { osm_type: 1, osm_id: id, osm_tags: { name }, category_ids: { [categoryId]: {} } } });
  assert.deepEqual(normalizePoiPlaces({ features: [feature(1, 'Poh Chong Temple', 135), feature(2, 'Parish Church', 135)] }, 'church', origin, 2000).map(p => p.placeId), ['node/2']);
  assert.deepEqual(normalizePoiPlaces({ features: [feature(3, 'Beauty Salon', 391), feature(4, 'Bluewater Day Spa', 391), feature(5, 'Too Far Spa', 391, 14.7)] }, 'spa', origin, 2000).map(p => p.placeId), ['node/4']);
});
test('ORS matrix preserves directional nulls and distances', () => {
  const nodes = [{ id: 'origin' }, { id: 'a' }, { id: 'b' }];
  const m = normalizeMatrix(nodes, { durations: [[0, 100, null], [120, 0, 200], [null, 250, 0]], distances: [[0, 1000, null], [1100, 0, 2000], [null, 2100, 0]] });
  assert.equal(m.durationSec[0][1], 100); assert.equal(m.durationSec[1][0], 120);
  assert.equal(m.durationSec[0][2], null); assert.equal(m.distanceMeters[2][1], 2100);
  assert.throws(() => normalizeMatrix(nodes, { durations: [[0, 100]], distances: [[0, 1000]] }), /incomplete/);
});
test('straight-line fallback has no off-diagonal travel time', () => {
  const m = approximateMatrix([{ id: 'origin', latitude: 14.6, longitude: 121 }, { id: 'a', latitude: 14.61, longitude: 121.01 }]);
  assert.equal(m.durationSec[0][1], null); assert.ok(m.distanceMeters[0][1] > 0);
});
test('upstream distinguishes timeout, network failure, and provider limit', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    await assert.rejects(upstream('https://example.invalid'), error => error.status === 504 && error.code === 'UPSTREAM_TIMEOUT');
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(upstream('https://example.invalid'), error => error.status === 502 && error.code === 'NETWORK_UNAVAILABLE');
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(upstream('https://example.invalid'), error => error.status === 429 && error.code === 'PROVIDER_LIMITED');
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(upstream('https://example.invalid', { quotaForbidden: true }), error => error.status === 429 && error.code === 'PROVIDER_LIMITED');
    await assert.rejects(upstream('https://example.invalid'), error => error.status === 502 && error.code === 'UPSTREAM_ERROR');
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new DOMException('Timed out', 'TimeoutError'); } });
    await assert.rejects(upstream('https://example.invalid'), error => error.status === 504 && error.code === 'UPSTREAM_TIMEOUT');
  } finally { globalThis.fetch = originalFetch; }
});
