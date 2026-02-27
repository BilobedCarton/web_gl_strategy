# Trade Network Prototype Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a playable trade network prototype where 3-5 cities on a 75x75 procedural terrain map produce resources from their territory and the player connects them via terrain-costed trade links.

**Architecture:** Pure data-model-first approach. Build game data types (resources, cities, links), then the game engine (placement, production, pathfinding, trade resolution), then wire it into the existing rendering/UI. All game logic is decoupled from rendering.

**Tech Stack:** TypeScript, Vite, WebGL (instanced rendering via existing GridRenderer), 2D Canvas overlay for UI elements (cities, links, territory borders). No new dependencies.

**Design doc:** `docs/plans/2026-02-26-trade-network-prototype-design.md`

---

### Task 1: Resource Type Definitions

**Files:**

- Create: `src/game/resources.ts`

**Step 1: Create the resource module**

```typescript
import { TerrainType, TerrainFeature } from "./terrain";

export enum ResourceType {
  Grain = "grain",
  Fish = "fish",
  Timber = "timber",
  IronOre = "iron_ore",
  Herbs = "herbs",
  Furs = "furs",
}

// Map resource types to their source terrain/feature
export interface ResourceSource {
  terrain?: TerrainType;
  feature?: TerrainFeature;
}

export const ResourceSources: Record<ResourceType, ResourceSource> = {
  [ResourceType.Grain]: { terrain: TerrainType.Plains },
  [ResourceType.Fish]: { terrain: TerrainType.Coast },
  [ResourceType.Timber]: { feature: TerrainFeature.Forest },
  [ResourceType.IronOre]: { feature: TerrainFeature.Mountain },
  [ResourceType.Herbs]: { terrain: TerrainType.Wetlands },
  [ResourceType.Furs]: { terrain: TerrainType.Tundra },
};

// Display names for UI
export const ResourceNames: Record<ResourceType, string> = {
  [ResourceType.Grain]: "Grain",
  [ResourceType.Fish]: "Fish",
  [ResourceType.Timber]: "Timber",
  [ResourceType.IronOre]: "Iron Ore",
  [ResourceType.Herbs]: "Herbs",
  [ResourceType.Furs]: "Furs",
};

// Check if a terrain tile produces a given resource
export function tileProducesResource(
  terrain: TerrainType,
  feature: TerrainFeature | undefined,
  resource: ResourceType,
): boolean {
  const source = ResourceSources[resource];
  if (source.terrain && terrain === source.terrain) return true;
  if (source.feature && feature === source.feature) return true;
  return false;
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds (unused module is fine for now)

**Step 3: Commit**

```bash
git add src/game/resources.ts
git commit -m "feat: add resource type definitions"
```

---

### Task 2: City Data Model

**Files:**

- Create: `src/game/city.ts`

**Step 1: Create the city module**

```typescript
import { ResourceType } from "./resources";

export interface TradeAllocation {
  resource: ResourceType;
  amount: number;
  direction: "a-to-b" | "b-to-a";
}

export interface TradeLink {
  id: string;
  cityA: string; // city id
  cityB: string; // city id
  path: Array<{ x: number; y: number }>; // A* path tiles
  pathCost: number;
  capacity: number; // max goods per turn
  allocations: TradeAllocation[];
}

export interface City {
  id: string;
  name: string;
  position: { x: number; y: number };
  color: [number, number, number, number];
  territoryTiles: Set<string>; // "x,y" keys
  stockpile: Map<ResourceType, number>;
  production: Map<ResourceType, number>; // per-turn output
  receivedResources: Set<ResourceType>; // unique types received via trade
  linkIds: string[];
}

// Distinct city colors
export const CityColors: Array<[number, number, number, number]> = [
  [0.9, 0.2, 0.2, 1.0], // Red
  [0.2, 0.5, 0.9, 1.0], // Blue
  [0.9, 0.7, 0.1, 1.0], // Gold
  [0.2, 0.8, 0.4, 1.0], // Green
  [0.7, 0.3, 0.8, 1.0], // Purple
];

// Fantasy city name pool
export const CityNamePool = [
  "Thornhaven",
  "Mistfall",
  "Ironhollow",
  "Duskport",
  "Ashenmoor",
  "Crystalvale",
  "Stormwatch",
  "Glimmerreach",
  "Frostgate",
  "Windspire",
];

