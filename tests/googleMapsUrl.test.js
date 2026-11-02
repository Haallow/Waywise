import test from 'node:test';
import assert from 'node:assert/strict';
import { googleMapsUrl } from '../client/src/agent/googleMapsUrl.js';
import { optimize } from '../client/src/agent/optimizer.js';
import { demoSnapshot } from '../client/src/services/demoData.js';

test('navigation preserves four ordered stops and encodes place IDs', () => {
  const origin = { latitude: 14.1, longitude: 121.1 };
  const stops = [1, 2, 3, 4].map(n => ({ latitude: 14 + n / 100, longitude: 121 + n / 100, placeId: `id-${n}`, dataSource: 'google' }));
  const url = new URL(googleMapsUrl(origin, stops));
  assert.equal(url.searchParams.get('origin'), '14.1,121.1');
  assert.equal(url.searchParams.get('waypoints'), '14.01,121.01|14.02,121.02|14.03,121.03');
  assert.equal(url.searchParams.get('destination'), '14.04,121.04');
  assert.equal(url.searchParams.get('waypoint_place_ids'), 'id-1|id-2|id-3');
  assert.equal(url.searchParams.get('destination_place_id'), 'id-4');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.ok(googleMapsUrl(origin, stops).includes('%7C'));
});

test('synthetic stops do not claim Google place IDs', () => {
  const url = new URL(googleMapsUrl({ latitude: 1, longitude: 2 }, [{ latitude: 3, longitude: 4, placeId: 'demo-a', dataSource: 'demo' }]));
  assert.equal(url.searchParams.get('destination_place_id'), null);
});

test('skipped church is absent from the outgoing ordered route', () => {
  const categories = ['coffee', 'groceries', 'church', 'spa'];
  const snapshot = demoSnapshot(categories);
  const result = optimize({
    errands: categories.map(category => ({ id: category, category, status: category === 'church' ? 'skipped' : 'pending' })),
    groups: snapshot.groups, matrix: snapshot.matrix, profile: 'balanced',
  });
  assert.equal(result.plan.selectedStops.length, 3);
  assert.ok(result.plan.selectedStops.every(stop => stop.category !== 'church'));
  const url = new URL(googleMapsUrl(snapshot.origin, result.plan.selectedStops));
  const actualStops = [...(url.searchParams.get('waypoints') || '').split('|'), url.searchParams.get('destination')];
  assert.deepEqual(actualStops, result.plan.selectedStops.map(stop => `${stop.latitude},${stop.longitude}`));
});
