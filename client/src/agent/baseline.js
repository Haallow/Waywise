import { scorePlan } from './scoring.js';

/** Directed edge lookup. Approximate matrices have distance but no duration. */
export function edge(matrix, fromId, toId) {
  const from = matrix.nodes.findIndex(node => node.id === fromId);
  const to = matrix.nodes.findIndex(node => node.id === toId);
  if (from < 0 || to < 0) return null;
  const durationSec = matrix.durationSec?.[from]?.[to];
  const distanceMeters = matrix.distanceMeters?.[from]?.[to];
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  if (matrix.dataSource !== 'approximate' && (!Number.isFinite(durationSec) || durationSec < 0)) return null;
  return { durationSec: Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : null, distanceMeters };
}

export function evaluateOrder(stops, matrix, profile, originId = 'origin') {
  let from = originId, durationSec = 0, distanceMeters = 0;
  const legs = [];
  for (const stop of stops) {
    const leg = edge(matrix, from, stop.placeId);
    if (!leg) return null;
    legs.push({ fromId: from, toId: stop.placeId, ...leg });
    if (leg.durationSec === null) durationSec = null;
    else if (durationSec !== null) durationSec += leg.durationSec;
    distanceMeters += leg.distanceMeters;
    from = stop.placeId;
  }
  return { selectedStops: stops, legs, travelDurationSec: durationSec, travelDistanceMeters: distanceMeters, ...scorePlan(durationSec, distanceMeters, profile, stops) };
}

/** Greedy nearest next stop using time where available, otherwise distance. */
export function greedyBaseline(errands, groups, matrix, profile, originId = 'origin') {
  const remaining = [...errands], stops = [];
  let from = originId;
  while (remaining.length) {
    const options = remaining.flatMap(errand => (groups[errand.category] || [])
      .filter(place => place.category === errand.category && place.placeId)
      .map(place => ({ ...place, errandId: errand.id })));
    const valid = options.filter(stop => !stops.some(chosen => chosen.placeId === stop.placeId))
      .map(stop => ({ stop, leg: edge(matrix, from, stop.placeId) })).filter(item => item.leg);
    valid.sort((a, b) => (a.leg.durationSec ?? a.leg.distanceMeters) - (b.leg.durationSec ?? b.leg.distanceMeters) || a.stop.placeId.localeCompare(b.stop.placeId));
    if (!valid.length) return null;
    const next = valid[0].stop;
    stops.push(next); from = next.placeId;
    remaining.splice(remaining.findIndex(errand => errand.id === next.errandId), 1);
  }
  return evaluateOrder(stops, matrix, profile, originId);
}
