import test from 'node:test';
import assert from 'node:assert/strict';

test('Express live endpoints validate, cap, and normalize a mocked provider flow', async () => {
  process.env.NODE_ENV = 'test';
  process.env.GOOGLE_MAPS_SERVER_KEY = 'test-only-secret';
  const { app } = await import('../server/index.js');
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    calls.push({ url, options });
    if (String(url).includes('searchNearby')) return { ok: true, json: async () => ({ places: [
      { id: 'a', displayName: { text: 'Real provider venue' }, location: { latitude: 14.61, longitude: 121.01 }, rating: 4.5, userRatingCount: 10 },
    ] }) };
    return { ok: true, json: async () => [
      { originIndex: 2, destinationIndex: 1, duration: '180s', distanceMeters: 900, condition: 'ROUTE_EXISTS' },
      { originIndex: 0, destinationIndex: 1, duration: '240s', distanceMeters: 1200, condition: 'ROUTE_EXISTS' },
    ] };
  };
  const post = async (path, body) => {
    const response = await globalThis.fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const health = await realFetch(base + '/api/health').then(r => r.json());
    assert.equal(health.mode, 'live-capable');
    const invalid = await post('/api/places', { category: 'unknown', origin: { latitude: 14, longitude: 121 } });
    assert.equal(invalid.status, 400);
    const place = await post('/api/places', { category: 'coffee', origin: { latitude: 14.6, longitude: 121 }, radiusMeters: 4000 });
    assert.equal(place.status, 200);
    assert.equal(place.data.places[0].name, 'Real provider venue');
    assert.equal(place.data.places[0].dataSource, 'google');
    const nodes = [{ id: 'origin', latitude: 14.6, longitude: 121 }, { id: 'a', latitude: 14.61, longitude: 121.01 }, { id: 'b', latitude: 14.62, longitude: 121.02 }];
    const matrix = await post('/api/matrix', { nodes, mode: 'DRIVE' });
    assert.equal(matrix.status, 200);
    assert.equal(matrix.data.durationSec[2][1], 180);
    assert.equal(matrix.data.durationSec[1][2], null);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'test-only-secret');
    assert.deepEqual(JSON.parse(calls[1].options.body).origins.length, 3);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    await new Promise(resolve => server.close(resolve));
  }
});
