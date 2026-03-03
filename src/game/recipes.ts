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

// Maximum number of times a recipe can run given current stockpile
export function maxAffordableRuns(stockpile: Map<ResourceType, number>, recipe: Recipe): number {
  let max = Infinity;
  for (const [resource, needed] of recipe.inputs) {
    max = Math.min(max, Math.floor((stockpile.get(resource) ?? 0) / needed));
  }
  return max === Infinity ? 0 : max;
}
