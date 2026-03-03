# Production Chains & Food Economy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add crafting recipes, food consumption, and wealth-based scoring so cities must trade to survive and craft valuable goods to win.

**Architecture:** Pure-data recipes in a new `recipes.ts` module. The existing `GameState.endTurn()` is expanded from 2 phases (trade + production) to 4 phases (raw production, trade, crafting, food consumption). The City interface gains `craftingQueue` and `foodStatus` fields. Scoring changes from unique-resource-count to crafted-goods-wealth.

**Tech Stack:** TypeScript, Vite, pnpm (via mise), oxlint, oxfmt

**Design doc:** `docs/plans/2026-03-03-production-chains-design.md`

---

### Task 1: Add Crafted Resource Types

**Files:**

- Modify: `src/game/resources.ts`

**Step 1: Add new enum values and display names**

Add `Bread`, `Tools`, and `Potions` to the `ResourceType` enum and `ResourceNames` map. These are crafted-only resources — no terrain produces them.

```typescript
// In the ResourceType enum, add after Furs:
export enum ResourceType {
  Grain = "grain",
  Fish = "fish",
  Timber = "timber",
  IronOre = "iron_ore",
  Herbs = "herbs",
  Furs = "furs",
  Bread = "bread",
  Tools = "tools",
  Potions = "potions",
}

// In ResourceNames, add the new entries:
export const ResourceNames: Record<ResourceType, string> = {
  [ResourceType.Grain]: "Grain",
  [ResourceType.Fish]: "Fish",
  [ResourceType.Timber]: "Timber",
  [ResourceType.IronOre]: "Iron Ore",
  [ResourceType.Herbs]: "Herbs",
  [ResourceType.Furs]: "Furs",
  [ResourceType.Bread]: "Bread",
  [ResourceType.Tools]: "Tools",
  [ResourceType.Potions]: "Potions",
};
```

No changes needed to `ResourceSources` or `tileProducesResource` — the new types have no terrain source.

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build. No runtime changes yet.

**Step 3: Commit**

```bash
git add src/game/resources.ts
git commit -m "feat: add Bread, Tools, Potions crafted resource types"
```

---

### Task 2: Create Recipe Definitions

**Files:**

- Create: `src/game/recipes.ts`

**Step 1: Create the recipes module**

```typescript
import { ResourceType } from "./resources";

export interface Recipe {
  id: string;
  name: string;
  inputs: Map<ResourceType, number>;
  outputs: Map<ResourceType, number>;
}

export const RECIPES: Recipe[] = [
  {
    id: "bread",
    name: "Bread",
    inputs: new Map([
      [ResourceType.Grain, 2],
      [ResourceType.Fish, 1],
    ]),
    outputs: new Map([[ResourceType.Bread, 3]]),
  },
  {
    id: "tools",
    name: "Tools",
    inputs: new Map([
      [ResourceType.IronOre, 2],
      [ResourceType.Timber, 1],
    ]),
    outputs: new Map([[ResourceType.Tools, 2]]),
  },
  {
    id: "potions",
    name: "Potions",
    inputs: new Map([
      [ResourceType.Herbs, 2],
      [ResourceType.Grain, 1],
    ]),
    outputs: new Map([[ResourceType.Potions, 2]]),
  },
  {
    id: "livestock",
    name: "Livestock",
    inputs: new Map([
      [ResourceType.Grain, 2],
      [ResourceType.Furs, 1],
    ]),
    outputs: new Map([
      [ResourceType.Bread, 2],
      [ResourceType.Furs, 1],
    ]),
  },
];

// Score values for crafted goods (raw resources = 0)
export const RESOURCE_VALUE: Partial<Record<ResourceType, number>> = {
  [ResourceType.Bread]: 1,
  [ResourceType.Tools]: 3,
  [ResourceType.Potions]: 5,
};

// Food consumption per city per turn
export const FOOD_CONSUMPTION = 3;

// Tools production boost multiplier
export const TOOLS_BOOST = 0.25;

// Check if a city's stockpile can afford a recipe
export function canAffordRecipe(stockpile: Map<ResourceType, number>, recipe: Recipe): boolean {
  for (const [resource, needed] of recipe.inputs) {
    if ((stockpile.get(resource) ?? 0) < needed) return false;
  }
  return true;
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/game/recipes.ts
git commit -m "feat: add recipe definitions with 4 crafting chains"
```

