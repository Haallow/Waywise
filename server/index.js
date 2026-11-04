import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAGS, POI_CATEGORY_IDS, validPoint, overpassQuery, normalizePlaces, normalizePoiPlaces, normalizeMatrix, approximateMatrix, upstream } from './providers.js';
import { GOOGLE_QUERIES, matchGooglePlace, normalizeGooglePlaces, validRatingPlaces } from './googlePlaces.js';
import { getValue, increment, setValue } from './store.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : Number(process.env.TRUST_PROXY) || false);
app.use(express.json({ limit: '24kb' }));
const cache = new Map();
const metrics = { startedAt: new Date().toISOString(), requests: 0, errors: 0, providerLimited: 0, totalMs: 0, completed: 0 };
const endpointLimits = Object.freeze({ '/geocode': 10, '/places': 16, '/ratings': 8, '/matrix': 12, '/route': 12 });
const googleDailyLimit = Math.max(1, Number(process.env.GOOGLE_DAILY_REQUEST_LIMIT) || 40);
const circuit = { google: { failures: 0, until: 0 }, ors: { failures: 0, until: 0 } };
const dayKey = () => new Date().toISOString().slice(0, 10);
const reserveDaily = async (ip, amount = 1, session = '') => {
  const key = `${dayKey()}:${ip}`;
  const used = await increment(`waywise:google:${key}`, 90000);
  const prior = used - 1;
  if (prior + amount > googleDailyLimit) return false;
  if (amount > 1) await increment(`waywise:google:${key}`, amount - 1);
  if (session) {
    const sessionKey = `${dayKey()}:${session}`;
    const sessionUsed = await increment(`waywise:google-session:${sessionKey}`, 90000);
    if (sessionUsed - 1 + amount > googleDailyLimit) return false;
    if (amount > 1) await increment(`waywise:google-session:${sessionKey}`, amount - 1);
  }
  return true;
};
const circuitOpen = provider => circuit[provider].until > Date.now();
const recordProviderFailure = (provider, error) => {
  const state = circuit[provider];
  if (error?.code === 'PROVIDER_LIMITED') state.failures += 1;
  else if (error?.code === 'UPSTREAM_TIMEOUT' || error?.code === 'NETWORK_UNAVAILABLE') state.failures += 0.5;
  if (state.failures >= 3) { state.until = Date.now() + 60000; state.failures = 0; }
};
const recordProviderSuccess = provider => { circuit[provider].failures = 0; circuit[provider].until = 0; };
let lastGeocode = 0;
let overpassRetryAt = 0;
let routeRetryAt = 0;
let lastOverpass = 0, overpassQueue = Promise.resolve();
let lastOrs = 0, orsLaunchQueue = Promise.resolve(), orsPending = 0;
let lastGoogle = 0, googleLaunchQueue = Promise.resolve();
const scheduleGoogle = work => {
  if (circuitOpen('google')) throw { status: 503, code: 'PROVIDER_COOLDOWN', message: 'Google venue service is cooling down after repeated limits. Try again shortly.' };
  const launch = googleLaunchQueue.then(async () => {
    const delay = Math.max(0, 400 - (Date.now() - lastGoogle));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastGoogle = Date.now();
  });
  googleLaunchQueue = launch.catch(() => {});
  return launch.then(work).then(result => { recordProviderSuccess('google'); return result; }, error => { recordProviderFailure('google', error); throw error; });
};
const scheduleOrs = work => {
  if (circuitOpen('ors')) throw { status: 503, code: 'PROVIDER_COOLDOWN', message: 'Road routing is cooling down after repeated limits. Try again shortly.' };
  if (orsPending >= 3) throw { status: 429, code: 'PROVIDER_LIMITED', message: 'Road routing is busy. Try again shortly.' };
  orsPending++;
  const launch = orsLaunchQueue.then(async () => {
    const delay = Math.max(0, 1600 - (Date.now() - lastOrs));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastOrs = Date.now();
  });
  orsLaunchQueue = launch.catch(() => {});
  return launch.then(work).then(result => { recordProviderSuccess('ors'); return result; }, error => { recordProviderFailure('ors', error); throw error; }).finally(() => { orsPending--; });
};
const scheduleOverpass = work => {
  const job = overpassQueue.then(async () => {
    if (Date.now() < overpassRetryAt) throw { status: 503, code: 'UPSTREAM_COOLDOWN', message: 'Venue search is temporarily unavailable. Try again shortly.' };
    const delay = Math.max(0, 1200 - (Date.now() - lastOverpass));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastOverpass = Date.now();
    return work();
  });
  overpassQueue = job.catch(() => {});
  return job;
};
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const cached = (key, ttl, work) => {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < ttl) return entry.promise;
  const promise = (async () => {
    const shared = await getValue(`waywise:cache:${key}`);
    if (shared) return shared;
    const value = await work();
    await setValue(`waywise:cache:${key}`, value, Math.ceil(ttl / 1000));
    return value;
  })().catch(error => { cache.delete(key); throw error; });
  cache.set(key, { at: Date.now(), promise });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return promise;
};
const providerFailure = (res, error) => { if (error?.code === 'PROVIDER_LIMITED' || error?.code === 'PROVIDER_COOLDOWN') metrics.providerLimited++; return fail(res, error.status || 502, error.code || 'UPSTREAM_ERROR', error.code ? error.message : 'Map service unavailable.'); };
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://tile.openstreetmap.org https://*.openstreetmap.org; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.openstreetmap.org; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use((req, res, next) => {
  const started = Date.now(); metrics.requests++;
  res.on('finish', () => { metrics.completed++; metrics.totalMs += Date.now() - started; if (res.statusCode >= 400) metrics.errors++; });
  next();
});
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.ip;
  const endpoint = endpointLimits[req.path] || 40;
  const windowKey = `waywise:rl:${key}`;
  const calls = await increment(windowKey, 600);
  const endpointCalls = await increment(`${windowKey}:${req.path}`, 600);
  if (calls > 40 || endpointCalls > endpoint) return fail(res, 429, 'RATE_LIMITED', 'Request limit reached. Try again later.');
  next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://tile.openstreetmap.org https://*.openstreetmap.org; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.openstreetmap.org; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.ORS_API_KEY ? 'road-routing-capable' : 'distance-only-fallback', providers: { googleCooldown: circuitOpen('google'), orsCooldown: circuitOpen('ors') }, metrics: { requests: metrics.requests, errors: metrics.errors, providerLimited: metrics.providerLimited, averageMs: metrics.completed ? Math.round(metrics.totalMs / metrics.completed) : 0 } }));
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3 || q.length > 120) return fail(res, 400, 'INVALID_INPUT', 'Enter a place or address (3–120 characters).');
  const key = `geo:${q.toLowerCase()}`;
  const recent = cache.get(key);
  if ((!recent || Date.now() - recent.at >= 86400000) && Date.now() - lastGeocode < 1100) return fail(res, 429, 'RATE_LIMITED', 'Wait a moment before another address search.');
  try {
    const data = await cached(key, 86400000, () => {
      lastGeocode = Date.now();
      return upstream(`${process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org'}/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '5' })}`, { headers: { 'User-Agent': 'Waywise/1.0 (+https://github.com/Haallow/Waywise)' } });
    });
    res.json({ dataSource: 'osm', results: data.filter(p => validPoint({ latitude: Number(p.lat), longitude: Number(p.lon) })).map(p => ({ label: p.display_name, latitude: Number(p.lat), longitude: Number(p.lon) })) });
  } catch (e) { providerFailure(res, e); }
});
app.post('/api/places', async (req, res) => {
  const { origin, category, radiusMeters = 4000 } = req.body || {};
  if (!validPoint(origin) || !TAGS[category] || !Number.isFinite(radiusMeters) || radiusMeters < 1000 || radiusMeters > 5000) return fail(res, 400, 'INVALID_INPUT', 'Choose a valid origin, category, and 1–5 km radius.');
  const osmFallback = async () => {
    const key = `places:osm:${category}:${radiusMeters}:${origin.latitude.toFixed(3)}:${origin.longitude.toFixed(3)}`;
    return cached(key, 900000, async () => {
      try {
        const data = await scheduleOverpass(() => upstream(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Waywise/1.0 (+https://github.com/Haallow/Waywise)' }, body: new URLSearchParams({ data: overpassQuery(category, origin, radiusMeters) }) }, 7000));
        return { places: normalizePlaces(data, category, origin), venueSource: 'overpass', searchRadiusMeters: radiusMeters };
      } catch (overpassError) {
        if (overpassError.code !== 'UPSTREAM_COOLDOWN') overpassRetryAt = Date.now() + 300000;
        if (!process.env.ORS_API_KEY) throw overpassError;
        const searchRadiusMeters = Math.min(radiusMeters, 2000);
        const body = { request: 'pois', geometry: { geojson: { type: 'Point', coordinates: [origin.longitude, origin.latitude] }, buffer: searchRadiusMeters },
          limit: 100, sortby: 'distance', filters: { category_ids: POI_CATEGORY_IDS[category] } };
        const data = await scheduleOrs(() => upstream(process.env.POI_URL || 'https://api.heigit.org/openpoiservice/v0/pois', { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body), quotaForbidden: true }, 15000));
        if (!Array.isArray(data.features)) throw { status: 502, code: 'UPSTREAM_ERROR', message: 'OSM POI response is incomplete.' };
        return { places: normalizePoiPlaces(data, category, origin, searchRadiusMeters), venueSource: 'ors-poi', searchRadiusMeters };
      }
    });
  };
  try {
    let result = null;
    let googleFallbackReason = '';
    if (process.env.GOOGLE_PLACES_API_KEY) {
      if (!(await reserveDaily(req.ip, 1, req.get('X-Waywise-Session') || ''))) googleFallbackReason = 'Google daily or session request budget reached.';
      else try {
        const data = await scheduleGoogle(() => upstream('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.formattedAddress', 'Content-Type': 'application/json' },
          body: JSON.stringify({ textQuery: GOOGLE_QUERIES[category], languageCode: 'en', regionCode: 'PH', locationBias: { circle: { center: { latitude: origin.latitude, longitude: origin.longitude }, radius: radiusMeters } } }),
          quotaForbidden: true }, 7000));
        const places = normalizeGooglePlaces(data, category, origin, radiusMeters);
        if (places.length >= 2) result = { places, venueSource: 'google', searchRadiusMeters: radiusMeters };
        else googleFallbackReason = 'Google returned fewer than two usable candidates.';
      } catch (googleError) {
        googleFallbackReason = googleError.code === 'UPSTREAM_TIMEOUT' ? 'Google venue search timed out.' : 'Google venue search was unavailable.';
      }
    } else googleFallbackReason = 'Google Places key is not configured.';
    if (!result) result = await osmFallback();
    res.json({ category, dataSource: result.venueSource === 'google' ? 'google' : 'osm', fallbackReason: result.venueSource === 'google' ? null : googleFallbackReason || null, ...result });
  } catch (e) {
    const message = e.code === 'UPSTREAM_TIMEOUT'
      ? `OpenStreetMap venue search timed out while finding ${category}. ${process.env.ORS_API_KEY ? 'Both OSM venue sources' : 'The public Overpass service'} may be busy or unreachable. Try again later or use Demo Mode.`
      : e.code === 'NETWORK_UNAVAILABLE'
        ? `Cannot reach the OpenStreetMap venue search while finding ${category}. Check your connection or use Demo Mode.`
        : e.message;
    providerFailure(res, { ...e, message });
  }
});
app.post('/api/ratings', async (req, res) => {
  const places = req.body?.places;
  if (!validRatingPlaces(places)) return fail(res, 400, 'INVALID_INPUT', 'Ratings need 1–12 distinct OSM venues with names and coordinates.');
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.json({ dataSource: 'google', status: 'unconfigured', ratings: {}, matchedCount: 0 });
  const unique = [...new Map(places.map(place => [place.placeId, place])).values()];
  if (!(await reserveDaily(req.ip, unique.length, req.get('X-Waywise-Session') || ''))) return res.status(429).json({ error: { code: 'PROVIDER_LIMITED', message: 'Google daily or session request budget reached.' } });
  const results = await Promise.all(unique.map(async place => {
    try {
      const data = await scheduleGoogle(() => upstream('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'places.displayName,places.location,places.rating,places.userRatingCount,places.id,places.googleMapsUri', 'Content-Type': 'application/json' },
        body: JSON.stringify({ textQuery: place.name, languageCode: 'en', regionCode: 'PH', locationBias: { circle: { center: { latitude: place.latitude, longitude: place.longitude }, radius: 200 } } }),
        quotaForbidden: true }, 7000));
      return { placeId: place.placeId, rating: matchGooglePlace(place, data.places) };
    } catch (error) { return { placeId: place.placeId, error: error.code || 'UPSTREAM_ERROR' }; }
  }));
  const ratings = Object.fromEntries(results.filter(result => result.rating).map(result => [result.placeId, result.rating]));
  res.json({ dataSource: 'google', status: results.some(result => result.error) ? 'partial' : 'ready', ratings, matchedCount: Object.keys(ratings).length });
});
app.post('/api/matrix', async (req, res) => {
  const { nodes, mode } = req.body || {};
  if (mode !== 'DRIVE' || !Array.isArray(nodes) || nodes.length < 3 || nodes.length > 13 || nodes[0]?.id !== 'origin' || nodes.some(p => !p?.id || !validPoint(p)) || new Set(nodes.map(p => p.id)).size !== nodes.length) return fail(res, 400, 'INVALID_INPUT', 'Route needs 3–13 distinct points and driving mode.');
  if (!process.env.ORS_API_KEY) return res.json({ ...approximateMatrix(nodes), fallbackCode: 'CONFIG_MISSING', fallbackReason: 'OpenRouteService key is not configured; showing straight-line distance only.' });
  try {
    const key = `matrix:${nodes.map(p => `${p.id}:${p.latitude.toFixed(5)}:${p.longitude.toFixed(5)}`).join('|')}`;
    const data = await cached(key, 300000, () => scheduleOrs(() => upstream(`${process.env.ORS_URL || 'https://api.heigit.org/openrouteservice'}/v2/matrix/driving-car`, { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: nodes.map(p => [p.longitude, p.latitude]), metrics: ['duration', 'distance'] }), quotaForbidden: true })));
    res.json(normalizeMatrix(nodes, data));
  } catch (e) {
    const limited = e.status === 429;
    res.json({ ...approximateMatrix(nodes), fallbackCode: limited ? 'PROVIDER_LIMITED' : 'ROUTING_UNAVAILABLE',
      fallbackReason: limited ? 'OpenRouteService rate or quota limit reached; showing straight-line distance only.' : 'Road routing unavailable; showing straight-line distance only.' });
  }
});
app.post('/api/route', async (req, res) => {
  const { points } = req.body || {};
  if (!process.env.ORS_API_KEY) return fail(res, 503, 'CONFIG_MISSING', 'Road geometry requires ORS.');
  if (!Array.isArray(points) || points.length < 2 || points.length > 5 || points.some(p => !validPoint(p))) return fail(res, 400, 'INVALID_INPUT', 'Route needs 2–5 valid points.');
  try {
    const key = `route:${points.map(p => `${p.latitude.toFixed(5)}:${p.longitude.toFixed(5)}`).join('|')}`;
    const data = await cached(key, 300000, () => Date.now() < routeRetryAt
      ? Promise.reject({ status: 503, code: 'UPSTREAM_COOLDOWN', message: 'Road geometry is temporarily unavailable. The stop-order map remains available.' })
      : scheduleOrs(() => upstream(`${process.env.ORS_URL || 'https://api.heigit.org/openrouteservice'}/v2/directions/driving-car/geojson`, { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: points.map(p => [p.longitude, p.latitude]), instructions: false }), quotaForbidden: true }, 30000)));
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return fail(res, 502, 'UPSTREAM_ERROR', 'Road geometry unavailable.');
    res.json({ dataSource: 'ors', positions: coords.filter(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map(c => [c[1], c[0]]) });
  } catch (e) { if (e.code !== 'UPSTREAM_COOLDOWN') routeRetryAt = Date.now() + 30000; providerFailure(res, e); }
});
app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown API route.'));
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(path.join(dist, 'index.html'))) { app.use(express.static(dist)); app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.use((error, _req, res, _next) => fail(res, error.type === 'entity.too.large' ? 413 : 400, 'INVALID_INPUT', 'Invalid request body.'));
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  app.listen(port, host, () => console.log(`Waywise API listening on http://${host}:${port}`));
}
