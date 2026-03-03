import { TerrainType, TerrainFeature } from "./terrain";

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

// Feature → resource (checked first, takes priority over terrain)
export const FeatureResource: Partial<Record<TerrainFeature, ResourceType>> = {
  [TerrainFeature.Forest]: ResourceType.Timber,
  [TerrainFeature.Jungle]: ResourceType.Timber,
  [TerrainFeature.Marsh]: ResourceType.Herbs,
  [TerrainFeature.Mountain]: ResourceType.IronOre,
};

// Terrain → resource (fallback when no feature resource)
export const TerrainResource: Partial<Record<TerrainType, ResourceType>> = {
  [TerrainType.Plains]: ResourceType.Grain,
  [TerrainType.Coast]: ResourceType.Fish,
  [TerrainType.Wetlands]: ResourceType.Herbs,
  [TerrainType.Tundra]: ResourceType.Furs,
};

// Display names for UI
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

// Returns the single resource a tile produces, or undefined if none
export function tileResource(
  terrain: TerrainType,
  feature: TerrainFeature | undefined,
): ResourceType | undefined {
  if (feature) {
    const featureRes = FeatureResource[feature];
    if (featureRes) return featureRes;
  }
  return TerrainResource[terrain];
}