---

### Task 3: Update City Interface

**Files:**

- Modify: `src/game/city.ts`

**Step 1: Add crafting queue and food status to City interface and createCity**

```typescript
// Add to the City interface after linkIds:
export interface City {
  id: string;
  name: string;
  position: { x: number; y: number };
  color: [number, number, number, number];
  territoryTiles: Set<string>;
  stockpile: Map<ResourceType, number>;
  production: Map<ResourceType, number>;
  receivedResources: Set<ResourceType>;
  linkIds: string[];
  craftingQueue: string | null; // recipe id, or null if idle
  foodStatus: "fed" | "underfed" | "starving";
}

// Update createCity to initialize the new fields:
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
    craftingQueue: null,
    foodStatus: "fed",
  };
}
```

Note: `receivedResources` is kept for now to avoid breaking existing code. It will become unused once scoring is updated in Task 4.

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/game/city.ts
git commit -m "feat: add craftingQueue and foodStatus to City interface"
```

---

### Task 4: Update Game State Turn Engine

**Files:**

- Modify: `src/game/game-state.ts`

**Step 1: Rewrite the turn engine with 4 phases**

Replace the entire `game-state.ts` content. The key changes are:

- `runProduction()` now checks Tools consumption and food status modifiers
- New `runCrafting()` method processes each city's crafting queue
- New `consumeFood()` method eats 3 food per city per turn
- `endTurn()` calls phases in order: production, trade, crafting, food consumption
- `getCityScore()` returns wealth-based score instead of unique resource count

```typescript
import type { TerrainData } from "./procedural-generator";
import type { City, TradeLink, TradeAllocation } from "./city";
import { ResourceType } from "./resources";
import { findPath, computeLinkCapacity } from "./pathfinding";
import { RECIPES, RESOURCE_VALUE, FOOD_CONSUMPTION, TOOLS_BOOST, canAffordRecipe } from "./recipes";

export interface TurnLog {
  cityId: string;
  produced: Map<ResourceType, number>;
  crafted: Map<ResourceType, number>;
  foodConsumed: number;
  foodStatus: "fed" | "underfed" | "starving";
  toolsUsed: boolean;
}

export class GameState {
  public cities: City[] = [];
  public links: Map<string, TradeLink> = new Map();
  public turn: number = 0;
  public terrainMap: Map<string, TerrainData> = new Map();
  public gridWidth: number = 75;
  public gridHeight: number = 75;
  public lastTurnLog: TurnLog[] = [];

  private nextLinkId = 0;

  // Phase 1: Raw production — terrain resources, tools boost, hunger penalty
  public runProduction(): void {
    for (const city of this.cities) {
      const hasTools = (city.stockpile.get(ResourceType.Tools) ?? 0) >= 1;

      // Consume 1 Tools for the boost
      if (hasTools) {
        city.stockpile.set(ResourceType.Tools, (city.stockpile.get(ResourceType.Tools) ?? 0) - 1);
      }

      // Determine production multiplier based on food status
      let multiplier = 1.0;
      if (city.foodStatus === "underfed") multiplier = 0.5;
      else if (city.foodStatus === "starving") multiplier = 0;

      // Apply tools boost
      if (hasTools) multiplier *= 1 + TOOLS_BOOST;

      for (const [resource, baseAmount] of city.production) {
        const amount = Math.floor(baseAmount * multiplier);
        if (amount > 0) {
          city.stockpile.set(resource, (city.stockpile.get(resource) ?? 0) + amount);
        }
      }
    }
  }