export function createCity(
  id: string,
  name: string,
  x: number,
  y: number,
  color: [number, number, number, number],
): City {
  return {
    id,
    name,
    position: { x, y },
    color,
    territoryTiles: new Set(),
    stockpile: new Map(),
    production: new Map(),
    receivedResources: new Set(),
    linkIds: [],
  };
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/game/city.ts
git commit -m "feat: add city and trade link data models"
```

---

### Task 3: City Placement Algorithm

**Files:**

- Create: `src/game/city-placer.ts`

**Step 1: Create the city placement module**

This module places 3-5 cities on the terrain map with minimum spacing, preferring tiles near rivers and diverse terrain. Uses a seeded PRNG for determinism.

```typescript
import type { TerrainData } from "./procedural-generator";
import { TerrainType, TerrainFeature } from "./terrain";
import { City, CityColors, CityNamePool, createCity } from "./city";
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
      const data = terrainMap.get(`${x},${y}`);
      if (!data) continue;
      const isWater =
        data.terrain === TerrainType.DeepWaters || data.terrain === TerrainType.Shallows;
      if (!isWater) {
        territory.add(`${x},${y}`);
      }
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
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/game/city-placer.ts
git commit -m "feat: add city placement algorithm with territory and production"
```

---

### Task 4: A\* Pathfinding

**Files:**

- Create: `src/game/pathfinding.ts`

**Step 1: Create the pathfinding module**

A\* across the terrain grid with terrain-based movement costs. Water is impassable.

```typescript
import type { TerrainData } from "./procedural-generator";
import { ElevationType } from "./procedural-generator";
import { TerrainType, TerrainFeature } from "./terrain";

// Movement cost per tile based on terrain
function getMovementCost(data: TerrainData): number {
  // Water is impassable
  if (data.terrain === TerrainType.DeepWaters || data.terrain === TerrainType.Shallows) {
    return Infinity;
  }

  // River tiles are cheap
  if (data.terrain === TerrainType.River) return 0.5;

  // Feature-based costs (mountains are expensive, forests moderate)
  if (data.feature === TerrainFeature.Mountain) return 5;
  if (data.feature === TerrainFeature.Forest) return 2;
  if (data.feature === TerrainFeature.Jungle) return 2;
  if (data.feature === TerrainFeature.Marsh) return 3;

  // Terrain-based costs
  if (data.terrain === TerrainType.Wetlands) return 2;
  if (data.terrain === TerrainType.Coast) return 1;

  // Hills cost more
  if (data.elevationType === ElevationType.Hills) return 3;

  // Plains, Desert, Tundra
  return 1;
}

interface PathNode {
  x: number;
  y: number;
  g: number; // cost from start
  f: number; // g + heuristic
  parent: PathNode | null;
}

export interface PathResult {
  path: Array<{ x: number; y: number }>;
  totalCost: number;
}

export function findPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  terrainMap: Map<string, TerrainData>,
  gridWidth: number,
  gridHeight: number,
): PathResult | null {
  const getKey = (x: number, y: number) => `${x},${y}`;
  const heuristic = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY);

  const open: PathNode[] = [
    { x: startX, y: startY, g: 0, f: heuristic(startX, startY), parent: null },
  ];
  const closed = new Set<string>();
  const gScores = new Map<string, number>();
  gScores.set(getKey(startX, startY), 0);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const current = open[bestIdx]!;
    open.splice(bestIdx, 1);

    if (current.x === endX && current.y === endY) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, totalCost: current.g };
    }

    const currentKey = getKey(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

      const neighborKey = getKey(nx, ny);
      if (closed.has(neighborKey)) continue;

      const neighborData = terrainMap.get(neighborKey);
      if (!neighborData) continue;

      const moveCost = getMovementCost(neighborData);
      if (moveCost === Infinity) continue; // Impassable

      const tentativeG = current.g + moveCost;
      const existingG = gScores.get(neighborKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScores.set(neighborKey, tentativeG);
      open.push({
        x: nx,
        y: ny,
        g: tentativeG,
        f: tentativeG + heuristic(nx, ny),
        parent: current,
      });
    }
  }

  return null; // No path found
}

