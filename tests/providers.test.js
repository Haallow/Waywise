import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaces, normalizeMatrix, parseDuration, googlePost, PLACES_MASK, ROUTES_MASK } from '../server/providers.js';

test('duration and shuffled matrix elements normalize safely', () => {
  assert.equal(parseDuration('245s'), 245);
  assert.equal(parseDuration('-1s'), null);
  assert.equal(parseDuration(undefined), null);
  const nodes = [{ id: 'origin' }, { id: 'a' }, { id: 'b' }];
  const matrix = normalizeMatrix(nodes, [
    { originIndex: 2, destinationIndex: 1, duration: '245s', distanceMeters: 900, condition: 'ROUTE_EXISTS' },
    { originIndex: 0, destinationIndex: 1, duration: '99s', distanceMeters: 300, condition: 'ROUTE_EXISTS' },
    { originIndex: 1, destinationIndex: 2, duration: '4s', distanceMeters: 10, condition: 'ROUTE_NOT_FOUND' },
  ]);
  assert.equal(matrix.durationSec[2][1], 245);
  assert.equal(matrix.durationSec[0][1], 99);
  assert.equal(matrix.durationSec[1][2], null);
  assert.equal(matrix.durationSec[0][2], null);
});

test('provider request uses protected key header and exact field mask', async () => {
  const previous = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ places: [] }) }; };
  try {
    await googlePost('https://places.googleapis.com/v1/places:searchNearby', { maxResultCount: 5 }, PLACES_MASK, 'test-only-secret');
    assert.equal(request.options.headers['X-Goog-Api-Key'], 'test-only-secret');
    assert.equal(request.options.headers['X-Goog-FieldMask'], PLACES_MASK);
    assert.ok(ROUTES_MASK.includes('originIndex,destinationIndex,duration,distanceMeters,status,condition'));
    assert.equal(request.options.method, 'POST');
    assert.ok(!request.url.includes('test-only-secret'));
  } finally { globalThis.fetch = previous; }
});

test('places keep unknown ratings null and reject invalid/closed entries', () => {
  const places = normalizePlaces({ places: [
    { id: 'a', displayName: { text: 'A' }, location: { latitude: 14, longitude: 121 }, businessStatus: 'OPERATIONAL' },
    { id: 'b', displayName: { text: 'B' }, location: { latitude: 14.01, longitude: 121 }, rating: 4.8, userRatingCount: 12 },
    { id: 'c', location: { latitude: 14.02, longitude: 121 }, businessStatus: 'CLOSED_PERMANENTLY' },
  ] }, 'coffee', { latitude: 14, longitude: 121 });
  assert.deepEqual(places.map(p => p.placeId), ['a', 'b']);
  assert.equal(places[0].rating, null);
});
