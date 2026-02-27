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
