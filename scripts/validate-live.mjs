import "dotenv/config";
import { optimize } from "../client/src/agent/optimizer.js";
import { googleMapsUrl } from "../client/src/agent/googleMapsUrl.js";

const categories = ["coffee", "groceries", "church", "spa"];
const approved = process.argv.includes("--confirm-billable");
const originArgument = process.argv.find((argument) =>
  argument.startsWith("--origin="),
);
const coordinateText = originArgument
  ? originArgument.slice("--origin=".length)
  : "14.5995,120.9842";
const coordinates = coordinateText.split(",").map(Number);

if (!approved) {
  console.error(
    "Live validation makes potentially billable Google requests. Re-run with --confirm-billable after explicit authorization.",
  );
  process.exitCode = 2;
} else if (!process.env.GOOGLE_MAPS_SERVER_KEY) {
  console.error(
    "Configure GOOGLE_MAPS_SERVER_KEY in the root .env before live validation.",
  );
  process.exitCode = 2;
} else if (
  coordinates.length !== 2 ||
  !Number.isFinite(coordinates[0]) ||
  !Number.isFinite(coordinates[1]) ||
  Math.abs(coordinates[0]) > 90 ||
  Math.abs(coordinates[1]) > 180
) {
  console.error(
    "Use --origin=latitude,longitude with valid numeric coordinates.",
  );
  process.exitCode = 2;
} else {
  const origin = {
    id: "origin",
    latitude: coordinates[0],
    longitude: coordinates[1],
  };
  process.env.NODE_ENV = "test"; // Import the Express app without its normal listener.
  const { app } = await import("../server/index.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  let requestsMade = 0;
  async function post(path, body) {
    requestsMade++;
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `${path}: ${data.error?.code || "ERROR"} — ${data.error?.message || "Request failed"}`,
      );
    return data;
  }

  try {
    const groups = {};
    const seen = new Set();
    for (const category of categories) {
      const data = await post("/api/places", {
        origin,
        category,
        radiusMeters: 4000,
      });
      if (
        data.dataSource !== "google" ||
        !Array.isArray(data.places) ||
        data.places.some((place) => place.dataSource !== "google")
      )
        throw new Error(`Unverified place source for ${category}`);
      groups[category] = data.places.filter(
        (place) => !seen.has(place.placeId),
      );
      groups[category].forEach((place) => seen.add(place.placeId));
      if (!groups[category].length)
        throw new Error(`No distinct ${category} venues returned within 4 km`);
    }

    const nodes = [
      origin,
      ...Object.values(groups)
        .flat()
        .map((place) => ({
          id: place.placeId,
          latitude: place.latitude,
          longitude: place.longitude,
        })),
    ];
    const matrix = await post("/api/matrix", { nodes, mode: "DRIVE" });
    if (matrix.dataSource !== "google" || matrix.nodes?.length !== nodes.length)
      throw new Error("Unverified route matrix source or node count");

    const errands = categories.map((category) => ({
      id: category,
      category,
      status: "pending",
    }));
    const profiles = Object.fromEntries(
      ["fastest", "balanced", "best-rated"].map((profile) => [
        profile,
        optimize({ errands, groups, matrix, profile }),
      ]),
    );
    const result = profiles.balanced;
    if (!result.plan)
      throw new Error(`No feasible complete route: ${result.reason}`);

    const url = googleMapsUrl(origin, result.plan.selectedStops);
    const parsed = new URL(url);
    const stopIds = result.plan.selectedStops.map((stop) => stop.placeId);
    if (
      parsed.searchParams.get("destination_place_id") !== stopIds.at(-1) ||
      parsed.searchParams.get("waypoint_place_ids") !==
        stopIds.slice(0, -1).join("|")
    )
      throw new Error(
        "Maps URL place ID order does not match the selected itinerary",
      );

    console.log(
      JSON.stringify(
        {
          dataSource: "google",
          trafficMode: matrix.trafficMode,
          fetchedAt: matrix.fetchedAt,
          origin,
          requestsMade,
          matrixElements: nodes.length ** 2,
          candidatesByCategory: Object.fromEntries(
            categories.map((category) => [
              category,
              groups[category].map((place) => ({
                name: place.name,
                placeId: place.placeId,
              })),
            ]),
          ),
          enumerated: result.enumerated,
          feasible: result.feasible,
          selectedOrder: result.plan.selectedStops.map((stop) => ({
            category: stop.category,
            name: stop.name,
            placeId: stop.placeId,
          })),
          selectedDurationSec: result.plan.travelDurationSec,
          selectedUtility: result.plan.utility,
          greedyDurationSec: result.baseline?.travelDurationSec ?? null,
          greedyUtility: result.baseline?.utility ?? null,
          profileChoices: Object.fromEntries(
            Object.entries(profiles).map(([profile, entry]) => [
              profile,
              entry.plan?.selectedStops.map((stop) => stop.placeId) ?? null,
            ]),
          ),
          mapsUrl: url,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `Live validation stopped after ${requestsMade} local API request(s): ${error.message}`,
    );
    process.exitCode = 1;
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
