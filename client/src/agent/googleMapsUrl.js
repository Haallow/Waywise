/** Build a Google Maps driving URL preserving the agent's stop order. */
export function googleMapsUrl(origin, stops) {
  if (!stops.length || stops.length > 4) throw new Error('Expected 1–4 ordered stops');
  const coordinates = point => {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) throw new Error('Missing coordinates');
    return `${point.latitude},${point.longitude}`;
  };
  const destination = stops.at(-1);
  const params = new URLSearchParams({ api: '1', origin: coordinates(origin), destination: coordinates(destination), travelmode: 'driving' });
  const via = stops.slice(0, -1);
  if (via.length) {
    params.set('waypoints', via.map(coordinates).join('|'));
    if (via.every(stop => typeof stop.rating?.googlePlaceId === 'string' && stop.rating.googlePlaceId)) {
      params.set('waypoint_place_ids', via.map(stop => stop.rating.googlePlaceId).join('|'));
    }
  }
  if (typeof destination.rating?.googlePlaceId === 'string' && destination.rating.googlePlaceId) {
    params.set('destination_place_id', destination.rating.googlePlaceId);
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
