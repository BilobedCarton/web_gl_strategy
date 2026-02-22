import { PerlinNoise } from "./perlin-noise";
import type { TerrainType } from "./terrain";
import { TerrainType as TT, TerrainFeature } from "./terrain";

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
  feature?: TerrainFeature;
}

export class ProceduralTerrainGenerator {
  private elevationNoise: PerlinNoise;
  private moistureNoise: PerlinNoise;
  private temperatureNoise: PerlinNoise;
  private featureNoise: PerlinNoise;
  private latitude: number; // 0-1 range (0 = equator, 1 = pole)
  private mapType: MapType;
  private seaLevel: number; // 0-1 range, elevation below this is water
  private moistureModifier: number; // Multiplier for moisture (0.5-1.5 range)
  private seed: number;

  constructor(seed?: number, mapType?: MapType, seaLevel: number = 0.35) {
    const baseSeed = seed ?? Math.floor(Math.random() * 10000);
    this.seed = baseSeed;
    this.elevationNoise = new PerlinNoise(baseSeed);
    this.moistureNoise = new PerlinNoise(baseSeed + 1000);
    this.temperatureNoise = new PerlinNoise(baseSeed + 2000);
    this.featureNoise = new PerlinNoise(baseSeed + 4000);
    this.latitude = Math.random(); // Random latitude for variation
    this.seaLevel = seaLevel;
    this.moistureModifier = 1.0; // Default: no modification

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

  public getMoistureModifier(): number {
    return this.moistureModifier;
  }

  public setMoistureModifier(modifier: number): void {
    this.moistureModifier = Math.max(0.5, Math.min(1.5, modifier));
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

    // Apply global moisture modifier
    moisture *= this.moistureModifier;

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

  // Determine terrain feature based on climate and terrain type
  private determineFeature(
    terrain: TerrainType,
    elevation: number,
    mountainThreshold: number,
    temperature: number,
    moisture: number,
  ): TerrainFeature | undefined {
    // Mountains: land cells significantly above the mean land elevation
    const isWater = terrain === TT.DeepWaters || terrain === TT.Shallows;
    if (!isWater && elevation > mountainThreshold) {
      return TerrainFeature.Mountain;
    }

    // Other features only appear on Plains or Wetlands
    if (terrain !== TT.Plains && terrain !== TT.Wetlands) return undefined;

    // Jungle: hot and wet
    if (temperature > 0.7 && moisture > 0.5) {
      return TerrainFeature.Jungle;
    }

    // Marsh: very wet wetlands
    if (moisture > 0.7 && terrain === TT.Wetlands) {
      return TerrainFeature.Marsh;
    }

    // Forest: temperate with moderate moisture
    if (temperature >= 0.3 && temperature <= 0.7 && moisture >= 0.4 && moisture <= 0.7) {
      return TerrainFeature.Forest;
    }

    return undefined;
  }

  // Assign terrain features to all cells in the terrain map
  // Uses noise to create natural clumps — features are less common overall
  // but cluster together spatially due to Perlin noise coherence
  public generateFeatures(
    terrainMap: Map<string, TerrainData>,
    gridWidth: number,
    gridHeight: number,
  ): void {
    const featureThreshold = 0.15; // Higher = sparser features

    // Determine mountain threshold using the 85th percentile of land elevations
    // This ensures mountains are always the top ~15% of land, regardless of map type
    const landElevations: number[] = [];
    for (const data of terrainMap.values()) {
      const isWater = data.terrain === TT.DeepWaters || data.terrain === TT.Shallows;
      if (!isWater) {
        landElevations.push(data.elevation);
      }
    }
    landElevations.sort((a, b) => a - b);
    const mountainThreshold =
      landElevations.length > 0 ? landElevations[Math.floor(landElevations.length * 0.85)]! : 0.7;

    for (const [key, data] of terrainMap) {
      const feature = this.determineFeature(
        data.terrain,
        data.elevation,
        mountainThreshold,
        data.temperature,
        data.moisture,
      );
      if (!feature) continue;

      // Mountains are already clustered by elevation — no noise filtering needed
      if (feature === TerrainFeature.Mountain) {
        terrainMap.set(key, { ...data, feature });
        continue;
      }

      // Sample noise at this cell's position for spatial clustering
      const parts = key.split(",");
      const x = parseInt(parts[0]!, 10);
      const y = parseInt(parts[1]!, 10);
      const nx = x / gridWidth;
      const ny = y / gridHeight;
      const noise = this.featureNoise.octaveNoise2D(nx * 6, ny * 6, 3, 0.5);

      // Only place feature if noise exceeds threshold (creates clumps)
      if (noise > featureThreshold) {
        terrainMap.set(key, { ...data, feature });
      }
    }
  }

  // Generate rivers flowing downhill from mountain sources
  // Rivers trace gradient descent from mountains to water or local minima
  // Local minima form small lakes (Shallows terrain)
  public generateRivers(
    terrainMap: Map<string, TerrainData>,
    gridWidth: number,
    gridHeight: number,
  ): void {
    const getKey = (x: number, y: number): string => `${x},${y}`;

    const isWater = (terrain: TerrainType): boolean => {
      return terrain === TT.DeepWaters || terrain === TT.Shallows;
    };

    const getNeighbors = (x: number, y: number): Array<{ x: number; y: number }> => {
      const neighbors: Array<{ x: number; y: number }> = [];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          neighbors.push({ x: nx, y: ny });
        }
      }
      return neighbors;
    };

    // Collect all mountain cell keys
    const mountainKeys = new Set<string>();
    for (const [key, data] of terrainMap) {
      if (data.feature === TerrainFeature.Mountain) {
        mountainKeys.add(key);
      }
    }

    if (mountainKeys.size === 0) return;

    // Flood-fill to find clusters of adjacent mountains, pick highest cell per cluster
    const clustered = new Set<string>();
    const sources: Array<{ x: number; y: number; elevation: number }> = [];

    for (const startKey of mountainKeys) {
      if (clustered.has(startKey)) continue;

      // BFS to find all cells in this cluster
      const queue = [startKey];
      let best: { key: string; elevation: number } = {
        key: startKey,
        elevation: terrainMap.get(startKey)!.elevation,
      };

      while (queue.length > 0) {
        const key = queue.shift()!;
        if (clustered.has(key)) continue;
        clustered.add(key);

        const data = terrainMap.get(key)!;
        if (data.elevation > best.elevation) {
          best = { key, elevation: data.elevation };
        }

        // Check cardinal neighbors for more mountain cells
        const parts = key.split(",");
        const cx = parseInt(parts[0]!, 10);
        const cy = parseInt(parts[1]!, 10);
        for (const n of getNeighbors(cx, cy)) {
          const nKey = getKey(n.x, n.y);
          if (!clustered.has(nKey) && mountainKeys.has(nKey)) {
            queue.push(nKey);
          }
        }
      }

      const bestParts = best.key.split(",");
      sources.push({
        x: parseInt(bestParts[0]!, 10),
        y: parseInt(bestParts[1]!, 10),
        elevation: best.elevation,
      });
    }

    const allRiverCells = new Set<string>();

    for (const source of sources) {
      // Trace river path downhill
      let curX = source.x;
      let curY = source.y;
      const path: Array<{ x: number; y: number }> = [];
      const visited = new Set<string>();
      let reachedWater = false;
      let maxSteps = 200;

      while (maxSteps-- > 0) {
        const key = getKey(curX, curY);
        if (visited.has(key)) break;
        visited.add(key);

        const data = terrainMap.get(key);
        if (!data) break;

        // Stop if we reached existing water
        if (isWater(data.terrain) || data.terrain === TT.River) {
          reachedWater = true;
          break;
        }

        // Also stop if we hit an existing river from another path
        if (allRiverCells.has(key)) {
          reachedWater = true; // merging into existing river counts as reaching water
          break;
        }

        path.push({ x: curX, y: curY });

        // Find lowest cardinal neighbor
        const neighbors = getNeighbors(curX, curY);
        let lowest: { x: number; y: number; elevation: number } | null = null;

        for (const n of neighbors) {
          const nKey = getKey(n.x, n.y);
          if (visited.has(nKey)) continue;
          const nData = terrainMap.get(nKey);
          if (!nData) continue;
          if (lowest === null || nData.elevation < lowest.elevation) {
            lowest = { ...n, elevation: nData.elevation };
          }
        }

        // If no lower neighbor, we're at a local minimum
        if (lowest === null || lowest.elevation >= data.elevation) {
          break;
        }

        curX = lowest.x;
        curY = lowest.y;
      }

      // Skip very short rivers (< 3 cells)
      if (path.length < 3) continue;

      // Apply river terrain to path cells (skip the first cell — keep the mountain source)
      for (let j = 1; j < path.length; j++) {
        const cell = path[j]!;
        const key = getKey(cell.x, cell.y);
        const data = terrainMap.get(key);
        if (data) {
          const updated: TerrainData = { ...data, terrain: TT.River };
          // Clear feature on river cells
          delete updated.feature;
          terrainMap.set(key, updated);
          allRiverCells.add(key);
        }
      }

      // Form a lake if we didn't reach water
      if (!reachedWater && path.length > 0) {
        const terminal = path[path.length - 1]!;
        const terminalKey = getKey(terminal.x, terminal.y);
        const terminalData = terrainMap.get(terminalKey);
        if (!terminalData) continue;

        // Convert terminal cell and similar-elevation neighbors to Shallows (lake)
        const lakeElevation = terminalData.elevation;
        const lakeCells = [terminalKey];

        for (const n of getNeighbors(terminal.x, terminal.y)) {
          const nKey = getKey(n.x, n.y);
          const nData = terrainMap.get(nKey);
          if (
            nData &&
            !isWater(nData.terrain) &&
            Math.abs(nData.elevation - lakeElevation) < 0.05
          ) {
            lakeCells.push(nKey);
          }
        }

        for (const lakeKey of lakeCells) {
          const data = terrainMap.get(lakeKey);
          if (data) {
            const updated: TerrainData = { ...data, terrain: TT.Shallows };
            delete updated.feature;
            terrainMap.set(lakeKey, updated);
            allRiverCells.add(lakeKey);
          }
        }
      }
    }
  }
}
