import { scorePlan } from './scoring.js';

/** Directed edge lookup. Missing or invalid edges stay unavailable. */
export function edge(matrix, fromId, toId) {
  const from = matrix.nodes.findIndex(node => node.id === fromId);
  const to = matrix.nodes.findIndex(node => node.id === toId);
  if (from < 0 || to < 0) return null;
  const durationSec = matrix.durationSec?.[from]?.[to];
  const distanceMeters = matrix.distanceMeters?.[from]?.[to];
  return Number.isFinite(durationSec) && durationSec >= 0 && Number.isFinite(distanceMeters) && distanceMeters >= 0
    ? { durationSec, distanceMeters } : null;
}

export function evaluateOrder(stops, matrix, profile, originId = 'origin') {
  let from = originId;
  let durationSec = 0;
  let distanceMeters = 0;
  const legs = [];
  for (const stop of stops) {
    const leg = edge(matrix, from, stop.placeId);
    if (!leg) return null;
    legs.push({ fromId: from, toId: stop.placeId, ...leg });
    durationSec += leg.durationSec;
    distanceMeters += leg.distanceMeters;
    from = stop.placeId;
  }
  return { selectedStops: stops, legs, travelDurationSec: durationSec, travelDistanceMeters: distanceMeters, ...scorePlan(durationSec, stops, profile) };
}

/** Nearest reachable next venue across remaining errands, using the same groups and matrix. */
export function greedyBaseline(errands, groups, matrix, profile, originId = 'origin') {
  const remaining = [...errands];
  const stops = [];
  let from = originId;
  while (remaining.length) {
    const options = remaining.flatMap(errand => (groups[errand.category] || []).map(place => ({ ...place, errandId: errand.id })));
    const valid = options.filter(stop => !stops.some(chosen => chosen.placeId === stop.placeId))
      .map(stop => ({ stop, leg: edge(matrix, from, stop.placeId) })).filter(item => item.leg);
    valid.sort((a, b) => a.leg.durationSec - b.leg.durationSec || a.leg.distanceMeters - b.leg.distanceMeters || a.stop.placeId.localeCompare(b.stop.placeId));
    if (!valid.length) return null;
    const next = valid[0].stop;
    stops.push(next);
    from = next.placeId;
    remaining.splice(remaining.findIndex(errand => errand.id === next.errandId), 1);
  }
  return evaluateOrder(stops, matrix, profile, originId);
}
