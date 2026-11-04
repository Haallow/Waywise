import test from 'node:test';
import assert from 'node:assert/strict';
import { optimize } from '../client/src/agent/optimizer.js';
import { evaluateOrder } from '../client/src/agent/baseline.js';
import { scorePlan } from '../client/src/agent/scoring.js';
import { demoSnapshot } from '../client/src/services/demoData.js';
import { approximateMatrix } from '../server/providers.js';

const errands = cats => cats.map(category => ({ id: category, category, status: 'pending' }));
const run = (cats, profile = 'balanced', scenario = 'standard') => {
  const s = demoSnapshot(cats, scenario); return optimize({ errands: errands(cats), groups: s.groups, matrix: s.matrix, profile });
};
test('exhaustively enumerates 8 and 384 complete plans', () => {
  assert.equal(run(['coffee', 'spa']).enumerated, 8);
  const four = run(['coffee', 'groceries', 'church', 'spa']);
  assert.equal(four.enumerated, 384); assert.equal(four.feasible, 384); assert.equal(four.plan.selectedStops.length, 4);
  assert.ok(four.plan.utility >= four.baseline.utility);
});
test('three candidates per category enumerate 1,944 complete plans', () => {
  const cats = ['coffee', 'groceries', 'church', 'spa'];
  const groups = Object.fromEntries(cats.map(category => [category, [1, 2, 3].map(n => ({ placeId: `${category}-${n}`, category }))]));
  const ids = ['origin', ...Object.values(groups).flat().map(p => p.placeId)];
  const matrix = { nodes: ids.map(id => ({ id })), durationSec: ids.map((_, i) => ids.map((_, j) => i === j ? 0 : 60)), distanceMeters: ids.map((_, i) => ids.map((_, j) => i === j ? 0 : 1000)), dataSource: 'demo' };
  const result = optimize({ errands: errands(cats), groups, matrix, profile: 'balanced' });
  assert.equal(result.enumerated, 1944); assert.equal(result.feasible, 1944);
});
test('time and distance strategies use different normalized terms', () => {
  assert.equal(scorePlan(600, 10000, 'fastest').utility, 0.75);
  assert.equal(scorePlan(600, 10000, 'shortest').utility, 0.5);
  assert.equal(scorePlan(null, 10000, 'fastest').utility, 0.5);
  const s = demoSnapshot(['coffee', 'spa']);
  const a = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'fastest' });
  const b = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'shortest' });
  assert.notEqual(a.plan.utility, b.plan.utility);
});
test('highly rated strategy uses verified ratings and keeps one matrix for baseline', () => {
  const s = demoSnapshot(['coffee', 'spa']);
  const plain = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'rated' });
  assert.equal(plain.plan.ratedStops, 0);
  assert.equal(plain.plan.weights.rating, 0.7);
  s.groups.coffee[1].rating = { source: 'google', value: 5, count: 100, url: 'https://www.google.com/maps/place/example' };
  const rated = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'rated' });
  assert.equal(rated.plan.selectedStops.find(stop => stop.category === 'coffee').placeId, s.groups.coffee[1].placeId);
  assert.equal(rated.plan.ratedStops, 1);
  assert.equal(rated.baseline.utility, evaluateOrder(rated.baseline.selectedStops, s.matrix, 'rated').utility);
});
test('directed bottleneck changes chosen order', () => {
  const cats = ['coffee', 'groceries', 'church', 'spa'];
  assert.notDeepEqual(run(cats, 'fastest').plan.selectedStops.map(s => s.placeId), run(cats, 'fastest', 'bottleneck').plan.selectedStops.map(s => s.placeId));
});
test('missing directed legs and duplicate venues are rejected', () => {
  const s = demoSnapshot(['coffee', 'spa']);
  s.matrix.durationSec[0][1] = null;
  const first = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'balanced' });
  assert.ok(first.feasible < first.enumerated);
  s.groups.spa[0] = { ...s.groups.spa[0], placeId: s.groups.coffee[0].placeId };
  const second = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'balanced' });
  assert.ok(second.feasible < first.feasible);
});
test('approximate fallback scores distance only and shows no invented duration', () => {
  const s = demoSnapshot(['coffee', 'spa']);
  s.matrix = approximateMatrix(s.matrix.nodes);
  const result = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'fastest' });
  assert.equal(result.plan.travelDurationSec, null);
  assert.equal(result.plan.timeScore, null);
  assert.equal(result.plan.weights.distance, 1);
  assert.equal(result.baseline.travelDurationSec, null);
});
test('baseline uses same matrix and score; ties are deterministic', () => {
  const s = demoSnapshot(['coffee', 'spa']);
  const input = { errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'balanced' };
  const r = optimize(input);
  assert.equal(r.baseline.utility, evaluateOrder(r.baseline.selectedStops, s.matrix, 'balanced').utility);
  assert.deepEqual(r.plan.selectedStops.map(p => p.placeId), optimize(input).plan.selectedStops.map(p => p.placeId));
});
test('baseline rejects a venue with the wrong errand category', () => {
  const s = demoSnapshot(['coffee', 'spa']);
  s.groups.coffee[0] = { ...s.groups.coffee[0], category: 'spa' };
  const result = optimize({ errands: errands(['coffee', 'spa']), groups: s.groups, matrix: s.matrix, profile: 'balanced' });
  assert.ok(result.plan);
  assert.ok(result.baseline);
  assert.ok(result.baseline.selectedStops.every(stop => stop.category === stop.errandId));
  assert.equal(result.baseline.selectedStops.find(stop => stop.category === 'coffee').placeId, 'demo-coffee-2');
});
test('agent can find a complete route when nearest-next reaches a dead end', () => {
  const groups = {
    coffee: [{ placeId: 'a', category: 'coffee' }, { placeId: 'b', category: 'coffee' }],
    spa: [{ placeId: 'c', category: 'spa' }],
  };
  const ids = ['origin', 'a', 'b', 'c'];
  const matrix = { nodes: ids.map(id => ({ id })), durationSec: [[0, 60, 120, null], [null, 0, null, null], [null, null, 0, 60], [null, null, null, 0]], distanceMeters: [[0, 100, 200, null], [null, 0, null, null], [null, null, 0, 100], [null, null, null, 0]], dataSource: 'demo' };
  const result = optimize({ errands: errands(['coffee', 'spa']), groups, matrix, profile: 'fastest' });
  assert.deepEqual(result.plan.selectedStops.map(p => p.placeId), ['b', 'c']);
  assert.equal(result.baseline, null);
});
test('skip and completion replan pending errands from latest completed venue', () => {
  const s = demoSnapshot(['coffee', 'groceries', 'church', 'spa']);
  const result = optimize({ errands: [{ id: 'coffee', category: 'coffee', status: 'completed' }, { id: 'church', category: 'church', status: 'skipped' }, ...errands(['groceries', 'spa'])], groups: s.groups, matrix: s.matrix, profile: 'balanced', originId: 'demo-coffee-1' });
  assert.equal(result.enumerated, 8);
  assert.deepEqual(new Set(result.plan.selectedStops.map(p => p.category)), new Set(['groceries', 'spa']));
  assert.equal(result.plan.legs[0].fromId, 'demo-coffee-1');
});
