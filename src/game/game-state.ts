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
