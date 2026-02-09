import { PerlinNoise } from "./perlin-noise";
import type { TerrainType } from "./terrain";
import { TerrainType as TT } from "./terrain";

export enum ElevationType {
  Flat = "flat",
  Hills = "hills",
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
  private seaLevel: number; // 0-1 range, elevation below this is water
  private seed: number;

  constructor(seed?: number, mapType?: MapType, seaLevel: number = 0.35) {
    const baseSeed = seed ?? Math.floor(Math.random() * 10000);
    this.seed = baseSeed;
    this.elevationNoise = new PerlinNoise(baseSeed);
    this.moistureNoise = new PerlinNoise(baseSeed + 1000);
    this.temperatureNoise = new PerlinNoise(baseSeed + 2000);
    this.latitude = Math.random(); // Random latitude for variation
    this.seaLevel = seaLevel;

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

  public getSeed(): number {
    return this.seed;
  }

  public getSeaLevel(): number {
    return this.seaLevel;
  }

  public setSeaLevel(seaLevel: number): void {
    this.seaLevel = Math.max(0, Math.min(1, seaLevel));
  }

  // Create a seeded random number generator
  private createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      // Linear Congruential Generator (LCG) algorithm
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
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

  // Determine elevation type based on height (for land only)
  // Note: This should only be called for elevations above sea level
  private getElevationType(elevation: number): ElevationType {
    // Normalize elevation relative to sea level for land classification
    const landElevation = (elevation - this.seaLevel) / (1 - this.seaLevel);

    if (landElevation < 0.3) return ElevationType.Flat;
    if (landElevation < 0.7) return ElevationType.Hills;
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
    temperature: number,
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

    // Cold air holds less moisture - reduce moisture in cold regions
    // This creates polar deserts and cold dry regions
    if (temperature < 0.3) {
      // Very cold regions (polar): significantly reduce moisture
      moisture *= 0.4 + temperature * 0.6; // Scale by temperature
    } else if (temperature < 0.5) {
      // Cool regions: moderately reduce moisture
      moisture *= 0.7 + temperature * 0.3;
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
    // Check if below sea level
    if (elevation < this.seaLevel) {
      // Deep water vs shallow water
      const depthRatio = elevation / this.seaLevel;
      if (depthRatio < 0.6) {
        return TT.DeepWaters; // Deep ocean
      } else {
        return TT.Shallows; // Shallow water
      }
    }

    // Coastal areas (just above sea level)
    const coastThreshold = this.seaLevel + 0.05; // Narrow coastal band
    if (elevation >= this.seaLevel && elevation < coastThreshold) {
      return TT.Coast;
    }

    // Land terrain based on temperature and moisture
    // Very dry regions - both cold and hot deserts
    if (moisture < 0.2) {
      return TT.Desert;
    }

    // Cold regions (but not extreme deserts, which were handled above)
    if (temperature < 0.3) {
      return TT.Tundra;
    }

    // Hot and moderately dry
    if (temperature > 0.7 && moisture < 0.4) {
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
    const moisture = this.generateMoisture(x, y, gridWidth, gridHeight, elevation, temperature);
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
    // Create seeded random number generator for deterministic rivers
    const seededRandom = this.createSeededRandom(this.seed + 3000);

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
      const startIndex = Math.floor(seededRandom() * Math.min(20, potentialStarts.length));
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

      // Apply river terrain to all visited cells with width variation
      // Rivers get wider as they approach water
      const riverCells = new Set<string>(visited);

      // Calculate distance from each river cell to water
      const cellDistances = new Map<string, number>();
      for (const key of visited) {
        const [x, y] = key.split(",").map((s) => parseInt(s, 10));

        // Find minimum distance to water using BFS
        let minDistance = Infinity;
        const queue: Array<{ x: number; y: number; dist: number }> = [{ x, y, dist: 0 }];
        const visited = new Set<string>();

        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) break;

          const currentKey = getKey(current.x, current.y);
          if (visited.has(currentKey)) continue;
          visited.add(currentKey);

          const currentData = terrainMap.get(currentKey);
          if (currentData && isWater(currentData.terrain)) {
            minDistance = Math.min(minDistance, current.dist);
            break; // Found water, stop searching
          }

          if (current.dist < 10) {
            // Only search up to distance 10
            const neighbors = getNeighbors(current.x, current.y);
            for (const neighbor of neighbors) {
              queue.push({ ...neighbor, dist: current.dist + 1 });
            }
          }
        }

        cellDistances.set(key, minDistance);
      }

      // Widen river based on distance to water
      // Cells closer to water get wider
      for (const key of visited) {
        const distance = cellDistances.get(key) ?? Infinity;
        const [x, y] = key.split(",").map((s) => parseInt(s, 10));

        // River width increases as it approaches water
        // Distance 0-2: width 2 (5 cells including center)
        // Distance 3-5: width 1 (3 cells including center)
        // Distance 6+: width 0 (1 cell, just the river itself)
        let width = 0;
        if (distance <= 2) {
          width = 2;
        } else if (distance <= 5) {
          width = 1;
        }

        // Add adjacent cells to widen the river
        if (width > 0) {
          const expansionQueue: Array<{ x: number; y: number; depth: number }> = [
            { x, y, depth: 0 },
          ];
          const expanded = new Set<string>();

          while (expansionQueue.length > 0) {
            const current = expansionQueue.shift();
            if (!current) break;

            const currentKey = getKey(current.x, current.y);
            if (expanded.has(currentKey)) continue;
            expanded.add(currentKey);

            // Add this cell as a river cell
            riverCells.add(currentKey);

            // Continue expanding if within width limit
            if (current.depth < width) {
              const neighbors = getNeighbors(current.x, current.y);
              for (const neighbor of neighbors) {
                const neighborKey = getKey(neighbor.x, neighbor.y);
                const neighborData = terrainMap.get(neighborKey);

                // Only expand into land (not water)
                if (neighborData && !isWater(neighborData.terrain)) {
                  expansionQueue.push({ ...neighbor, depth: current.depth + 1 });
                }
              }
            }
          }
        }
      }

      // Apply river terrain to all river cells (original path + widened areas)
      for (const key of riverCells) {
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
          if (moisture < 0.2) {
            newTerrain = TT.Desert;
          } else if (temperature < 0.3) {
            newTerrain = TT.Tundra;
          } else if (temperature > 0.7 && moisture < 0.4) {
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
