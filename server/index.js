import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACE_TYPES, PLACES_MASK, ROUTES_MASK, validPoint, normalizePlaces, normalizeMatrix, googlePost } from './providers.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
const buckets = new Map();
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const now = Date.now(), ip = req.ip;
  const bucket = buckets.get(ip) || { starts: now, calls: 0, elements: 0 };
  if (now - bucket.starts > 10 * 60 * 1000) Object.assign(bucket, { starts: now, calls: 0, elements: 0 });
  bucket.calls++;
  buckets.set(ip, bucket);
  if (bucket.calls > 20) return fail(res, 429, 'UPSTREAM_RATE_LIMITED', 'Local request limit reached. Try again in ten minutes.');
  req.budget = bucket;
  next();
});

function fail(res, status, code, message) { return res.status(status).json({ error: { code, message } }); }
function requireKey(res) {
  if (!process.env.GOOGLE_MAPS_SERVER_KEY) { fail(res, 503, 'CONFIG_MISSING', 'Live Mode needs a configured server key. Use Demo Mode for now.'); return false; }
  return true;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.GOOGLE_MAPS_SERVER_KEY ? 'live-capable' : 'demo-only' }));

app.post('/api/places', async (req, res) => {
  const { origin, category, radiusMeters = 4000 } = req.body || {};
  if (!validPoint(origin) || !PLACE_TYPES[category] || !Number.isFinite(radiusMeters) || radiusMeters < 1000 || radiusMeters > 5000) return fail(res, 400, 'INVALID_INPUT', 'Choose a valid origin, category, and radius from 1–5 km.');
  if (!requireKey(res)) return;
  try {
    const data = await googlePost('https://places.googleapis.com/v1/places:searchNearby', {
      includedTypes: PLACE_TYPES[category], maxResultCount: 5, rankPreference: 'POPULARITY',
      locationRestriction: { circle: { center: { latitude: origin.latitude, longitude: origin.longitude }, radius: radiusMeters } },
    }, PLACES_MASK, process.env.GOOGLE_MAPS_SERVER_KEY);
    res.json({ category, dataSource: 'google', places: normalizePlaces(data, category, origin) });
  } catch (error) { fail(res, error.status || 502, error.code || 'UPSTREAM_ERROR', error.code ? error.message : 'Place search failed. Try again or use Demo Mode.'); }
});

app.post('/api/matrix', async (req, res) => {
  const { nodes, mode } = req.body || {};
  if (mode !== 'DRIVE' || !Array.isArray(nodes) || nodes.length < 3 || nodes.length > 9 ||
    nodes[0]?.id !== 'origin' || nodes.some(node => !node?.id || !validPoint(node)) ||
    new Set(nodes.map(node => node.id)).size !== nodes.length) return fail(res, 400, 'INVALID_INPUT', 'Route request needs 3–9 distinct valid nodes and driving mode.');
  if (req.budget.elements + nodes.length ** 2 > 162) return fail(res, 429, 'UPSTREAM_RATE_LIMITED', 'Local route budget reached. Try later.');
  if (!requireKey(res)) return;
  req.budget.elements += nodes.length ** 2;
  const waypoint = node => ({ waypoint: { location: { latLng: { latitude: node.latitude, longitude: node.longitude } } } });
  try {
    const data = await googlePost('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      origins: nodes.map(waypoint), destinations: nodes.map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
    }, ROUTES_MASK, process.env.GOOGLE_MAPS_SERVER_KEY);
    res.json(normalizeMatrix(nodes, data));
  } catch (error) { fail(res, error.status || 502, error.code || 'UPSTREAM_ERROR', error.code ? error.message : 'Route estimates failed. Try again or use Demo Mode.'); }
});

app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown API route.'));

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((error, _req, res, _next) => fail(res, error.type === 'entity.too.large' ? 413 : 400, 'INVALID_INPUT', 'Invalid request body.'));

if (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT) || 3001, '127.0.0.1', () => console.log('PlanB API listening on http://127.0.0.1:' + (Number(process.env.PORT) || 3001)));
