/** Entirely fictional venues and simulated, directional travel data. No network calls. */
export const DEMO_ORIGIN = { id: 'origin', latitude: 14.5995, longitude: 120.9842, label: 'Sample starting point' };

const raw = {
  coffee: [['Juniper Cup', 14.6010, 120.9862, 3.1, 45], ['Cobalt Coffee Room', 14.6150, 121.0050, 4.9, 310]],
  groceries: [['Lantern Market', 14.6025, 120.9900, 3.0, 62], ['Cedar & Stone Grocer', 14.6200, 121.0140, 4.9, 260]],
  church: [['Willow Chapel', 14.6060, 120.9920, 3.2, 38], ['Harborlight Church', 14.6260, 121.0190, 4.9, 390]],
  spa: [['Moss Day Spa', 14.6080, 120.9960, 3.1, 70], ['Orchid Hour Spa', 14.6310, 121.0230, 4.9, 220]],
  pharmacy: [['Pebble Pharmacy', 14.6100, 120.9970, 3.2, 52], ['Amber Remedy', 14.6340, 121.0270, 4.8, 175]],
  restaurant: [['Bramble Kitchen', 14.6120, 120.9990, 3.1, 80], ['Northbank Table', 14.6380, 121.0300, 4.9, 340]],
};

export const DEMO_GROUPS = Object.fromEntries(Object.entries(raw).map(([category, entries]) => [category, entries.map(([name, latitude, longitude, rating, userRatingCount], index) => ({
  placeId: `demo-${category}-${index + 1}`, name, category, latitude, longitude,
  address: 'Fictional demo venue', rating, userRatingCount, dataSource: 'demo',
}))]));

export function createDemoMatrix(groups = DEMO_GROUPS, scenario = 'standard') {
  const places = Object.values(groups).flat();
  const nodes = [DEMO_ORIGIN, ...places.map(place => ({ id: place.placeId, latitude: place.latitude, longitude: place.longitude }))];
  const tier = node => node.id === 'origin' ? 0 : Number(node.id.endsWith('-2'));
  const ordinal = node => nodes.findIndex(n => n.id === node.id);
  const durationSec = nodes.map(from => nodes.map(to => {
    if (from.id === to.id) return 0;
    const a = tier(from), b = tier(to);
    const base = a === 0 ? (b ? 900 : 260) : a === b ? (a ? 480 : 220) : 850;
    return base + Math.abs(ordinal(from) - ordinal(to)) * 24 + (ordinal(from) > ordinal(to) ? 130 : 0);
  }));
  const distanceMeters = durationSec.map(row => row.map(sec => Math.round(sec * 7.5)));
  if (scenario === 'bottleneck') {
    const coffee = nodes.findIndex(node => node.id === 'demo-coffee-1');
    const groceries = nodes.findIndex(node => node.id === 'demo-groceries-1');
    if (coffee > 0 && groceries > 0) {
      durationSec[coffee][groceries] = 2500;
      distanceMeters[coffee][groceries] = 11500;
      durationSec[groceries][coffee] = 120;
      distanceMeters[groceries][coffee] = 700;
    }
  }
  return { nodes, durationSec, distanceMeters, fetchedAt: new Date().toISOString(), trafficMode: 'SIMULATED', dataSource: 'demo' };
}

export function demoSnapshot(categories = ['coffee', 'groceries', 'church', 'spa'], scenario = 'standard') {
  const groups = Object.fromEntries(categories.map(category => [category, DEMO_GROUPS[category]]));
  return { origin: DEMO_ORIGIN, groups, matrix: createDemoMatrix(groups, scenario), dataSource: 'demo', scenario };
}
