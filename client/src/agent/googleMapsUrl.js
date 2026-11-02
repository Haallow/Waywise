/** Build a Google Maps driving URL preserving the agent's stop order. */
export function googleMapsUrl(origin, stops) {
  if (!stops.length || stops.length > 4) throw new Error('Expected 1–4 ordered stops');
  const coordinates = point => {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) throw new Error('Missing coordinates');
    return `${point.latitude},${point.longitude}`;
  };
  const params = new URLSearchParams({ api: '1', origin: coordinates(origin), destination: coordinates(stops.at(-1)), travelmode: 'driving' });
  const via = stops.slice(0, -1);
  if (via.length) params.set('waypoints', via.map(coordinates).join('|'));
  const validGoogleId = stop => stop.dataSource === 'google' && typeof stop.placeId === 'string' && stop.placeId.length > 0;
  if (validGoogleId(stops.at(-1))) params.set('destination_place_id', stops.at(-1).placeId);
  if (via.length && via.every(validGoogleId)) params.set('waypoint_place_ids', via.map(stop => stop.placeId).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