  // Phase 2: Resolve trade (unchanged logic)
  public resolveTrade(): void {
    for (const link of this.links.values()) {
      let aToBUsed = 0;
      let bToAUsed = 0;

      for (const alloc of link.allocations) {
        const used = alloc.direction === "a-to-b" ? aToBUsed : bToAUsed;
        const remaining = link.capacity - used;
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

        if (alloc.direction === "a-to-b") aToBUsed += transferred;
        else bToAUsed += transferred;
      }
    }
  }

  // Phase 3: Crafting — execute each city's queued recipe
  public runCrafting(): void {
    for (const city of this.cities) {
      if (!city.craftingQueue) continue;

      const recipe = RECIPES.find((r) => r.id === city.craftingQueue);
      if (!recipe) continue;

      if (!canAffordRecipe(city.stockpile, recipe)) continue;

      // Consume inputs
      for (const [resource, needed] of recipe.inputs) {
        city.stockpile.set(resource, (city.stockpile.get(resource) ?? 0) - needed);
      }

      // Produce outputs
      for (const [resource, amount] of recipe.outputs) {
        city.stockpile.set(resource, (city.stockpile.get(resource) ?? 0) + amount);
      }
    }
  }

  // Phase 4: Food consumption — eat 3 food per city, set status
  public consumeFood(): void {
    for (const city of this.cities) {
      let remaining = FOOD_CONSUMPTION;
      let eaten = 0;

      // Eat Bread first
      const bread = city.stockpile.get(ResourceType.Bread) ?? 0;
      if (bread > 0) {
        const eatBread = Math.min(bread, remaining);
        city.stockpile.set(ResourceType.Bread, bread - eatBread);
        remaining -= eatBread;
        eaten += eatBread;
      }

      // Then Fish
      if (remaining > 0) {
        const fish = city.stockpile.get(ResourceType.Fish) ?? 0;
        if (fish > 0) {
          const eatFish = Math.min(fish, remaining);
          city.stockpile.set(ResourceType.Fish, fish - eatFish);
          remaining -= eatFish;
          eaten += eatFish;
        }
      }

      // Set food status for next turn
      if (eaten >= FOOD_CONSUMPTION) {
        city.foodStatus = "fed";
      } else if (eaten > 0) {
        city.foodStatus = "underfed";
      } else {
        city.foodStatus = "starving";
      }
    }
  }

  // Advance to next turn — 4 phases in order
  public endTurn(): void {
    this.runProduction();
    this.resolveTrade();
    this.runCrafting();
    this.consumeFood();
    this.turn++;
  }

  // Build a trade link between two cities
  public buildLink(cityAId: string, cityBId: string): TradeLink | null {
    const cityA = this.cities.find((c) => c.id === cityAId);
    const cityB = this.cities.find((c) => c.id === cityBId);
    if (!cityA || !cityB) return null;

    if (cityA.linkIds.length >= 3 || cityB.linkIds.length >= 3) return null;

    const isFirstLink = cityA.linkIds.length === 0;

    const timber = cityA.stockpile.get(ResourceType.Timber) ?? 0;
    const iron = cityA.stockpile.get(ResourceType.IronOre) ?? 0;
    if (!isFirstLink && (timber < 10 || iron < 5)) return null;

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

    if (!isFirstLink) {
      cityA.stockpile.set(ResourceType.Timber, timber - 10);
      cityA.stockpile.set(ResourceType.IronOre, iron - 5);
    }

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

  // Set trade allocation on a link for a given direction
  public setAllocation(
    linkId: string,
    direction: "a-to-b" | "b-to-a",
    resource: ResourceType,
    amount: number,
  ): void {
    const link = this.links.get(linkId);
    if (!link) return;
    link.allocations = link.allocations.filter((a) => a.direction !== direction);
    if (amount > 0) {
      link.allocations.push({ resource, amount, direction });
    }
  }

  // Score = total wealth from crafted goods across all cities
  public getCityScore(cityId: string): number {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city) return 0;
    let score = 0;
    for (const [resource, amount] of city.stockpile) {
      const value = RESOURCE_VALUE[resource] ?? 0;
      score += value * amount;
    }
    return score;
  }

