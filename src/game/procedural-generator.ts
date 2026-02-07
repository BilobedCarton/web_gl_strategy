import { PerlinNoise } from "./perlin-noise";
import type { TerrainType } from "./terrain";
import { TerrainType as TT } from "./terrain";

export enum ElevationType {
  DeepOcean = "deep_ocean",
  Ocean = "ocean",
  Flat = "flat",
  Hills = "hills",
  Valley = "valley",
  Mountain = "mountain",
}

export enum MapType {
  Island = "island", // Surrounded by water
  Inland = "inland", // No water at edges, landlocked terrain
  Peninsula = "peninsula", // Connected to mainland on one side
  Archipelago = "archipelago", // Multiple islands
  Coastal = "coastal", // Mainland segment with one coastal edge
}

export interface TerrainData {
  terrain: TerrainType;
  elevation: number; // 0-1 range
  elevationType: ElevationType;
  temperature: number; // 0-1 range (0 = cold, 1 = hot)
  moisture: number; // 0-1 range (0 = dry, 1 = wet)
}

export class ProceduralTerrainGenerator {
  private elevationNoise: PerlinNoise;
  private moistureNoise: PerlinNoise;
  private temperatureNoise: PerlinNoise;
  private latitude: number; // 0-1 range (0 = equator, 1 = pole)
  private mapType: MapType;

  constructor(seed?: number, mapType?: MapType) {
    const baseSeed = seed ?? Math.floor(Math.random() * 10000);
    this.elevationNoise = new PerlinNoise(baseSeed);
    this.moistureNoise = new PerlinNoise(baseSeed + 1000);
    this.temperatureNoise = new PerlinNoise(baseSeed + 2000);
    this.latitude = Math.random(); // Random latitude for variation

    // Random map type if not specified
    if (mapType !== undefined) {
      this.mapType = mapType;
    } else {
      const types = Object.values(MapType);
      this.mapType = types[Math.floor(Math.random() * types.length)] || MapType.Island;
    }
  }

  public getLatitude(): number {
    return this.latitude;
  }

  public setLatitude(latitude: number): void {
    this.latitude = Math.max(0, Math.min(1, latitude));
  }

  public getMapType(): MapType {
    return this.mapType;
  }

  // Apply map-type specific shaping to elevation
  private applyMapShaping(
    elevation: number,
    x: number,
    y: number,
    gridWidth: number,
    gridHeight: number,
  ): number {
    const nx = x / gridWidth;
    const ny = y / gridHeight;

    switch (this.mapType) {
      case MapType.Island: {
        // Radial falloff from center
        const centerX = gridWidth / 2;
        const centerY = gridHeight / 2;
        const distanceFromCenter = Math.sqrt(
          Math.pow((x - centerX) / centerX, 2) + Math.pow((y - centerY) / centerY, 2),
        );
        const islandFactor = Math.max(0, 1 - distanceFromCenter * 0.8);
        return elevation * islandFactor;
      }

      case MapType.Inland: {
        // No water at edges - boost elevation near boundaries
        const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
        // Boost elevation near edges to prevent ocean
        const edgeBoost = 1 + (1 - edgeDistance) * 0.5;
        return Math.min(1, elevation * edgeBoost * 1.2);
      }

      case MapType.Peninsula: {
        // Connected to one edge (top), water on other three sides
        const bottomFactor = 1 - ny; // More land at top
        const sideFactor = Math.min(nx, 1 - nx) * 2;
        const peninsulaFactor = Math.min(1, bottomFactor * sideFactor * 2);
        return elevation * (0.2 + peninsulaFactor * 0.8);
      }

      case MapType.Archipelago: {
        // Multiple smaller islands
        const islandNoise = this.elevationNoise.noise2D(nx * 8, ny * 8);
        const islandMask = islandNoise > -0.2 ? 1 : 0.1;
        const centerX = gridWidth / 2;
        const centerY = gridHeight / 2;
        const distanceFromCenter = Math.sqrt(
          Math.pow((x - centerX) / centerX, 2) + Math.pow((y - centerY) / centerY, 2),
        );
        const falloff = Math.max(0, 1 - distanceFromCenter * 0.6);
        return elevation * islandMask * falloff;
      }

      case MapType.Coastal: {
        // Mainland segment with water on one edge (left side)
        const coastalFactor = Math.min(1, nx * 2);
        return elevation * (0.3 + coastalFactor * 0.7);
      }

      default:
        return elevation;
    }
  }

  // Generate elevation using Perlin noise with multiple octaves
  private generateElevation(x: number, y: number, gridWidth: number, gridHeight: number): number {
    const nx = x / gridWidth;
    const ny = y / gridHeight;

    // Multiple octaves for natural-looking terrain
    let elevation = this.elevationNoise.octaveNoise2D(nx * 4, ny * 4, 6, 0.5, 2.0);

    // Normalize to 0-1 range
    elevation = (elevation + 1) / 2;

    // Apply map-type specific shaping
    elevation = this.applyMapShaping(elevation, x, y, gridWidth, gridHeight);

    return Math.max(0, Math.min(1, elevation));
  }

