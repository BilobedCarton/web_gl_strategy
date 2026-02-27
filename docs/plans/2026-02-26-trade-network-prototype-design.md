# Trade Network Prototype Design

## Goal

Validate that connecting cities through terrain-costed trade links to move terrain-produced resources feels like an interesting logistics puzzle. This is the riskiest assumption in the game design — if the network isn't fun, the game doesn't work.

## Approach: Trade + Minimal Production (Approach B)

Cities produce raw resources based on terrain. Trade exists to move surplus to cities that lack them. No production chains, no AI opponents, no diplomacy, no military. The player controls all cities and manages the entire trade network.

---

## System 1: City Placement & Territory

**Placement algorithm:**

- After terrain generates on a 75x75 grid, place 3-5 cities on valid land tiles
- Valid tiles: not water, not coast, not mountain feature
- Prefer tiles near rivers or with diverse neighboring terrain types
- Minimum spacing: ~15 tiles between any two cities
- Deterministic from seed (use terrain generator's seed to place cities consistently)

**Territory:**

- Each city controls a radius of ~8-10 tiles around it
- Territory is all land tiles within the radius (water tiles excluded)
- Rendered as a thin colored border around the territory boundary on the 2D overlay canvas
- Each city has a distinct color

**City data model:**

```
City {
  name: string
  position: { x: number, y: number }
  color: [r, g, b, a]
  territoryTiles: Set<string>        // "x,y" keys
  stockpile: Map<ResourceType, number>
  links: TradeLink[]
  score: number                       // unique resource types received via trade
}
```

---

## System 2: Terrain-Driven Resource Production

**6 resource types mapped to terrain/features:**

| Resource | Source Terrain/Feature | Notes                         |
| -------- | ---------------------- | ----------------------------- |
| Grain    | Plains                 | Most common, widely available |
| Fish     | Coast, Shallows        | Coastal cities only           |
| Timber   | Forest (feature)       | Requires forest tiles         |
| Iron Ore | Mountain (feature)     | Requires mountain tiles       |
| Herbs    | Wetlands               | Niche, not all maps have them |
| Furs     | Tundra                 | Cold regions only             |

**Production rules:**

- Each turn, a city produces 1 unit per matching territory tile
- Example: city with 12 Plains tiles produces 12 Grain per turn
- Resources accumulate in stockpiles with no cap
- No consumption — everything produced is available for trade

**Design intent:** Terrain placement directly determines what each city can and can't produce, making trade necessary rather than optional.

---

## System 3: Trade Network & Links

**Building links:**

- Player selects source city, then destination city
- System pathfinds between them using A\* across the terrain grid
- Path cost computed from tiles traversed:
  - Plains/Desert/Tundra: cost 1
  - Forest/Wetlands: cost 2
  - Hills: cost 3
  - Mountains: cost 5
  - River: cost 0.5
  - Water: impassable (no sea routes in prototype)
- Path rendered as a line on the overlay canvas
- Building a link costs resources: 10 Timber + 5 Iron Ore (from source city's stockpile)
- Max 3 links per city

**Link capacity:**

- Each link has a capacity (max goods per turn)
- Base capacity: inversely related to path cost
  - Short/easy routes: ~8 units/turn
  - Long/hard routes: ~3 units/turn
  - Formula: `capacity = max(3, floor(20 / pathCost))` (tunable)

**Goods allocation:**

- During the trade phase, per active link, the player picks:
  - Which resource to send
  - How many units (up to link capacity and available stockpile)
  - Direction (A->B or B->A)
- Goods arrive instantly (no travel time)

**Demand signals:**

- Each city displays what resources it does NOT produce locally
- UI highlights trade opportunities: "City B needs Iron Ore, City A has 45 surplus"

**Constraints:**

- Max 3 links per city (forces network topology choices)
- Link construction cost (Timber + Iron Ore) means you need basic production before you can trade
- Capacity limits mean you can't dump everything through one link

---

## System 4: Turn Structure

**Two phases per turn:**

1. **Production** — automatic. All cities gain resources from territory.
2. **Trade** — player allocates goods across links, optionally builds new links.

**Player flow:**

1. Turn starts, production resolves, stockpiles update
2. Player reviews city stockpiles and demand
3. Player sets trade allocations on each link
4. Player optionally builds new links
5. Player clicks "End Turn"
6. Trade resolves, goods move, scores update
7. Next turn

**Scoring:**

- Each city earns points for unique resource types received via trade
- Score displayed per city and as a total across all cities
- Prototype win: first city to collect all 6 resource types, or open-ended observation

**No AI, no seasons, no events** — pure player-driven logistics puzzle.

---

## System 5: Rendering & UI

**Grid changes:**

- Resize to 75x75 (5,625 cells, within renderer's 10k limit)
- Recalculate cell sizes from canvas dimensions

**Map overlays (2D canvas):**

- City markers: colored circle or castle emoji with city name
- Territory: thin colored border around each city's territory boundary
- Trade links: lines following A\* path between cities, color-coded, showing capacity usage (e.g., "3/5")
- Feature emojis: existing system, unchanged

**Side panel:**

- Existing terrain controls (seed, map type, latitude, sea level, moisture) stay for map generation
- New game section below:
  - Turn counter + "End Turn" button
  - City list with scores
  - City detail panel (opened by clicking city on map or in list):
    - Stockpile table (resource name + quantity)
    - Active links list (destination, capacity, current allocation)
    - "Build Link" button (enters link-building mode)
  - Link building mode: click source city, click destination, preview path + cost, confirm/cancel

**Click behavior:**

- Click on a city tile: open city detail panel
- Click on a non-city tile: show terrain info (existing behavior, keep in console)

---

## What This Prototype Does NOT Include

- Production chains (no processing raw resources)
- AI opponents (player controls all cities)
- Diplomacy or deals
- Military or espionage
- Seasonal modifiers
- Random events
- Sea trade routes
- Link capacity upgrades
- Resource consumption or population
- Victory threshold (just scoring for observation)

---

## Success Criteria

The prototype succeeds if:

1. Cities naturally specialize based on terrain — no two cities produce the same mix
2. Trade feels necessary — cities can't thrive without links
3. Network topology matters — where you build links and which cities you connect creates meaningful choices
4. Terrain costs create interesting tradeoffs — the cheapest route isn't always the best
5. The player wants to keep building and optimizing the network