  // Total score across all cities
  public getTotalScore(): number {
    return this.cities.reduce((sum, city) => sum + this.getCityScore(city.id), 0);
  }

  // Set crafting queue for a city
  public setCraftingQueue(cityId: string, recipeId: string | null): void {
    const city = this.cities.find((c) => c.id === cityId);
    if (!city) return;
    city.craftingQueue = recipeId;
  }

  // Preview a link
  public previewLink(
    cityAId: string,
    cityBId: string,
  ): {
    path: Array<{ x: number; y: number }>;
    cost: number;
    capacity: number;
    free: boolean;
  } | null {
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
      free: cityA.linkIds.length === 0,
    };
  }
}
```

**Step 2: Verify it compiles**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build. The old `receivedResources` tracking in `resolveTrade` is removed — it was only used by the old scoring.

**Step 3: Commit**

```bash
git add src/game/game-state.ts
git commit -m "feat: 4-phase turn engine with crafting, food consumption, and wealth scoring"
```

---

### Task 5: Add Crafting UI and Food Status to City Detail

**Files:**

- Modify: `index.html`
- Modify: `src/script.ts`

**Step 1: Add turn log and crafting section to HTML**

In `index.html`, add a turn log div after the turn counter row (after line 207), and a crafting section inside the city detail panel (after the stockpile section, before the trade links section).

After the turn counter `</div>` on line 207, add:

```html
<div
  id="turnLog"
  style="
    margin-top: 8px;
    padding: 8px;
    background: #1a1a1a;
    border-radius: 4px;
    font-size: 11px;
    color: #b0b0b0;
    display: none;
    max-height: 120px;
    overflow-y: auto;
  "
></div>
```

Inside the city detail panel, after the stockpile section (after line 232 `</div>`) and before the trade links section (before line 233 `<div style="margin-top: 8px...`), add:

```html
<div style="margin-top: 8px; font-size: 12px">
  <div style="color: #b0b0b0; margin-bottom: 4px">Crafting:</div>
  <div id="cityDetailCrafting"></div>
</div>
```

**Step 2: Update script.ts imports and UI references**

At the top of `src/script.ts`, update the imports to include recipes:

```typescript
import { RECIPES, RESOURCE_VALUE, canAffordRecipe } from "./game/recipes";
```

Add new DOM element references after the existing game UI elements (after line 80):

```typescript
const turnLogDiv = document.getElementById("turnLog") as HTMLDivElement;
const cityDetailCrafting = document.getElementById("cityDetailCrafting") as HTMLDivElement;
```

**Step 3: Update the `showCityDetail` function**

In the `showCityDetail` function, update the score display to show wealth instead of `/6`:

Replace:

```typescript
cityDetailScore.textContent = `Score: ${gameState.getCityScore(cityId)}/6`;
```

With:

```typescript
const foodStatusColors = { fed: "#4a4", underfed: "#aa4", starving: "#a44" };
const foodStatusLabels = { fed: "Fed", underfed: "Underfed", starving: "Starving" };
cityDetailScore.innerHTML = `<span style="color: ${foodStatusColors[city.foodStatus]}">${foodStatusLabels[city.foodStatus]}</span> | Wealth: ${gameState.getCityScore(cityId)}`;
```

After the stockpile section and before the links section, add the crafting UI:

