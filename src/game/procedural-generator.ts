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
  Continent = "continent", // Large mainland with varied coasts
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

      case MapType.Continent: {
        // Large landmass with varied coastlines
        const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
        const coastalFactor = Math.min(1, edgeDistance * 3);
        return elevation * (0.3 + coastalFactor * 0.7);
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
    // Base temperature from latitude (distance from equator)
    const latitudeFactor = Math.abs(y / gridHeight - 0.5) * 2; // 0 at equator, 1 at poles
    let temperature = 1 - (latitudeFactor * 0.7 + this.latitude * 0.3);

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
}
