import test from 'node:test';
import assert from 'node:assert/strict';
import { errandsInSnapshot, groupsForPlanning, hasDistinctVenueAssignment, matrixNodesForGroups, savedGroupsForRefresh } from '../client/src/services/refreshSnapshot.js';
import { demoSnapshot } from '../client/src/services/demoData.js';
import { optimize } from '../client/src/agent/optimizer.js';
import { approximateMatrix } from '../server/providers.js';

test('live refresh retains completed and skipped venues for replanning and Undo', () => {
  const categories = ['coffee', 'church', 'spa'];
  const previous = demoSnapshot(categories);
  const completed = [previous.groups.coffee[0]];
  const statuses = { coffee: 'completed', church: 'skipped' };
  const groups = savedGroupsForRefresh(categories, statuses, previous, completed);
  assert.deepEqual(Object.keys(groups), ['coffee', 'church']);
  assert.ok(groups.coffee.some(place => place.placeId === completed[0].placeId));
  groups.spa = previous.groups.spa;
  const nodes = [previous.origin, ...Object.values(groups).flat().map(place => ({ id: place.placeId, latitude: place.latitude, longitude: place.longitude }))];
  const matrix = approximateMatrix(nodes);
  const errands = categories.map(category => ({ id: category, category, status: statuses[category] || 'pending' }));
  const remaining = optimize({ errands, groups, matrix, profile: 'shortest', originId: completed[0].placeId });
  assert.equal(remaining.plan.selectedStops.length, 1);
  assert.equal(remaining.plan.legs[0].fromId, completed[0].placeId);
  const undone = optimize({ errands: errands.map(errand => errand.category === 'coffee' ? { ...errand, status: 'pending' } : errand), groups, matrix, profile: 'shortest' });
  assert.deepEqual(new Set(undone.plan.selectedStops.map(place => place.category)), new Set(['coffee', 'spa']));
});

test('a completed venue is retained when its earlier shortlist is unavailable', () => {
  const place = { placeId: 'node/7', category: 'coffee', latitude: 14.6, longitude: 121 };
  const saved = savedGroupsForRefresh(['coffee', 'spa'], { coffee: 'completed' }, null, [place]);
  assert.deepEqual(saved.coffee, [place]);
  assert.throws(() => savedGroupsForRefresh(['coffee', 'spa'], { coffee: 'skipped' }, null, []), /No saved coffee venues/);
});

test('overlapping OSM categories share one matrix node and can choose distinct venues', () => {
  const origin = { id: 'origin', latitude: 14.6, longitude: 121 };
  const shared = { placeId: 'node/1', latitude: 14.601, longitude: 121 };
  const alternate = { placeId: 'node/2', latitude: 14.602, longitude: 121 };
  const snapshot = { groups: {
    coffee: [{ ...shared, category: 'coffee' }, { ...alternate, category: 'coffee' }],
    restaurant: [{ ...shared, category: 'restaurant' }],
  } };
  const nodes = matrixNodesForGroups(origin, snapshot.groups);
  assert.deepEqual(nodes.map(node => node.id), ['origin', 'node/1', 'node/2']);
  const matrix = approximateMatrix(nodes);
  const groups = groupsForPlanning(snapshot, {}, [], {});
  assert.equal(hasDistinctVenueAssignment(['coffee', 'restaurant'], groups), true);
  const result = optimize({ errands: [{ id: 'coffee', category: 'coffee' }, { id: 'restaurant', category: 'restaurant' }], groups, matrix, profile: 'shortest' });
  assert.ok(result.plan);
  assert.deepEqual(new Set(result.plan.selectedStops.map(place => place.placeId)), new Set(['node/1', 'node/2']));
  const afterCompletion = groupsForPlanning(snapshot, {}, [snapshot.groups.restaurant[0]], { restaurant: 'completed' });
  assert.deepEqual(afterCompletion.coffee.map(place => place.placeId), ['node/2']);
  assert.equal(groupsForPlanning(snapshot, {}, [], {}).coffee.length, 2);
  assert.equal(hasDistinctVenueAssignment(['coffee', 'restaurant'], { coffee: [snapshot.groups.coffee[0]], restaurant: snapshot.groups.restaurant }), false);
});

test('a live route remains available while a new errand awaits its first search', () => {
  const previous = demoSnapshot(['coffee', 'spa']);
  const { errands, unplanned } = errandsInSnapshot(['coffee', 'spa', 'church'], {}, previous, true);
  assert.deepEqual(unplanned, ['church']);
  const current = optimize({ errands, groups: previous.groups, matrix: previous.matrix, profile: 'balanced' });
  assert.ok(current.plan);
  assert.deepEqual(new Set(current.plan.selectedStops.map(place => place.category)), new Set(['coffee', 'spa']));
  assert.equal(errandsInSnapshot(['coffee', 'spa', 'church'], {}, previous, false).unplanned.length, 0);
});
