import test from 'node:test';
import assert from 'node:assert/strict';

test('Express validates and uses mocked OSM, ORS, and fallback providers', async () => {
  process.env.NODE_ENV = 'test'; process.env.ORS_API_KEY = 'test-only-key';
  const { app } = await import('../server/index.js');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch, calls = [];
  let failOverpass = false, failRoute = false, matrixStatus = null, googleFailure = false;
  let googlePlaces = [{ id: 'abc', displayName: { text: 'OSM Cafe' }, location: { latitude: 14.61, longitude: 121.01 }, rating: 4.5, userRatingCount: 12, googleMapsUri: 'https://www.google.com/maps/place/osm-cafe' }];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    calls.push({ url, options, at: Date.now() });
    if (String(url).includes('interpreter')) {
      if (failOverpass) throw failOverpass === 'timeout' ? new DOMException('Timed out', 'TimeoutError') : new Error('upstream unavailable');
      return { ok: true, json: async () => ({ elements: [{ type: 'node', id: 1, lat: 14.61, lon: 121.01, tags: { name: 'OSM Cafe', amenity: 'cafe' } }] }) };
    }
    if (String(url).startsWith('https://places.googleapis.com/v1/places:searchText')) {
      if (googleFailure) throw new DOMException('Timed out', 'TimeoutError');
      return { ok: true, json: async () => ({ places: googlePlaces }) };
    }
    if (String(url).includes('/openpoiservice/')) {
      const id = JSON.parse(options.body).filters.category_ids[0];
      return { ok: true, json: async () => ({ features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [121.001, 14.701] },
        properties: { osm_id: 91, osm_type: 1, category_ids: { [id]: { category_name: 'spa' } }, osm_tags: { name: id === 306 ? 'The Getaway Spa' : 'POI Cafe' } } }] }) };
    }
    if (String(url).includes('geojson')) {
      if (failRoute) throw new Error('routing unavailable');
      return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [[121, 14.6], [121.01, 14.61]] } }] }) };
    }
    if (matrixStatus && String(url).includes('/matrix/')) return { ok: false, status: matrixStatus };
    return { ok: true, json: async () => ({ durations: [[0, 60, 90], [70, 0, 30], [95, 35, 0]], distances: [[0, 500, 900], [550, 0, 300], [950, 350, 0]] }) };
  };
  const post = async (path, body) => { const r = await globalThis.fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  const configuredGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  try {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const health = await realFetch(base + '/api/health').then(r => r.json());
    assert.equal(health.mode, 'road-routing-capable');
    assert.equal(typeof health.metrics.averageMs, 'number');
    assert.equal(typeof health.providers.googleCooldown, 'boolean');
    assert.equal((await post('/api/places', { origin: { latitude: 14.6, longitude: 121 }, category: 'bad' })).status, 400);
    const p = await post('/api/places', { origin: { latitude: 14.6, longitude: 121 }, category: 'coffee' });
    assert.equal(p.data.places[0].name, 'OSM Cafe');
    const nodes = [{ id: 'origin', latitude: 14.6, longitude: 121 }, { id: 'a', latitude: 14.61, longitude: 121.01 }, { id: 'b', latitude: 14.62, longitude: 121.02 }];
    const m = await post('/api/matrix', { nodes, mode: 'DRIVE' });
    assert.equal(m.data.dataSource, 'ors'); assert.equal(m.data.durationSec[1][0], 70);
    assert.equal(calls[1].options.headers.Authorization, 'test-only-key');
    const route = await post('/api/route', { points: [nodes[0], nodes[1]] });
    assert.equal(route.data.dataSource, 'ors');
    assert.deepEqual(route.data.positions, [[14.6, 121], [14.61, 121.01]]);
    assert.ok(calls[2].at - calls[1].at >= 1500, 'ORS matrix and geometry starts should be spaced');
    failRoute = true;
    const routeFailed = await post('/api/route', { points: [nodes[0], nodes[2]] });
    const routeCalls = calls.length;
    const routeCached = await post('/api/route', { points: [nodes[0], nodes[1]] });
    const routeCooled = await post('/api/route', { points: [nodes[0], nodes[2]] });
    assert.equal(routeFailed.status, 502); assert.equal(routeFailed.data.error.code, 'NETWORK_UNAVAILABLE');
    assert.equal(routeCached.status, 200); assert.equal(routeCached.data.dataSource, 'ors');
    assert.equal(routeCooled.status, 503); assert.equal(calls.length, routeCalls);
    delete process.env.ORS_API_KEY;
    const fallback = await post('/api/matrix', { nodes, mode: 'DRIVE' });
    assert.equal(fallback.data.dataSource, 'approximate'); assert.equal(fallback.data.durationSec[0][1], null);
    assert.equal(fallback.data.fallbackCode, 'CONFIG_MISSING');
    assert.match(fallback.data.fallbackReason, /key is not configured/i);
    process.env.ORS_API_KEY = 'test-only-key'; matrixStatus = 429;
    const limitedNodes = nodes.map((node, i) => ({ ...node, latitude: node.latitude + (i ? 0.001 : 0) }));
    const limited = await post('/api/matrix', { nodes: limitedNodes, mode: 'DRIVE' });
    assert.equal(limited.data.dataSource, 'approximate');
    assert.equal(limited.data.fallbackCode, 'PROVIDER_LIMITED');
    assert.match(limited.data.fallbackReason, /rate or quota limit/i);
    matrixStatus = 403;
    const dailyLimitNodes = nodes.map((node, i) => ({ ...node, latitude: node.latitude + (i ? 0.002 : 0) }));
    const dailyLimit = await post('/api/matrix', { nodes: dailyLimitNodes, mode: 'DRIVE' });
    assert.equal(dailyLimit.data.dataSource, 'approximate');
    assert.equal(dailyLimit.data.fallbackCode, 'PROVIDER_LIMITED');
    failOverpass = 'timeout';
    const recovered = await post('/api/places', { origin: { latitude: 14.7, longitude: 121 }, category: 'spa', radiusMeters: 4000 });
    const overpassCalls = calls.filter(call => String(call.url).includes('interpreter')).length;
    const placeCached = await post('/api/places', { origin: { latitude: 14.6, longitude: 121 }, category: 'coffee' });
    const cooled = await post('/api/places', { origin: { latitude: 14.7, longitude: 121 }, category: 'coffee' });
    assert.equal(recovered.status, 200); assert.equal(recovered.data.venueSource, 'ors-poi');
    assert.equal(recovered.data.searchRadiusMeters, 2000);
    assert.equal(recovered.data.places[0].name, 'The Getaway Spa');
    assert.equal(placeCached.status, 200); assert.equal(placeCached.data.places[0].name, 'OSM Cafe');
    assert.equal(cooled.status, 200); assert.equal(cooled.data.venueSource, 'ors-poi');
    assert.equal(calls.filter(call => String(call.url).includes('interpreter')).length, overpassCalls);
    googlePlaces = [
      { id: 'g-coffee-1', displayName: { text: 'Google Coffee One' }, location: { latitude: 14.61, longitude: 121.01 }, rating: 4.8, userRatingCount: 120, googleMapsUri: 'https://www.google.com/maps/place/google-coffee-one' },
      { id: 'g-coffee-2', displayName: { text: 'Google Coffee Two' }, location: { latitude: 14.611, longitude: 121.011 }, rating: 4.4, userRatingCount: 20, googleMapsUri: 'https://www.google.com/maps/place/google-coffee-two' },
    ];
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    const googleDiscovery = await post('/api/places', { origin: { latitude: 14.6, longitude: 121 }, category: 'restaurant' });
    assert.equal(googleDiscovery.data.dataSource, 'google');
    assert.equal(googleDiscovery.data.places.length, 2);
    assert.equal(googleDiscovery.data.places[0].googlePlaceId, 'g-coffee-1');
    assert.equal(googleDiscovery.data.places[0].rating.value, 4.8);
    googleFailure = true;
    const googleFallback = await post('/api/places', { origin: { latitude: 14.65, longitude: 121 }, category: 'coffee' });
    assert.equal(googleFallback.data.dataSource, 'osm');
    assert.match(googleFallback.data.fallbackReason, /timed out/i);
    googleFailure = false;
    googlePlaces = [{ id: 'abc', displayName: { text: 'OSM Cafe' }, location: { latitude: 14.61, longitude: 121.01 }, rating: 4.5, userRatingCount: 12, googleMapsUri: 'https://www.google.com/maps/place/osm-cafe' }];
    delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal((await post('/api/ratings', { places: [{ placeId: 'node/1', name: 'OSM Cafe', latitude: 14.61, longitude: 121.01 }] })).data.status, 'unconfigured');
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    const ratings = await post('/api/ratings', { places: [{ placeId: 'node/1', name: 'OSM Cafe', latitude: 14.61, longitude: 121.01 }] });
    assert.equal(ratings.data.ratings['node/1'].value, 4.5);
    assert.equal(ratings.data.matchedCount, 1);
    const googleCall = calls.find(call => String(call.url).startsWith('https://places.googleapis.com/'));
    assert.equal(googleCall.options.headers['X-Goog-Api-Key'], 'test-google-key');
    assert.match(googleCall.options.headers['X-Goog-FieldMask'], /places\.rating/);
    assert.equal(JSON.parse(googleCall.options.body).regionCode, 'PH');
    assert.equal((await post('/api/ratings', { places: [{ placeId: 'demo/1', name: 'Fake', latitude: 14.6, longitude: 121 }] })).status, 400);
  } finally { globalThis.fetch = realFetch; delete process.env.ORS_API_KEY; if (configuredGoogleKey) process.env.GOOGLE_PLACES_API_KEY = configuredGoogleKey; else delete process.env.GOOGLE_PLACES_API_KEY; await new Promise(resolve => server.close(resolve)); }
});