```typescript
// Crafting queue
let craftHtml = `<select id="craftingSelect" style="width: 100%; padding: 4px; font-size: 11px; margin-bottom: 4px; background: #1a1a1a; color: #e0e0e0; border: 1px solid #444; border-radius: 3px;">
  <option value="">None (idle)</option>`;
for (const recipe of RECIPES) {
  const affordable = canAffordRecipe(city.stockpile, recipe);
  const inputStr = [...recipe.inputs.entries()]
    .map(([r, n]) => `${n} ${ResourceNames[r]}`)
    .join(" + ");
  const outputStr = [...recipe.outputs.entries()]
    .map(([r, n]) => `${n} ${ResourceNames[r]}`)
    .join(" + ");
  const selected = city.craftingQueue === recipe.id ? " selected" : "";
  craftHtml += `<option value="${recipe.id}"${selected}${!affordable ? ' style="color: #666"' : ""}>
    ${recipe.name}: ${inputStr} → ${outputStr}${!affordable ? " (need more)" : ""}
  </option>`;
}
craftHtml += "</select>";
cityDetailCrafting.innerHTML = craftHtml;

// Attach crafting change listener
const craftSelect = document.getElementById("craftingSelect") as HTMLSelectElement;
craftSelect.addEventListener("change", () => {
  gameState.setCraftingQueue(cityId, craftSelect.value || null);
});
```

**Step 4: Update the End Turn handler to show turn log**

Replace the existing end turn handler:

```typescript
endTurnBtn.addEventListener("click", () => {
  gameState.endTurn();
  turnCounter.textContent = String(gameState.turn + 1);

  // Show turn log
  let logHtml = "";
  for (const city of gameState.cities) {
    const foodColor = { fed: "#4a4", underfed: "#aa4", starving: "#a44" }[city.foodStatus];
    logHtml += `<div style="margin-bottom: 4px"><strong style="color: rgb(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255})">${city.name}</strong>: <span style="color: ${foodColor}">${city.foodStatus}</span></div>`;
  }
  turnLogDiv.innerHTML = logHtml;
  turnLogDiv.style.display = "block";

  updateCityList();
  if (selectedCityId) showCityDetail(selectedCityId);
  renderFeatureOverlay();
});
```

**Step 5: Update the city list to show wealth instead of /6**

In the `updateCityList` function, replace the score display:

Replace:

```typescript
<span style="float: right; color: #888;">Score: ${score}/6</span>
```

With:

```typescript
<span style="float: right; color: #888;">Wealth: ${score}</span>
```

**Step 6: Verify it compiles and the UI works**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build. Running `pnpm dev` shows:

- Crafting dropdown in city detail panel
- Food status indicator next to city name
- Turn log after clicking End Turn
- Wealth score instead of /6

**Step 7: Commit**

```bash
git add index.html src/script.ts
git commit -m "feat: crafting UI, food status display, wealth scoring, and turn log"
```

---

### Task 6: Lint, Format, and Final Verification

**Files:**

- Modify: any files as needed for lint/format fixes

**Step 1: Run linter**

Run: `eval "$(mise activate bash)" && pnpm run lint`
Expected: Fix any lint errors.

**Step 2: Run formatter**

Run: `eval "$(mise activate bash)" && pnpm run format`

**Step 3: Full build verification**

Run: `eval "$(mise activate bash)" && pnpm build`
Expected: Clean build with no errors.

**Step 4: Manual playtest checklist**

Open `pnpm dev` and verify:

- [ ] New resource types (Bread, Tools, Potions) appear in trade allocation dropdowns
- [ ] Crafting dropdown shows all 4 recipes with input/output costs
- [ ] Setting a crafting queue persists across turns
- [ ] Crafting consumes inputs and produces outputs on End Turn
- [ ] Livestock recipe produces both Bread and Furs
- [ ] Tools are consumed (1/turn) and boost raw production by 25%
- [ ] Cities consume 3 food per turn (Bread first, then Fish)
- [ ] Underfed cities show yellow status, production halved
- [ ] Starving cities show red status, production drops to zero
- [ ] Wealth score increases when crafted goods accumulate
- [ ] Turn log shows food status for each city after End Turn
- [ ] Existing trade link building still works
- [ ] Existing trade allocation still works

**Step 5: Commit any lint/format fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes"
```
