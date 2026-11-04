import { haversine, validPoint } from './providers.js';

export const GOOGLE_QUERIES = Object.freeze({
  coffee: 'coffee shop', groceries: 'grocery store supermarket convenience store', church: 'church',
  spa: 'spa', pharmacy: 'pharmacy', restaurant: 'restaurant', other: 'general store',
  bakery: 'bakery', bank: 'bank', fuel: 'gas station', laundry: 'laundromat laundry', parking: 'parking garage',
});

const normalizedName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Attach only a nearby, unambiguous Google rating to an existing OSM venue. */
export function matchGooglePlace(place, googlePlaces) {
  if (!validPoint(place) || !place.name || !Array.isArray(googlePlaces)) return null;
  const candidates = googlePlaces.map(item => {
    const candidate = { name: item.displayName?.text, coordinates: item.location,
      rating: item.rating, count: item.userRatingCount, url: item.googleMapsUri, id: item.id };
    return { candidate, meters: validPoint(candidate.coordinates) ? haversine(place, candidate.coordinates) : Infinity };
  }).filter(({ candidate, meters }) => normalizedName(candidate.name) === normalizedName(place.name) && meters <= 100 &&
    Number.isFinite(candidate.rating) && candidate.rating >= 1 && candidate.rating <= 5 &&
    Number.isInteger(candidate.count) && candidate.count > 0 && typeof candidate.url === 'string' && /^https:\/\/(?:www\.)?google\.com\/maps|^https:\/\/maps\.google\.com\//.test(candidate.url))
    .sort((a, b) => a.meters - b.meters);
  if (!candidates.length || (candidates[1] && candidates[1].meters - candidates[0].meters < 30)) return null;
  const { candidate } = candidates[0];
  return { value: candidate.rating, count: candidate.count, url: candidate.url, source: 'google', googlePlaceId: candidate.id };
}

export function normalizeGooglePlaces(raw, category, origin, radiusMeters) {
  const seen = new Set();
  const items = Array.isArray(raw?.places) ? raw.places : [];
  return items.map(item => {
    if (!item || typeof item !== 'object') return null;
    const googlePlaceId = typeof item.id === 'string' ? item.id : '';
    const name = typeof item.displayName?.text === 'string' ? item.displayName.text.trim() : '';
    const { latitude, longitude } = item.location || {};
    const place = {
      placeId: `google/${googlePlaceId}`, googlePlaceId, name, category, latitude, longitude,
      address: typeof item.formattedAddress === 'string' ? item.formattedAddress : null,
      dataSource: 'google',
    };
    if (!googlePlaceId || !name || !validPoint(place) || seen.has(googlePlaceId) || haversine(origin, place) > radiusMeters) return null;
    seen.add(googlePlaceId);
    if (Number.isFinite(item.rating) && item.rating >= 1 && item.rating <= 5 && Number.isInteger(item.userRatingCount) && item.userRatingCount > 0 && typeof item.googleMapsUri === 'string') {
      place.rating = { value: item.rating, count: item.userRatingCount, url: item.googleMapsUri, source: 'google', googlePlaceId };
    }
    return place;
  }).filter(Boolean).slice(0, 3);
}

export function validRatingPlaces(places) {
  return Array.isArray(places) && places.length >= 1 && places.length <= 12 &&
    places.every(place => typeof place.placeId === 'string' && /^(node|way|relation)\/\d+$/.test(place.placeId) &&
      typeof place.name === 'string' && place.name.trim().length >= 2 && place.name.length <= 120 && validPoint(place)) &&
    new Set(places.map(place => place.placeId)).size === places.length;
}