  // Determine elevation type based on height
  private getElevationType(elevation: number): ElevationType {
    if (elevation < 0.25) return ElevationType.DeepOcean;
    if (elevation < 0.35) return ElevationType.Ocean;
    if (elevation < 0.45) return ElevationType.Flat;
    if (elevation < 0.6) return ElevationType.Hills;
    if (elevation < 0.7) return ElevationType.Valley;
    return ElevationType.Mountain;
  }

  // Generate temperature based on latitude and elevation
  private generateTemperature(x: number, y: number, gridHeight: number, elevation: number): number {
    // Base temperature from the map's latitude (0 = equator/hot, 1 = pole/cold)
    // The entire map is at this latitude, representing a small section of the globe
    let temperature = 1 - this.latitude;

    // Small variation across the map (representing a small latitudinal range)
    // A 50-cell map might represent ~5-10 degrees of latitude
    const latitudeVariation = (y / gridHeight - 0.5) * 0.1; // ±0.05 variation
    temperature -= latitudeVariation;

    // Elevation affects temperature (higher = colder)
    temperature -= elevation * 0.3;

    // Add some noise for variation
    const nx = x / gridHeight;
    const ny = y / gridHeight;
    const tempNoise = this.temperatureNoise.octaveNoise2D(nx * 2, ny * 2, 3, 0.5);
    temperature += tempNoise * 0.15;

    return Math.max(0, Math.min(1, temperature));
  }

  // Generate moisture using watershed simulation
  private generateMoisture(
    x: number,
    y: number,
    gridWidth: number,
    gridHeight: number,
    elevation: number,
  ): number {
    const nx = x / gridWidth;
    const ny = y / gridHeight;

    // Base moisture from Perlin noise
    let moisture = this.moistureNoise.octaveNoise2D(nx * 3, ny * 3, 4, 0.5);
    moisture = (moisture + 1) / 2;

    // Water bodies have high moisture
    if (elevation < 0.35) {
      return 1.0;
    }

    // Coastal areas have higher moisture
    if (elevation < 0.45) {
      moisture = Math.max(moisture, 0.7);
    }

    // Mountains create rain shadows
    if (elevation > 0.7) {
      moisture *= 0.6;
    }

    return Math.max(0, Math.min(1, moisture));
  }

  // Determine terrain type based on elevation, temperature, and moisture
  private determineTerrainType(
    elevation: number,
    elevationType: ElevationType,
    temperature: number,
    moisture: number,
  ): TerrainType {
    // Water bodies
    if (elevationType === ElevationType.DeepOcean) {
      return TT.DeepWaters;
    }
    if (elevationType === ElevationType.Ocean) {
      return TT.Shallows;
    }

    // Coastal areas
    if (elevation >= 0.35 && elevation < 0.45) {
      return TT.Coast;
    }

    // Land terrain based on temperature and moisture
    // Cold regions
    if (temperature < 0.3) {
      return TT.Tundra;
    }

    // Hot and dry
    if (temperature > 0.7 && moisture < 0.3) {
      return TT.Desert;
    }

    // Wet regions
    if (moisture > 0.6) {
      return TT.Wetlands;
    }

    // Default to plains
    return TT.Plains;
  }

  // Generate complete terrain data for a cell
  public generateTerrainData(
    x: number,
    y: number,
    gridWidth: number,
    gridHeight: number,
  ): TerrainData {
    const elevation = this.generateElevation(x, y, gridWidth, gridHeight);
    const elevationType = this.getElevationType(elevation);
    const temperature = this.generateTemperature(x, y, gridHeight, elevation);
    const moisture = this.generateMoisture(x, y, gridWidth, gridHeight, elevation);
    const terrain = this.determineTerrainType(elevation, elevationType, temperature, moisture);

    return {
      terrain,
      elevation,
      elevationType,
      temperature,
      moisture,
    };
  }

