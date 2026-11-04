import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_QUERIES, matchGooglePlace, normalizeGooglePlaces, validRatingPlaces } from '../server/googlePlaces.js';

const place = { placeId: 'node/123', name: 'Sample Café', latitude: 14.6019, longitude: 121.0355 };
const listing = { id: 'abc', displayName: { text: 'Sample Cafe' }, location: { latitude: 14.60195, longitude: 121.03553 },
  rating: 4.5, userRatingCount: 27, googleMapsUri: 'https://www.google.com/maps/place/Sample+Cafe' };

test('matches only a nearby unambiguous Google rating', () => {
  assert.deepEqual(matchGooglePlace(place, [listing]), { source: 'google', value: 4.5, count: 27, url: listing.googleMapsUri, googlePlaceId: listing.id });
  assert.equal(matchGooglePlace(place, [{ ...listing, displayName: { text: 'Another Cafe' } }]), null);
  assert.equal(matchGooglePlace(place, [{ ...listing, location: { latitude: 14.61, longitude: 121.04 } }]), null);
  assert.equal(matchGooglePlace(place, [{ ...listing, userRatingCount: 0 }]), null);
  assert.equal(matchGooglePlace(place, [{ ...listing, googleMapsUri: 'https://example.com/place' }]), null);
  assert.equal(matchGooglePlace(place, [listing, { ...listing, location: { latitude: 14.60196, longitude: 121.03553 } }]), null);
});

test('ratings requests accept only bounded distinct OSM venues', () => {
  assert.equal(validRatingPlaces([place]), true);
  assert.equal(validRatingPlaces([place, place]), false);
  assert.equal(validRatingPlaces([{ ...place, placeId: 'fake' }]), false);
  assert.equal(validRatingPlaces(Array(13).fill(place)), false);
});

test('normalizes Google discovery results with a three-candidate radius cap', () => {
  const origin = { latitude: 14.6019, longitude: 121.0355 };
  const raw = { places: [
    { id: 'g1', displayName: { text: 'Coffee One' }, location: origin, rating: 4.8, userRatingCount: 120, googleMapsUri: 'https://www.google.com/maps/place/one', formattedAddress: 'One St' },
    { id: 'g2', displayName: { text: 'Coffee Two' }, location: { latitude: 14.602, longitude: 121.036 }, rating: 4.2, userRatingCount: 4, googleMapsUri: 'https://www.google.com/maps/place/two' },
    { id: 'g3', displayName: { text: 'Coffee Three' }, location: { latitude: 14.603, longitude: 121.037 } },
    { id: 'g4', displayName: { text: 'Coffee Four' }, location: { latitude: 14.604, longitude: 121.038 } },
    { id: 'outside', displayName: { text: 'Far Coffee' }, location: { latitude: 14.7, longitude: 121.1 } },
  ] };
  const venues = normalizeGooglePlaces(raw, 'coffee', origin, 500);
  assert.equal(GOOGLE_QUERIES.coffee, 'coffee shop');
  assert.equal(venues.length, 3);
  assert.deepEqual(venues.map(v => v.googlePlaceId), ['g1', 'g2', 'g3']);
  assert.equal(venues[0].dataSource, 'google');
  assert.equal(venues[0].rating.count, 120);
  assert.equal(venues[0].rating.googlePlaceId, 'g1');
});
