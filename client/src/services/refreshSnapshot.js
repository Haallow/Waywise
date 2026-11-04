/** Retain venues needed for completed and skipped errands across a live refresh. */
export function savedGroupsForRefresh(categories, statuses, snapshot, completed) {
  const groups = {};
  for (const category of categories.filter(category => statuses[category] && statuses[category] !== 'pending')) {
    const previous = snapshot?.groups[category] || [];
    const completedPlace = completed.find(place => place.category === category);
    const carried = previous.length ? previous : completedPlace ? [completedPlace] : [];
    if (!carried.length) throw new Error(`No saved ${category} venues are available. Start another trip.`);
    groups[category] = carried;
  }
  return groups;
}

/** Reuse a shared venue across categories only until it has actually been visited. */
export function groupsForPlanning(snapshot, overrides, completed, statuses) {
  if (!snapshot) return {};
  const visited = new Set(completed.map(place => place.placeId));
  return Object.fromEntries(Object.entries(snapshot.groups).map(([category, group]) => [category, group.filter(place =>
    (statuses[category] === 'completed' || !visited.has(place.placeId)) &&
    (!overrides[category] || place.placeId === overrides[category]))]));
}

/** One directional matrix node per OSM venue, even when it matches two categories. */
export function matrixNodesForGroups(origin, groups) {
  const venues = new Map(Object.values(groups).flat().map(place => [place.placeId, place]));
  return [{ id: 'origin', latitude: origin.latitude, longitude: origin.longitude },
    ...[...venues.values()].map(place => ({ id: place.placeId, latitude: place.latitude, longitude: place.longitude }))];
}

/** Avoid a matrix request when overlapping shortlists cannot cover every errand. */
export function hasDistinctVenueAssignment(categories, groups) {
  const search = (index, used) => {
    if (index === categories.length) return true;
    return (groups[categories[index]] || []).some(place => {
      if (used.has(place.placeId)) return false;
      used.add(place.placeId);
      const possible = search(index + 1, used);
      used.delete(place.placeId);
      return possible;
    });
  };
  return search(0, new Set());
}

/** Keep the current route usable while a newly added live errand awaits discovery. */
export function errandsInSnapshot(categories, statuses, snapshot, live) {
  const unplanned = live ? categories.filter(category =>
    (!statuses[category] || statuses[category] === 'pending') && !snapshot.groups[category]?.length) : [];
  const errands = categories.filter(category => !unplanned.includes(category)).map(category =>
    ({ id: category, category, status: statuses[category] || 'pending' }));
  return { errands, unplanned };
}
