export enum TerrainFeature {
  Forest = "forest",
  Jungle = "jungle",
  Marsh = "marsh",
  Mountain = "mountain",
}

export enum TerrainType {
  Shallows = "shallows",
  DeepWaters = "deep_waters",
  Wetlands = "wetlands",
  Plains = "plains",
  Tundra = "tundra",
  Desert = "desert",
  Coast = "coast",
  River = "river",
}

// RGBA color values for each terrain type (0-1 range)
export const TerrainColors: Record<TerrainType, [number, number, number, number]> = {
  [TerrainType.Shallows]: [0.4, 0.7, 0.9, 1.0], // Light blue
  [TerrainType.River]: [0.4, 0.7, 0.9, 1.0], // Lighter blue
  [TerrainType.DeepWaters]: [0.1, 0.2, 0.5, 1.0], // Dark blue
  [TerrainType.Wetlands]: [0.2, 0.4, 0.2, 1.0], // Dark green
  [TerrainType.Plains]: [0.5, 0.8, 0.3, 1.0], // Light green
  [TerrainType.Tundra]: [0.7, 0.65, 0.55, 1.0], // Pale brown
  [TerrainType.Desert]: [0.9, 0.8, 0.5, 1.0], // Pale yellow
  [TerrainType.Coast]: [0.99, 0.95, 0.65, 1.0], // White
};

export function getTerrainColor(terrain: TerrainType): [number, number, number, number] {
  return TerrainColors[terrain];
}

export function getAllTerrainTypes(): TerrainType[] {
  return Object.values(TerrainType);
}

export function getRandomTerrainType(): TerrainType {
  const types = getAllTerrainTypes();
  return types[Math.floor(Math.random() * types.length)];
}
