/** Pure scoring for a complete itinerary. Unknown ratings receive an internal neutral prior. */
export const PROFILES = Object.freeze({
  fastest: { time: 0.9, quality: 0.1 },
  balanced: { time: 0.65, quality: 0.35 },
  'best-rated': { time: 0.35, quality: 0.65 },
});

export function placeQuality(place) {
  const r = place.rating;
  const n = place.userRatingCount;
  if (!Number.isFinite(r) || r < 0 || r > 5 || !Number.isInteger(n) || n < 0) return 3.5 / 5;
  return ((n * r + 20 * 3.5) / (n + 20)) / 5;
}

export function scorePlan(durationSec, stops, profile) {
  const weights = PROFILES[profile];
  if (!weights || !Number.isFinite(durationSec) || durationSec < 0 || !stops.length) throw new Error('Invalid scoring input');
  const timeScore = 1 / (1 + durationSec / 60 / 30);
  const qualityScore = stops.reduce((sum, stop) => sum + placeQuality(stop), 0) / stops.length;
  return { timeScore, qualityScore, utility: weights.time * timeScore + weights.quality * qualityScore, weights };
}
