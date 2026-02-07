import type { TerrainType } from "./terrain";
import { getTerrainColor, getRandomTerrainType } from "./terrain";
import type { ElevationType } from "./procedural-generator";

// Cell data structure
// RGBA color values in range 0-1
export interface CellData {
  color: [number, number, number, number]; // [r, g, b, a]
  terrain?: TerrainType; // Terrain type for this cell
  elevation?: number; // Elevation value (0-1 range)
  elevationType?: ElevationType; // Step-based elevation classification
  temperature?: number; // Temperature value (0-1 range)
  moisture?: number; // Moisture value (0-1 range)
  // Future extensibility:
  // textureId?: number;
}

// Helper function to create a cell with a color
export function createCell(r: number, g: number, b: number, a: number = 1.0): CellData {
  return {
    color: [r, g, b, a],
  };
}

// Helper function to create a cell with terrain
export function createCellWithTerrain(terrain: TerrainType): CellData {
  return {
    color: getTerrainColor(terrain),
    terrain,
  };
}

// Helper function to create a random colored cell
export function createRandomCell(): CellData {
  return {
    color: [Math.random(), Math.random(), Math.random(), 1.0],
  };
}

// Helper function to create a cell with random terrain
export function createRandomTerrainCell(): CellData {
  const terrain = getRandomTerrainType();
  return createCellWithTerrain(terrain);
}

// Helper function to create a cell from procedural terrain data
export function createCellFromTerrainData(
  terrain: TerrainType,
  elevation: number,
  elevationType: ElevationType,
  temperature: number,
  moisture: number,
): CellData {
  return {
    color: getTerrainColor(terrain),
    terrain,
    elevation,
    elevationType,
    temperature,
    moisture,
  };
}