  // Generate rivers that flow from high elevations to water
  public generateRivers(
    terrainMap: Map<string, TerrainData>,
    gridWidth: number,
    gridHeight: number,
    numRivers: number = 5,
  ): void {
    const getKey = (x: number, y: number): string => `${x},${y}`;

    const isWater = (terrain: TerrainType): boolean => {
      return terrain === TT.DeepWaters || terrain === TT.Shallows;
    };

    const getNeighbors = (x: number, y: number): Array<{ x: number; y: number }> => {
      const neighbors: Array<{ x: number; y: number }> = [];
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 1, dy: 0 }, // right
        { dx: 0, dy: 1 }, // down
        { dx: -1, dy: 0 }, // left
      ];

      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          neighbors.push({ x: nx, y: ny });
        }
      }

      return neighbors;
    };

    // Find potential river starting points (high elevation, not water)
    const potentialStarts: Array<{ x: number; y: number; elevation: number }> = [];

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const key = getKey(x, y);
        const data = terrainMap.get(key);

        if (data && !isWater(data.terrain) && data.elevation > 0.6) {
          potentialStarts.push({ x, y, elevation: data.elevation });
        }
      }
    }

    // Sort by elevation (highest first)
    potentialStarts.sort((a, b) => b.elevation - a.elevation);

    // Generate rivers from random high points
    for (let i = 0; i < Math.min(numRivers, potentialStarts.length); i++) {
      // Pick a random starting point from the top candidates
      const startIndex = Math.floor(Math.random() * Math.min(20, potentialStarts.length));
      const start = potentialStarts[startIndex];

      if (!start) continue;

      // Trace river path downhill
      let currentX = start.x;
      let currentY = start.y;
      const visited = new Set<string>();
      let maxSteps = 200; // Prevent infinite loops

      while (maxSteps > 0) {
        maxSteps--;

        const currentKey = getKey(currentX, currentY);
        const currentData = terrainMap.get(currentKey);

        if (!currentData) break;

        // Stop if we reached water
        if (isWater(currentData.terrain)) {
          break;
        }

        // Mark current cell as river (unless it's already water or coast)
        if (currentData.terrain !== TT.Coast) {
          visited.add(currentKey);
        }

        // Find lowest neighbor
        const neighbors = getNeighbors(currentX, currentY);
        let lowestNeighbor: { x: number; y: number; elevation: number } | null = null;

        for (const neighbor of neighbors) {
          const neighborKey = getKey(neighbor.x, neighbor.y);
          const neighborData = terrainMap.get(neighborKey);

          if (!neighborData) continue;

          // Don't revisit cells in this river path
          if (visited.has(neighborKey)) continue;

          // Find the lowest neighbor
          if (lowestNeighbor === null || neighborData.elevation < lowestNeighbor.elevation) {
            lowestNeighbor = { ...neighbor, elevation: neighborData.elevation };
          }
        }

        // If no lower neighbor, stop (reached a local minimum)
        if (lowestNeighbor === null || lowestNeighbor.elevation >= currentData.elevation) {
          break;
        }

        // Move to the lowest neighbor
        currentX = lowestNeighbor.x;
        currentY = lowestNeighbor.y;
      }

      // Apply river terrain to all visited cells
      for (const key of visited) {
        const data = terrainMap.get(key);
        if (data) {
          terrainMap.set(key, {
            ...data,
            terrain: TT.River,
          });
        }
      }
    }
  }

  // Validate and fix coast terrain connectivity
  // Coast cells must be adjacent to water or another valid coast cell
  public validateCoastTerrain(
    terrainMap: Map<string, TerrainData>,
    gridWidth: number,
    gridHeight: number,
  ): void {
    const isWater = (terrain: TerrainType): boolean => {
      return terrain === TT.DeepWaters || terrain === TT.Shallows;
    };

    const getKey = (x: number, y: number): string => `${x},${y}`;

    const getNeighbors = (x: number, y: number): Array<{ x: number; y: number }> => {
      const neighbors: Array<{ x: number; y: number }> = [];
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 1, dy: 0 }, // right
        { dx: 0, dy: 1 }, // down
        { dx: -1, dy: 0 }, // left
      ];

      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          neighbors.push({ x: nx, y: ny });
        }
      }

      return neighbors;
    };

    // Track which coast cells are valid (connected to water)
    const validCoastCells = new Set<string>();

    // First pass: mark all coast cells adjacent to water as valid
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const key = getKey(x, y);
        const data = terrainMap.get(key);

        if (data && data.terrain === TT.Coast) {
          const neighbors = getNeighbors(x, y);
          const hasWaterNeighbor = neighbors.some((neighbor) => {
            const neighborData = terrainMap.get(getKey(neighbor.x, neighbor.y));
            return neighborData && isWater(neighborData.terrain);
          });

          if (hasWaterNeighbor) {
            validCoastCells.add(key);
          }
        }
      }
    }

    // Iteratively expand valid coast cells through connected coast cells
    let changed = true;
    while (changed) {
      changed = false;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const key = getKey(x, y);
          const data = terrainMap.get(key);

          if (data && data.terrain === TT.Coast && !validCoastCells.has(key)) {
            const neighbors = getNeighbors(x, y);
            const hasValidCoastNeighbor = neighbors.some((neighbor) => {
              const neighborKey = getKey(neighbor.x, neighbor.y);
              return validCoastCells.has(neighborKey);
            });

            if (hasValidCoastNeighbor) {
              validCoastCells.add(key);
              changed = true;
            }
          }
        }
      }
    }

    // Replace invalid coast cells with appropriate land terrain
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const key = getKey(x, y);
        const data = terrainMap.get(key);

        if (data && data.terrain === TT.Coast && !validCoastCells.has(key)) {
          // Replace with appropriate land terrain based on temperature and moisture
          const { temperature, moisture } = data;

          let newTerrain: TerrainType = TT.Plains;

          // Use same logic as determineTerrainType but skip water/coast checks
          if (temperature < 0.3) {
            newTerrain = TT.Tundra;
          } else if (temperature > 0.7 && moisture < 0.3) {
            newTerrain = TT.Desert;
          } else if (moisture > 0.6) {
            newTerrain = TT.Wetlands;
          } else {
            newTerrain = TT.Plains;
          }

          // Update terrain in the map
          terrainMap.set(key, {
            ...data,
            terrain: newTerrain,
          });
        }
      }
    }
  }
}
