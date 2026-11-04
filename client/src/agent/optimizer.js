import { evaluateOrder, greedyBaseline } from './baseline.js';

function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest]));
}

function comparePlans(a, b) {
  if (!b) return -1;
  const delta = b.utility - a.utility;
  if (Math.abs(delta) > 1e-12) return delta;
  return (a.travelDurationSec ?? Infinity) - (b.travelDurationSec ?? Infinity) || a.travelDistanceMeters - b.travelDistanceMeters ||
    a.selectedStops.map(stop => stop.placeId).join('|').localeCompare(b.selectedStops.map(stop => stop.placeId).join('|'));
}

/**
 * @param {{errands:Array<{id:string,category:string,status?:string}>,groups:Record<string,Array>,matrix:Object,profile:string,originId?:string}} input
 * @returns {{plan:Object|null, runnerUp:Object|null, baseline:Object|null, enumerated:number, feasible:number, reason:string}}
 * Complete plans pick exactly one venue per pending errand and every visit order.
 */
export function optimize({ errands, groups, matrix, profile, originId = 'origin' }) {
  const pending = errands.filter(errand => !errand.status || errand.status === 'pending');
  if (!pending.length) return { plan: null, runnerUp: null, baseline: null, enumerated: 0, feasible: 0, reason: 'No pending errands.' };
  if (pending.length > 4 || new Set(pending.map(e => e.id)).size !== pending.length || new Set(pending.map(e => e.category)).size !== pending.length) throw new Error('Expected 1–4 distinct pending errands');
  for (const errand of pending) {
    if (!groups[errand.category]?.length) return { plan: null, runnerUp: null, baseline: null, enumerated: 0, feasible: 0, reason: `No candidates for ${errand.category}.` };
    if (groups[errand.category].length > 3) throw new Error('At most three candidates per errand');
  }
  let best = null;
  let runnerUp = null;
  let enumerated = 0;
  let feasible = 0;
  const choices = (index, chosen) => {
    if (index === pending.length) {
      for (const order of permutations(chosen)) {
        enumerated++;
        if (new Set(order.map(stop => stop.placeId)).size !== order.length) continue;
        const plan = evaluateOrder(order, matrix, profile, originId);
        if (!plan) continue;
        feasible++;
        if (comparePlans(plan, best) < 0) { runnerUp = best; best = plan; }
        else if (plan.selectedStops.map(stop => stop.placeId).join('|') !== best?.selectedStops.map(stop => stop.placeId).join('|') && comparePlans(plan, runnerUp) < 0) runnerUp = plan;
      }
      return;
    }
    const errand = pending[index];
    for (const place of groups[errand.category]) {
      if (place.category !== errand.category || !place.placeId) continue;
      choices(index + 1, [...chosen, { ...place, errandId: errand.id }]);
    }
  };
  choices(0, []);
  const baseline = greedyBaseline(pending, groups, matrix, profile, originId);
  return { plan: best, runnerUp, baseline, enumerated, feasible, reason: best ? '' : 'No complete itinerary has all required directed legs.' };
}
