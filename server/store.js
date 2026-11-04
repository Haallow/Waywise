import { createClient } from 'redis';

const localCounters = new Map();
const localValues = new Map();
let clientPromise;

async function client() {
  if (!process.env.REDIS_URL) return null;
  if (!clientPromise) {
    const redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', () => {});
    clientPromise = redis.connect().then(() => redis).catch(() => null);
  }
  return clientPromise;
}

export async function increment(key, ttlSeconds) {
  const redis = await client();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSeconds);
    return count;
  }
  const now = Date.now();
  const current = localCounters.get(key);
  if (!current || current.expiresAt <= now) localCounters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
  else current.count += 1;
  return localCounters.get(key).count;
}

export async function getValue(key) {
  const redis = await client();
  if (redis) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  const entry = localValues.get(key);
  if (!entry || entry.expiresAt <= Date.now()) { localValues.delete(key); return null; }
  return entry.value;
}

export async function setValue(key, value, ttlSeconds) {
  const redis = await client();
  if (redis) { await redis.set(key, JSON.stringify(value), { EX: ttlSeconds }); return; }
  localValues.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (localValues.size > 500) localValues.delete(localValues.keys().next().value);
}
