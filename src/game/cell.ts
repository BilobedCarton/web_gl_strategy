// Cell data structure
// RGBA color values in range 0-1
export interface CellData {
  color: [number, number, number, number]; // [r, g, b, a]
  // Future extensibility:
  // textureId?: number;
  // elevation?: number;
}

// Helper function to create a cell with a color
export function createCell(r: number, g: number, b: number, a: number = 1.0): CellData {
  return {
    color: [r, g, b, a],
  };
}

// Helper function to create a random colored cell
export function createRandomCell(): CellData {
  return {
    color: [Math.random(), Math.random(), Math.random(), 1.0],
  };
}