// Compute link capacity from path cost
export function computeLinkCapacity(pathCost: number): number {
  return Math.max(3, Math.floor(20 / pathCost));
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/game/pathfinding.ts
git commit -m "feat: add A* pathfinding with terrain costs"
```

---

### Task 5: Game State & Turn Engine

**Files:**

- Create: `src/game/game-state.ts`

**Step 1: Create the game state module**

Central game state manager: holds cities and links, runs production, resolves trade, tracks turns and scores.

```typescript
import type { TerrainData } from "./procedural-generator";
import type { City, TradeLink, TradeAllocation } from "./city";
import { ResourceType } from "./resources";
import { findPath, computeLinkCapacity } from "./pathfinding";

export class GameState {
  public cities: City[] = [];
  public links: Map<string, TradeLink> = new Map();
  public turn: number = 0;
  public terrainMap: Map<string, TerrainData> = new Map();
  public gridWidth: number = 75;
  public gridHeight: number = 75;

  private nextLinkId = 0;

  // Run the production phase: all cities gain resources from territory
  public runProduction(): void {
    for (const city of this.cities) {
      for (const [resource, amount] of city.production) {
        city.stockpile.set(resource, (city.stockpile.get(resource) ?? 0) + amount);
      }
    }
  }

  // Resolve trade: move goods along links based on allocations
  public resolveTrade(): void {
    for (const link of this.links.values()) {
      let capacityUsed = 0;

      for (const alloc of link.allocations) {
        const remaining = link.capacity - capacityUsed;
        const actual = Math.min(alloc.amount, remaining);
        if (actual <= 0) continue;

        const fromCity =
          alloc.direction === "a-to-b"
            ? this.cities.find((c) => c.id === link.cityA)
            : this.cities.find((c) => c.id === link.cityB);
        const toCity =
          alloc.direction === "a-to-b"
            ? this.cities.find((c) => c.id === link.cityB)
            : this.cities.find((c) => c.id === link.cityA);

        if (!fromCity || !toCity) continue;

        const available = fromCity.stockpile.get(alloc.resource) ?? 0;
        const transferred = Math.min(actual, available);
        if (transferred <= 0) continue;

        fromCity.stockpile.set(alloc.resource, available - transferred);
        toCity.stockpile.set(
          alloc.resource,
          (toCity.stockpile.get(alloc.resource) ?? 0) + transferred,
        );
        toCity.receivedResources.add(alloc.resource);

        capacityUsed += transferred;
      }
    }
  }

  // Advance to next turn
  public endTurn(): void {
    this.resolveTrade();
    this.turn++;
    this.runProduction();
  }

  // Build a trade link between two cities
  public buildLink(cityAId: string, cityBId: string): TradeLink | null {
    const cityA = this.cities.find((c) => c.id === cityAId);
    const cityB = this.cities.find((c) => c.id === cityBId);
    if (!cityA || !cityB) return null;

    // Check link limits (max 3 per city)
    if (cityA.linkIds.length >= 3 || cityB.linkIds.length >= 3) return null;

    // Check construction cost: 10 Timber + 5 Iron Ore from city A
    const timber = cityA.stockpile.get(ResourceType.Timber) ?? 0;
    const iron = cityA.stockpile.get(ResourceType.IronOre) ?? 0;
    if (timber < 10 || iron < 5) return null;

    // Find path
    const pathResult = findPath(
      cityA.position.x,
      cityA.position.y,
      cityB.position.x,
      cityB.position.y,
      this.terrainMap,
      this.gridWidth,
      this.gridHeight,
    );
    if (!pathResult) return null;

    // Deduct construction cost
    cityA.stockpile.set(ResourceType.Timber, timber - 10);
    cityA.stockpile.set(ResourceType.IronOre, iron - 5);

    const linkId = `link-${this.nextLinkId++}`;
    const link: TradeLink = {
      id: linkId,
      cityA: cityAId,
      cityB: cityBId,
      path: pathResult.path,
      pathCost: pathResult.totalCost,
      capacity: computeLinkCapacity(pathResult.totalCost),
      allocations: [],
    };

    this.links.set(linkId, link);
    cityA.linkIds.push(linkId);
    cityB.linkIds.push(linkId);

    return link;
  }

  // Set trade allocation on a link
  public setAllocation(linkId: string, allocations: TradeAllocation[]): void {
    const link = this.links.get(linkId);
    if (!link) return;
    link.allocations = allocations;
  }

  // Get score for a city (count of unique resource types received via trade)
  public getCityScore(cityId: string): number {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city) return 0;
    return city.receivedResources.size;
  }

  // Preview a link (pathfind without building)
  public previewLink(
    cityAId: string,
    cityBId: string,
  ): { path: Array<{ x: number; y: number }>; cost: number; capacity: number } | null {
    const cityA = this.cities.find((c) => c.id === cityAId);
    const cityB = this.cities.find((c) => c.id === cityBId);
    if (!cityA || !cityB) return null;

    const pathResult = findPath(
      cityA.position.x,
      cityA.position.y,
      cityB.position.x,
      cityB.position.y,
      this.terrainMap,
      this.gridWidth,
      this.gridHeight,
    );
    if (!pathResult) return null;

    return {
      path: pathResult.path,
      cost: pathResult.totalCost,
      capacity: computeLinkCapacity(pathResult.totalCost),
    };
  }
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/game/game-state.ts
git commit -m "feat: add game state with production, trade resolution, and link building"
```

---

### Task 6: Update Grid to 75x75 and Wire City Placement into Script

**Files:**

- Modify: `src/script.ts`

**Step 1: Update grid dimensions and integrate city placement**

Change `gridWidth`/`gridHeight` from 50 to 75. After terrain generation, place cities and initialize game state. Update the `GridRenderer` max instances accordingly.

Key changes to `src/script.ts`:

1. Import new modules at the top:

```typescript
import { placeCities } from "./game/city-placer";
import { GameState } from "./game/game-state";
import { ResourceType, ResourceNames } from "./game/resources";
```

2. Update constants (lines 27-29):

```typescript
const gridWidth = 75;
const gridHeight = 75;
```

3. Update GridRenderer max size (line 33):

```typescript
const gridRenderer = new GridRenderer(glContext, gridWidth * gridHeight);
```

4. Add game state variable after `terrainGenerator` declaration:

```typescript
let gameState: GameState;
```

5. At the end of `generateMap()`, after the grid is populated and `updateGridView()` is called, add city placement and game state initialization:

```typescript
// Initialize game state
gameState = new GameState();
gameState.terrainMap = terrainMap;
gameState.gridWidth = gridWidth;
gameState.gridHeight = gridHeight;
gameState.cities = placeCities(terrainMap, gridWidth, gridHeight, terrainGenerator.getSeed());

// Run initial production
gameState.runProduction();

// Log city info
for (const city of gameState.cities) {
  console.log(`\n🏰 ${city.name} at (${city.position.x}, ${city.position.y})`);
  console.log(`   Territory: ${city.territoryTiles.size} tiles`);
  const prodEntries = [...city.production.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`);
  console.log(`   Production: ${prodEntries.join(", ") || "none"}`);
  const stockEntries = [...city.stockpile.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`);
  console.log(`   Stockpile: ${stockEntries.join(", ") || "none"}`);
}
```

6. Update the overlay rendering to show cities and territory borders. In `renderFeatureOverlay()`, after the existing emoji loop, add city rendering:

```typescript
// Render city markers
if (gameState) {
  for (const city of gameState.cities) {
    // Territory border
    overlayCtx.strokeStyle = `rgba(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255}, 0.8)`;
    overlayCtx.lineWidth = 1.5;
    for (const key of city.territoryTiles) {
      const parts = key.split(",");
      const tx = parseInt(parts[0]!, 10);
      const ty = parseInt(parts[1]!, 10);
      const px = tx * cellWidth;
      const py = ty * cellHeight;

      // Draw border only on edges adjacent to non-territory tiles
      const directions = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const;
      for (const [dx, dy] of directions) {
        const neighborKey = `${tx + dx},${ty + dy}`;
        if (!city.territoryTiles.has(neighborKey)) {
          overlayCtx.beginPath();
          if (dx === 0 && dy === -1) {
            overlayCtx.moveTo(px, py);
            overlayCtx.lineTo(px + cellWidth, py);
          }
          if (dx === 1 && dy === 0) {
            overlayCtx.moveTo(px + cellWidth, py);
            overlayCtx.lineTo(px + cellWidth, py + cellHeight);
          }
          if (dx === 0 && dy === 1) {
            overlayCtx.moveTo(px, py + cellHeight);
            overlayCtx.lineTo(px + cellWidth, py + cellHeight);
          }
          if (dx === -1 && dy === 0) {
            overlayCtx.moveTo(px, py);
            overlayCtx.lineTo(px, py + cellHeight);
          }
          overlayCtx.stroke();
        }
      }
    }

    // City marker
    const cx = city.position.x * cellWidth + cellWidth / 2;
    const cy = city.position.y * cellHeight + cellHeight / 2;
    overlayCtx.fillStyle = `rgba(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255}, 1.0)`;
    overlayCtx.beginPath();
    overlayCtx.arc(cx, cy, cellWidth * 1.5, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.strokeStyle = "white";
    overlayCtx.lineWidth = 1;
    overlayCtx.stroke();

    // City name
    const nameFontSize = Math.max(8, Math.floor(cellWidth * 1.2));
    overlayCtx.font = `bold ${nameFontSize}px sans-serif`;
    overlayCtx.fillStyle = "white";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "top";
    overlayCtx.fillText(city.name, cx, cy + cellWidth * 2);
  }
}
```

**Step 2: Verify it compiles and renders**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds. Running `pnpm dev` and opening browser shows 75x75 grid with city markers and territory borders.

**Step 3: Commit**

```bash
git add src/script.ts
git commit -m "feat: wire city placement into 75x75 grid with territory rendering"
```

---

### Task 7: Game UI — Side Panel, Turn Controls, City Detail

**Files:**

- Modify: `index.html`
- Modify: `src/script.ts`

**Step 1: Add game UI elements to index.html**

After the existing `<button id="regenerate">` and info div, add a new game section:

```html
<hr style="border-color: #444; margin: 20px 0" />

<h2>🏰 Game</h2>

<div class="control-group" style="display: flex; gap: 8px; align-items: center">
  <span style="font-size: 14px">Turn: <strong id="turnCounter">1</strong></span>
  <button id="endTurn" style="flex: 1; padding: 8px">End Turn</button>
</div>

<div id="cityList" style="margin-top: 12px"></div>

<div
  id="cityDetail"
  style="display: none; margin-top: 12px; padding: 12px; background: #1a1a1a; border-radius: 4px"
>
  <div style="display: flex; justify-content: space-between; align-items: center">
    <strong id="cityDetailName" style="color: #4a9eff"></strong>
    <span style="font-size: 11px; color: #888" id="cityDetailScore"></span>
  </div>
  <div style="margin-top: 8px; font-size: 12px">
    <div style="color: #b0b0b0; margin-bottom: 4px">Production per turn:</div>
    <div id="cityDetailProduction"></div>
  </div>
  <div style="margin-top: 8px; font-size: 12px">
    <div style="color: #b0b0b0; margin-bottom: 4px">Stockpile:</div>
    <div id="cityDetailStockpile"></div>
  </div>
  <div style="margin-top: 8px; font-size: 12px">
    <div style="color: #b0b0b0; margin-bottom: 4px">Trade Links:</div>
    <div id="cityDetailLinks"></div>
  </div>
  <button id="buildLinkBtn" style="margin-top: 8px; padding: 6px; font-size: 12px">
    Build Trade Link
  </button>
</div>

<div
  id="linkBuildMode"
  style="display: none; margin-top: 12px; padding: 12px; background: #332200; border: 1px solid #664400; border-radius: 4px; font-size: 12px"
>
  <strong style="color: #ffaa00">Building Trade Link</strong>
  <div id="linkBuildStatus" style="margin-top: 4px">Click a destination city...</div>
  <div id="linkBuildPreview" style="margin-top: 4px"></div>
  <div style="margin-top: 8px; display: flex; gap: 4px">
    <button id="linkBuildConfirm" style="flex: 1; padding: 6px; font-size: 12px; display: none">
      Confirm
    </button>
    <button id="linkBuildCancel" style="flex: 1; padding: 6px; font-size: 12px; background: #666">
      Cancel
    </button>
  </div>
</div>

<div
  id="tradePanel"
  style="display: none; margin-top: 12px; padding: 12px; background: #1a1a1a; border-radius: 4px; font-size: 12px"
>
  <strong style="color: #4a9eff" id="tradePanelTitle"></strong>
  <div id="tradePanelContent" style="margin-top: 8px"></div>
</div>
```

**Step 2: Add game UI logic to script.ts**

Add the following functionality after existing event listeners:

- City list rendering: after each turn or map generation, render a clickable list of cities with their scores in the `#cityList` div
- City detail panel: clicking a city (in the list or on the map) populates `#cityDetail` with stockpile, production, and link info
- Click handler update: modify the canvas click handler to detect clicks on city tiles and open the detail panel
- End Turn button: calls `gameState.endTurn()`, updates turn counter and UI
- Build Link mode: clicking "Build Trade Link" enters a mode where the next city click on the map sets the destination, previews the path, and offers confirm/cancel
- Trade allocation: for each active link in the city detail, show dropdowns for resource selection, amount input, and direction toggle

This is the largest task. The key functions to add:

```typescript
// UI element references
const turnCounter = document.getElementById("turnCounter") as HTMLSpanElement;
const endTurnBtn = document.getElementById("endTurn") as HTMLButtonElement;
const cityListDiv = document.getElementById("cityList") as HTMLDivElement;
const cityDetailDiv = document.getElementById("cityDetail") as HTMLDivElement;
const cityDetailName = document.getElementById("cityDetailName") as HTMLElement;
const cityDetailScore = document.getElementById("cityDetailScore") as HTMLSpanElement;
const cityDetailProduction = document.getElementById("cityDetailProduction") as HTMLDivElement;
const cityDetailStockpile = document.getElementById("cityDetailStockpile") as HTMLDivElement;
const cityDetailLinks = document.getElementById("cityDetailLinks") as HTMLDivElement;
const buildLinkBtn = document.getElementById("buildLinkBtn") as HTMLButtonElement;
const linkBuildModeDiv = document.getElementById("linkBuildMode") as HTMLDivElement;
const linkBuildStatus = document.getElementById("linkBuildStatus") as HTMLDivElement;
const linkBuildPreview = document.getElementById("linkBuildPreview") as HTMLDivElement;
const linkBuildConfirm = document.getElementById("linkBuildConfirm") as HTMLButtonElement;
const linkBuildCancel = document.getElementById("linkBuildCancel") as HTMLButtonElement;

let selectedCityId: string | null = null;
let buildLinkSourceId: string | null = null;
let buildLinkTargetId: string | null = null;

function updateCityList(): void {
  /* render city buttons with scores */
}
function showCityDetail(cityId: string): void {
  /* populate detail panel */
}
function updateTradeUI(): void {
  /* update allocation controls for selected city's links */
}
function enterBuildLinkMode(sourceCityId: string): void {
  /* show build link UI */
}
function exitBuildLinkMode(): void {
  /* hide build link UI */
}
function renderTradeLinks(): void {
  /* draw link paths on overlay canvas */
}
```

Each of these functions should be implemented following the patterns in the existing codebase (DOM manipulation, overlay canvas drawing).

**Step 3: End Turn handler**

```typescript
endTurnBtn.addEventListener("click", () => {
  gameState.endTurn();
  turnCounter.textContent = String(gameState.turn + 1);
  updateCityList();
  if (selectedCityId) showCityDetail(selectedCityId);
  renderFeatureOverlay(); // re-render overlay to update link usage
});
```

**Step 4: Updated canvas click handler**

Modify the existing canvas click handler to check if a city is at the clicked grid position:

```typescript
canvas.addEventListener("click", (event: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const gridX = Math.floor(x / cellWidth);
  const gridY = Math.floor(y / cellHeight);

  if (!grid.isInBounds(gridX, gridY)) return;

  // Check if a city is at this position
  const clickedCity = gameState?.cities.find(
    (c) => c.position.x === gridX && c.position.y === gridY,
  );

  if (buildLinkSourceId && clickedCity && clickedCity.id !== buildLinkSourceId) {
    // In build link mode — set target and preview
    buildLinkTargetId = clickedCity.id;
    const preview = gameState.previewLink(buildLinkSourceId, buildLinkTargetId);
    if (preview) {
      linkBuildPreview.textContent = `Cost: ${preview.cost.toFixed(1)} | Capacity: ${preview.capacity}/turn`;
      linkBuildConfirm.style.display = "block";
    } else {
      linkBuildPreview.textContent = "No path found!";
    }
    return;
  }

  if (clickedCity) {
    selectedCityId = clickedCity.id;
    showCityDetail(clickedCity.id);
  } else {
    // Existing terrain info logging
    const currentCell = grid.getCell(gridX, gridY);
    if (currentCell) {
      console.log(
        `Cell (${gridX}, ${gridY}): ${currentCell.terrain}, elev=${currentCell.elevation?.toFixed(3)}`,
      );
    }
  }
});
```

**Step 5: Verify it compiles and the UI works**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Build succeeds. Running `pnpm dev` shows the game panel, cities are clickable, End Turn advances the turn counter.

**Step 6: Commit**

```bash
git add index.html src/script.ts
git commit -m "feat: add game UI with city detail, trade links, and turn controls"
```

---

### Task 8: Trade Link Rendering on Overlay Canvas

**Files:**

- Modify: `src/script.ts`

**Step 1: Add trade link path rendering**

In the `renderFeatureOverlay()` function, after city rendering, draw trade link paths:

```typescript
// Render trade links
if (gameState) {
  for (const link of gameState.links.values()) {
    const cityA = gameState.cities.find((c) => c.id === link.cityA);
    if (!cityA) continue;

    // Draw path
    overlayCtx.strokeStyle = `rgba(${cityA.color[0] * 255}, ${cityA.color[1] * 255}, ${cityA.color[2] * 255}, 0.6)`;
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    for (let i = 0; i < link.path.length; i++) {
      const px = link.path[i]!.x * cellWidth + cellWidth / 2;
      const py = link.path[i]!.y * cellHeight + cellHeight / 2;
      if (i === 0) overlayCtx.moveTo(px, py);
      else overlayCtx.lineTo(px, py);
    }
    overlayCtx.stroke();

    // Capacity label at midpoint
    if (link.path.length > 1) {
      const mid = link.path[Math.floor(link.path.length / 2)]!;
      const mpx = mid.x * cellWidth + cellWidth / 2;
      const mpy = mid.y * cellHeight + cellHeight / 2;
      const used = link.allocations.reduce((sum, a) => sum + a.amount, 0);
      overlayCtx.fillStyle = "white";
      overlayCtx.font = `bold ${Math.max(8, Math.floor(cellWidth))}px sans-serif`;
      overlayCtx.textAlign = "center";
      overlayCtx.textBaseline = "middle";
      overlayCtx.fillText(`${used}/${link.capacity}`, mpx, mpy);
    }
  }
}
```

**Step 2: Verify links render when built**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: After building a link via the UI, the path appears on the map with a capacity label.

**Step 3: Commit**

```bash
git add src/script.ts
git commit -m "feat: render trade link paths on overlay canvas"
```

---

### Task 9: Trade Allocation UI

**Files:**

- Modify: `src/script.ts`

**Step 1: Implement trade allocation controls**

In the `showCityDetail` function, for each active link, render allocation controls:

- A dropdown to select which resource to send
- A number input for amount (max = min(link capacity, stockpile))
- A direction toggle (A->B or B->A)
- An "Apply" action that calls `gameState.setAllocation()`

This builds on the `#cityDetailLinks` div and `#tradePanel` div from Task 7.

```typescript
function showCityDetail(cityId: string): void {
  const city = gameState.cities.find((c) => c.id === cityId);
  if (!city) return;

  cityDetailDiv.style.display = "block";
  cityDetailName.textContent = city.name;
  cityDetailName.style.color = `rgb(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255})`;
  cityDetailScore.textContent = `Score: ${gameState.getCityScore(cityId)}/6`;

  // Production
  const prodHtml =
    [...city.production.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`)
      .join("<br>") || "None";
  cityDetailProduction.innerHTML = prodHtml;

  // Stockpile
  const stockHtml =
    Object.values(ResourceType)
      .map((r) => {
        const amount = city.stockpile.get(r) ?? 0;
        return amount > 0 ? `${ResourceNames[r]}: ${amount}` : null;
      })
      .filter(Boolean)
      .join("<br>") || "Empty";
  cityDetailStockpile.innerHTML = stockHtml;

  // Links with allocation controls
  let linksHtml = "";
  for (const linkId of city.linkIds) {
    const link = gameState.links.get(linkId);
    if (!link) continue;
    const otherCityId = link.cityA === cityId ? link.cityB : link.cityA;
    const otherCity = gameState.cities.find((c) => c.id === otherCityId);
    if (!otherCity) continue;

    const direction = link.cityA === cityId ? "a-to-b" : "b-to-a";
    const used = link.allocations.reduce((sum, a) => sum + a.amount, 0);

    linksHtml += `
      <div style="margin-bottom: 8px; padding: 6px; background: #222; border-radius: 3px">
        <div>→ ${otherCity.name} (${used}/${link.capacity})</div>
        <div style="margin-top: 4px; display: flex; gap: 4px; align-items: center">
          <select data-link-id="${linkId}" data-direction="${direction}" class="trade-resource" style="flex: 1; padding: 2px; font-size: 11px">
            ${Object.values(ResourceType)
              .map((r) => `<option value="${r}">${ResourceNames[r]}</option>`)
              .join("")}
          </select>
          <input type="number" class="trade-amount" data-link-id="${linkId}" min="0" max="${link.capacity}" value="0" style="width: 40px; padding: 2px; font-size: 11px">
          <button class="trade-apply" data-link-id="${linkId}" data-direction="${direction}" style="padding: 2px 6px; font-size: 11px">Set</button>
        </div>
      </div>
    `;
  }
  cityDetailLinks.innerHTML = linksHtml || "No links";

  // Attach event listeners to "Set" buttons
  cityDetailLinks.querySelectorAll(".trade-apply").forEach((btn) => {
    btn.addEventListener("click", () => {
      const linkId = (btn as HTMLElement).dataset.linkId!;
      const direction = (btn as HTMLElement).dataset.direction! as "a-to-b" | "b-to-a";
      const container = btn.parentElement!;
      const resourceSelect = container.querySelector(".trade-resource") as HTMLSelectElement;
      const amountInput = container.querySelector(".trade-amount") as HTMLInputElement;

      const resource = resourceSelect.value as ResourceType;
      const amount = parseInt(amountInput.value) || 0;

      gameState.setAllocation(linkId, [{ resource, amount, direction }]);
      showCityDetail(cityId); // refresh
      renderFeatureOverlay(); // update link labels
    });
  });

  // Show/hide build link button based on link count
  buildLinkBtn.style.display = city.linkIds.length < 3 ? "block" : "none";
}
```

**Step 2: Verify allocations work end-to-end**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Can set trade allocations on links, click End Turn, and see goods move between city stockpiles.

**Step 3: Commit**

```bash
git add src/script.ts
git commit -m "feat: add trade allocation UI with per-link resource and amount controls"
```

---

### Task 10: Lint, Clean Up, and Final Verification

**Files:**

- Modify: `src/script.ts` (as needed for lint fixes)

**Step 1: Run linter**

Run: `eval "$(mise activate bash)" && pnpm run lint`
Expected: Fix any lint errors.

**Step 2: Run formatter**

Run: `eval "$(mise activate bash)" && pnpm run fmt`

**Step 3: Full build verification**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build with no errors.

**Step 4: Manual playtest checklist**

Open `pnpm dev` and verify:

- [ ] 75x75 grid renders correctly
- [ ] 4 cities placed with visible territory borders
- [ ] Each city shows production and stockpile in detail panel
- [ ] Clicking cities on map opens detail panel
- [ ] End Turn advances turn counter and adds production to stockpiles
- [ ] Can build trade links between cities (costs 10 Timber + 5 Iron Ore)
- [ ] Trade link paths visible on map with capacity labels
- [ ] Can set trade allocations and see goods transfer on End Turn
- [ ] City scores update when receiving new resource types
- [ ] Terrain controls (seed, map type, etc.) still work and regenerate everything

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint, format, and verify trade network prototype"
```
