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
      // Capacity is per-direction
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
        toCity.receivedResources.add(alloc.resource);

        if (alloc.direction === "a-to-b") aToBUsed += transferred;
        else bToAUsed += transferred;
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

    // First trade link per city is free; subsequent links cost resources
    const isFirstLink = cityA.linkIds.length === 0;

    const timber = cityA.stockpile.get(ResourceType.Timber) ?? 0;
    const iron = cityA.stockpile.get(ResourceType.IronOre) ?? 0;
    if (!isFirstLink && (timber < 10 || iron < 5)) return null;

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

    // Deduct construction cost (skip for first link)
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

  // Set trade allocation on a link for a given direction, preserving the other direction
  public setAllocation(
    linkId: string,
    direction: "a-to-b" | "b-to-a",
    resource: ResourceType,
    amount: number,
  ): void {
    const link = this.links.get(linkId);
    if (!link) return;
    // Remove existing allocations for this direction
    link.allocations = link.allocations.filter((a) => a.direction !== direction);
    if (amount > 0) {
      link.allocations.push({ resource, amount, direction });
    }
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
