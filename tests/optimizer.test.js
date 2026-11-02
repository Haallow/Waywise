import test from 'node:test';
import assert from 'node:assert/strict';
import { optimize } from '../client/src/agent/optimizer.js';
import { placeQuality } from '../client/src/agent/scoring.js';
import { evaluateOrder } from '../client/src/agent/baseline.js';
import { demoSnapshot } from '../client/src/services/demoData.js';

const errands = categories => categories.map(category => ({ id: category, category, status: 'pending' }));
const runDemo = (categories, profile = 'balanced') => {
  const { groups, matrix } = demoSnapshot(categories);
  return optimize({ errands: errands(categories), groups, matrix, profile });
};

test('enumerates all 8 and 384 complete routes', () => {
  assert.equal(runDemo(['coffee', 'spa']).enumerated, 8);
  const four = runDemo(['coffee', 'groceries', 'church', 'spa']);
  assert.equal(four.enumerated, 384);
  assert.equal(four.feasible, 384);
  assert.equal(four.plan.selectedStops.length, 4);
  assert.ok(four.runnerUp);
  assert.ok(four.plan.utility >= four.runnerUp.utility);
});

test('profile changes recompute venue choices, and best utility beats baseline', () => {
  const categories = ['coffee', 'groceries', 'church', 'spa'];
  const quick = runDemo(categories, 'fastest');
  const rated = runDemo(categories, 'best-rated');
  assert.notDeepEqual(quick.plan.selectedStops.map(s => s.placeId), rated.plan.selectedStops.map(s => s.placeId));
  assert.ok(quick.plan.travelDurationSec < rated.plan.travelDurationSec);
  assert.ok(rated.plan.qualityScore > quick.plan.qualityScore);
  for (const result of [quick, rated]) assert.ok(result.plan.utility >= result.baseline.utility - 1e-12);
});

test('fictional directional bottleneck changes the selected visit order', () => {
  const categories = ['coffee', 'groceries', 'church', 'spa'];
  const standard = demoSnapshot(categories, 'standard');
  const bottleneck = demoSnapshot(categories, 'bottleneck');
  const input = snapshot => optimize({ errands: errands(categories), groups: snapshot.groups, matrix: snapshot.matrix, profile: 'fastest' });
  assert.deepEqual(input(standard).plan.selectedStops.slice(0, 2).map(s => s.category), ['coffee', 'groceries']);
  assert.deepEqual(input(bottleneck).plan.selectedStops.slice(0, 2).map(s => s.category), ['groceries', 'coffee']);
});

test('missing ratings remain unknown but receive neutral internal model quality', () => {
  assert.equal(placeQuality({ rating: null, userRatingCount: null }), 0.7);
  assert.equal(placeQuality({ rating: 0, userRatingCount: 0 }), 0.7);
  const { groups, matrix } = demoSnapshot(['coffee', 'spa']);
  groups.coffee[0] = { ...groups.coffee[0], rating: null, userRatingCount: null };
  assert.ok(optimize({ errands: errands(['coffee', 'spa']), groups, matrix, profile: 'balanced' }).plan);
});

test('unreachable and duplicate venue plans are excluded; missing category is explicit', () => {
  const { groups, matrix } = demoSnapshot(['coffee', 'spa']);
  const index = matrix.nodes.findIndex(node => node.id === groups.coffee[0].placeId);
  matrix.durationSec[0][index] = null;
  const result = optimize({ errands: errands(['coffee', 'spa']), groups, matrix, profile: 'balanced' });
  assert.ok(result.feasible < result.enumerated);
  groups.spa[0] = { ...groups.spa[0], placeId: groups.coffee[0].placeId };
  const duplicate = optimize({ errands: errands(['coffee', 'spa']), groups, matrix, profile: 'balanced' });
  assert.ok(duplicate.feasible < result.feasible);
  assert.match(optimize({ errands: errands(['coffee', 'church']), groups, matrix, profile: 'balanced' }).reason, /church/);
});

test('directed legs and stable tie breaks', () => {
  const a = { category: 'coffee', placeId: 'a', rating: null, userRatingCount: null };
  const b = { category: 'spa', placeId: 'b', rating: null, userRatingCount: null };
  const matrix = { nodes: [{ id: 'origin' }, { id: 'a' }, { id: 'b' }], durationSec: [[0, 60, 60], [null, 0, 600], [null, 90, 0]], distanceMeters: [[0, 100, 100], [null, 0, 1000], [null, 120, 0]] };
  assert.equal(evaluateOrder([a, b], matrix, 'fastest').travelDurationSec, 660);
  assert.equal(evaluateOrder([b, a], matrix, 'fastest').travelDurationSec, 150);
  const input = { errands: errands(['coffee', 'spa']), groups: { coffee: [a], spa: [b] }, matrix, profile: 'fastest' };
  assert.deepEqual(optimize(input).plan.selectedStops.map(s => s.placeId), ['b', 'a']);
  const first = runDemo(['coffee', 'spa']).plan.selectedStops.map(s => s.placeId);
  assert.deepEqual(first, runDemo(['coffee', 'spa']).plan.selectedStops.map(s => s.placeId));
});

test('equal candidate plans choose stable place IDs and baseline uses identical score inputs', () => {
  const groups = {
    coffee: ['z', 'a'].map(placeId => ({ placeId, category: 'coffee', rating: 4, userRatingCount: 20 })),
    spa: ['y', 'b'].map(placeId => ({ placeId, category: 'spa', rating: 4, userRatingCount: 20 })),
  };
  const ids = ['origin', 'z', 'a', 'y', 'b'];
  const matrix = { nodes: ids.map(id => ({ id })), durationSec: ids.map((_, i) => ids.map((_, j) => i === j ? 0 : 60)), distanceMeters: ids.map((_, i) => ids.map((_, j) => i === j ? 0 : 100)) };
  const result = optimize({ errands: errands(['coffee', 'spa']), groups, matrix, profile: 'balanced' });
  assert.equal(result.enumerated, 8);
  assert.deepEqual(result.plan.selectedStops.map(s => s.placeId), ['a', 'b']);
  const independent = evaluateOrder(result.baseline.selectedStops, matrix, 'balanced');
  assert.equal(result.baseline.utility, independent.utility);
  assert.equal(result.baseline.travelDurationSec, independent.travelDurationSec);
});

test('skip and completion leave only pending errands to replan', () => {
  const { groups, matrix } = demoSnapshot(['coffee', 'groceries', 'church', 'spa']);
  const result = optimize({ errands: [{ id: 'coffee', category: 'coffee', status: 'completed' }, { id: 'church', category: 'church', status: 'skipped' }, ...errands(['groceries', 'spa'])], groups, matrix, profile: 'balanced', originId: 'demo-coffee-1' });
  assert.deepEqual(new Set(result.plan.selectedStops.map(s => s.category)), new Set(['groceries', 'spa']));
  assert.equal(result.enumerated, 8);
  assert.equal(result.plan.legs[0].fromId, 'demo-coffee-1');
});
