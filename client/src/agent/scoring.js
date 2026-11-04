/** Bounded, comparable utility terms for complete trips. Ratings must be verified provider data. */
export const PROFILES = Object.freeze({
  fastest: { time: 1, distance: 0 },
  shortest: { time: 0, distance: 1 },
  balanced: { time: 0.5, distance: 0.5 },
  rated: { time: 0.15, distance: 0.15, rating: 0.7 },
});

export function scorePlan(durationSec, distanceMeters, profile, stops = []) {
  const weights = PROFILES[profile];
  if (!weights || !Number.isFinite(distanceMeters) || distanceMeters < 0 ||
      (durationSec !== null && (!Number.isFinite(durationSec) || durationSec < 0))) throw new Error('Invalid scoring input');
  const distanceScore = 1 / (1 + distanceMeters / 10000);
  const timeScore = durationSec === null ? null : 1 / (1 + durationSec / 1800);
  const reviewed = stops.filter(stop => Number.isFinite(stop.rating?.value) && stop.rating.value >= 1 && stop.rating.value <= 5 && Number.isInteger(stop.rating.count) && stop.rating.count > 0);
  // Five prior reviews at 3.5 stars prevent a single five-star review from dominating.
  // An unmatched venue is neutral; it is never represented as having a Google score.
  const ratingScore = stops.length ? stops.reduce((sum, stop) => {
    const rating = stop.rating;
    return sum + (rating && Number.isFinite(rating.value) && Number.isInteger(rating.count) && rating.count > 0
      ? (rating.value * rating.count + 3.5 * 5) / (rating.count + 5) / 5 : 0.5);
  }, 0) / stops.length : null;
  const effectiveWeights = profile === 'rated'
    ? timeScore === null ? { time: 0, distance: 0.3, rating: 0.7 } : weights
    : timeScore === null ? { time: 0, distance: 1, rating: 0 } : { ...weights, rating: 0 };
  return { timeScore, distanceScore, ratingScore, ratedStops: reviewed.length,
    utility: effectiveWeights.time * (timeScore ?? 0) + effectiveWeights.distance * distanceScore + effectiveWeights.rating * (ratingScore ?? 0), weights: effectiveWeights };
}
