# Production Chains & Food Economy — Design

**Goal:** Add crafting recipes, food consumption, and wealth-based scoring to transform the trade prototype into a game with meaningful economic pressure.

**Approach:** Recipes as pure data (Approach A). No buildings, no workers — just a per-city crafting queue that consumes stockpile inputs and produces outputs each turn.

---

## 1. Recipe Data Model

4 one-step recipes defined as static data in a new `src/game/recipes.ts` file.

| Recipe    | Inputs                | Outputs          | Notes                                   |
| --------- | --------------------- | ---------------- | --------------------------------------- |
| Bread     | 2 Grain + 1 Fish      | 3 Bread          | Food — consumed each turn               |
| Tools     | 2 Iron Ore + 1 Timber | 2 Tools          | Consumed 1/turn for +25% raw production |
| Potions   | 2 Herbs + 1 Grain     | 2 Potions        | High trade value for scoring            |
| Livestock | 2 Grain + 1 Furs      | 2 Bread + 1 Furs | Food source; furs recycled as catalyst  |

New resource types added to `ResourceType` enum: `Bread`, `Tools`, `Potions`. No terrain produces these — they're crafted only.

Recipe interface supports multiple output types:

```typescript
interface Recipe {
  id: string;
  name: string;
  inputs: Map<ResourceType, number>;
  outputs: Map<ResourceType, number>;
}
```

All 4 recipes live in a `RECIPES` array exported from `src/game/recipes.ts`.

---

## 2. Build Queue & Crafting Mechanics

Each city gets a single **crafting slot** — a recipe id (or null for idle).

- If a recipe is queued and the city has all required inputs in stockpile, consume the inputs and produce the outputs immediately (same turn)
- One recipe per turn per city — this is the core strategic choice
- The queue persists across turns until the player changes it

**City interface addition:**

```typescript
craftingQueue: string | null; // recipe id, or null if idle
foodStatus: "fed" | "underfed" | "starving";
```

**Tools production boost:** During raw production, if a city has Tools in stockpile (>= 1), consume 1 Tools and apply +25% to all raw resource output that turn (rounded down). No Tools = no boost. Requires a steady supply chain to maintain.

---

## 3. Food Consumption

Each city consumes food at the end of the turn.

**Food resources:** Bread and Fish both count as food. The city eats from Bread first (processed/efficient), then Fish as fallback.

**Consumption rate:** Fixed at 3 food per turn per city.

**Hunger states:**

| State    | Condition          | Effect on Next Turn          |
| -------- | ------------------ | ---------------------------- |
| Fed      | >= 3 food consumed | Normal production            |
| Underfed | 1-2 food consumed  | Raw production halved        |
| Starving | 0 food consumed    | Raw production drops to zero |

**Trade pressure created:** Plains/Coast cities produce food but lack iron/herbs. Mountain/Wetland/Tundra cities produce valuable raw goods but need food imports to survive. Every city must grow food or trade for it.

---

## 4. Turn Phase Order

Updated from the prototype's 2-phase system to 4 phases:

1. **Raw production** — Terrain resources added to stockpile. +25% if 1 Tools consumed. Halved if underfed, zeroed if starving.
2. **Trade resolution** — Goods move along links based on allocations (unchanged from prototype).
3. **Crafting** — Consume recipe inputs from stockpile, produce outputs. Happens after trade so imported goods can be used same turn.
4. **Food consumption** — Eat 3 food from stockpile (Bread first, then Fish). Set fed status for next turn.

---

## 5. Scoring

**Score = Wealth = total value of crafted goods in stockpile across all cities.**

| Resource      | Value | Rationale                               |
| ------------- | ----- | --------------------------------------- |
| Bread         | 1     | Common, essential, consumed every turn  |
| Tools         | 3     | Requires iron + timber, consumed on use |
| Potions       | 5     | Requires herbs + grain, pure trade good |
| Raw resources | 0     | No score value                          |

The existing `receivedResources` (Set of unique types) on the City interface is removed — it was only used for the old scoring.

---

## 6. UI Changes

**City detail panel additions:**

- **Food status indicator** — "Fed" / "Underfed" / "Starving" with green/yellow/red color next to city name
- **Crafting section** — Dropdown to select a recipe (or "None"), showing input requirements and whether the city can afford it
- **Stockpile display** — Updated to show crafted goods alongside raw resources

**Turn log:** After each End Turn, a brief summary appears showing what happened: "Produced 5 Grain, 3 Timber. Crafted 3 Bread. Consumed 3 food (Fed)."

**No new HTML structure needed** — existing city detail divs accommodate crafting dropdown and food status. Turn log goes in a new div after the turn counter.

---

## Files Changed

- **Modify:** `src/game/resources.ts` — Add `Bread`, `Tools`, `Potions` to enum and names
- **Create:** `src/game/recipes.ts` — Recipe interface and RECIPES array
- **Modify:** `src/game/city.ts` — Add `craftingQueue` and `foodStatus` to City interface
- **Modify:** `src/game/game-state.ts` — New turn phases (crafting, food consumption, tools boost), updated scoring
- **Modify:** `src/script.ts` — Crafting UI, food status display, turn log, updated stockpile rendering
- **Modify:** `index.html` — Turn log div, crafting section in city detail
