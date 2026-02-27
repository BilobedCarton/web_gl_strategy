import type { TerrainData } from "./procedural-generator";
import { TerrainType, TerrainFeature } from "./terrain";
import { type City, CityColors, CityNamePool, createCity } from "./city";
import { ResourceType, tileProducesResource } from "./resources";

const MIN_CITY_DISTANCE = 15;
const TERRITORY_RADIUS = 8;
const CITY_COUNT = 4;

// Simple seeded PRNG (same LCG as PerlinNoise)
function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Score a tile for city placement suitability
function scoreTile(
  x: number,
  y: number,
  terrainMap: Map<string, TerrainData>,
  gridWidth: number,
  gridHeight: number,
): number {
  const data = terrainMap.get(`${x},${y}`);
  if (!data) return -1;

  // Disqualify water, coast, and mountain-feature tiles
  const isWater = data.terrain === TerrainType.DeepWaters || data.terrain === TerrainType.Shallows;
  if (isWater || data.terrain === TerrainType.Coast) return -1;
  if (data.feature === TerrainFeature.Mountain) return -1;

  let score = 0;

  // Prefer flat, moderate elevation
  if (data.elevation < 0.7) score += 2;

  // Count unique terrain types and features in a radius of 5
  const terrainTypes = new Set<string>();
  let hasRiver = false;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
      const neighbor = terrainMap.get(`${nx},${ny}`);
      if (!neighbor) continue;
      terrainTypes.add(neighbor.terrain);
      if (neighbor.feature) terrainTypes.add(neighbor.feature);
      if (neighbor.terrain === TerrainType.River) hasRiver = true;
    }
  }

  score += terrainTypes.size; // More diverse = better
  if (hasRiver) score += 5; // River adjacency bonus

  return score;
}

// Compute territory for a city: all land tiles within radius
function computeTerritory(
  cx: number,
  cy: number,
  radius: number,
  terrainMap: Map<string, TerrainData>,
  gridWidth: number,
  gridHeight: number,
): Set<string> {
  const territory = new Set<string>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue; // circular radius
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
      if (!terrainMap.has(`${x},${y}`)) continue;
      territory.add(`${x},${y}`);
    }
  }
  return territory;
}

// Compute per-turn production from territory tiles
function computeProduction(
  territory: Set<string>,
  terrainMap: Map<string, TerrainData>,
): Map<ResourceType, number> {
  const production = new Map<ResourceType, number>();
  for (const key of territory) {
    const data = terrainMap.get(key);
    if (!data) continue;
    for (const resource of Object.values(ResourceType)) {
      if (tileProducesResource(data.terrain, data.feature, resource)) {
        production.set(resource, (production.get(resource) ?? 0) + 1);
      }
    }
  }
  return production;
}

export function placeCities(
  terrainMap: Map<string, TerrainData>,
  gridWidth: number,
  gridHeight: number,
  seed: number,
): City[] {
  const rng = createSeededRng(seed + 5000);

  // Score all valid tiles
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = TERRITORY_RADIUS; y < gridHeight - TERRITORY_RADIUS; y++) {
    for (let x = TERRITORY_RADIUS; x < gridWidth - TERRITORY_RADIUS; x++) {
      const score = scoreTile(x, y, terrainMap, gridWidth, gridHeight);
      if (score > 0) {
        candidates.push({ x, y, score });
      }
    }
  }

  // Sort by score descending, then shuffle top candidates for variety
  candidates.sort((a, b) => b.score - a.score);
  // Take top 30% and shuffle them
  const topCount = Math.max(20, Math.floor(candidates.length * 0.3));
  const topCandidates = candidates.slice(0, topCount);
  for (let i = topCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [topCandidates[i], topCandidates[j]] = [topCandidates[j]!, topCandidates[i]!];
  }

  // Greedily pick cities with minimum distance
  const placed: Array<{ x: number; y: number }> = [];
  const cities: City[] = [];

  // Shuffle name pool
  const names = [...CityNamePool];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j]!, names[i]!];
  }

  for (const candidate of topCandidates) {
    if (cities.length >= CITY_COUNT) break;

    // Check minimum distance to all placed cities
    const tooClose = placed.some((p) => {
      const dist = Math.sqrt((p.x - candidate.x) ** 2 + (p.y - candidate.y) ** 2);
      return dist < MIN_CITY_DISTANCE;
    });
    if (tooClose) continue;

    const cityIndex = cities.length;
    const city = createCity(
      `city-${cityIndex}`,
      names[cityIndex]!,
      candidate.x,
      candidate.y,
      CityColors[cityIndex]!,
    );

    // Compute territory and production
    city.territoryTiles = computeTerritory(
      candidate.x,
      candidate.y,
      TERRITORY_RADIUS,
      terrainMap,
      gridWidth,
      gridHeight,
    );
    city.production = computeProduction(city.territoryTiles, terrainMap);

    cities.push(city);
    placed.push({ x: candidate.x, y: candidate.y });
  }

  return cities;
}
