import { ResourceType } from "./resources";

export interface TradeAllocation {
  resource: ResourceType;
  amount: number;
  direction: "a-to-b" | "b-to-a";
}

export interface TradeLink {
  id: string;
  cityA: string; // city id
  cityB: string; // city id
  path: Array<{ x: number; y: number }>; // A* path tiles
  pathCost: number;
  capacity: number; // max goods per turn
  allocations: TradeAllocation[];
}

export interface City {
  id: string;
  name: string;
  position: { x: number; y: number };
  color: [number, number, number, number];
  territoryTiles: Set<string>; // "x,y" keys
  stockpile: Map<ResourceType, number>;
  production: Map<ResourceType, number>; // per-turn output
  receivedResources: Set<ResourceType>; // unique types received via trade
  linkIds: string[];
}

// Distinct city colors
export const CityColors: Array<[number, number, number, number]> = [
  [0.9, 0.2, 0.2, 1.0], // Red
  [0.2, 0.5, 0.9, 1.0], // Blue
  [0.9, 0.7, 0.1, 1.0], // Gold
  [0.2, 0.8, 0.4, 1.0], // Green
  [0.7, 0.3, 0.8, 1.0], // Purple
];

// Fantasy city name pool
export const CityNamePool = [
  "Thornhaven",
  "Mistfall",
  "Ironhollow",
  "Duskport",
  "Ashenmoor",
  "Crystalvale",
  "Stormwatch",
  "Glimmerreach",
  "Frostgate",
  "Windspire",
];

export function createCity(
  id: string,
  name: string,
  x: number,
  y: number,
  color: [number, number, number, number],
): City {
  return {
    id,
    name,
    position: { x, y },
    color,
    territoryTiles: new Set(),
    stockpile: new Map(),
    production: new Map(),
    receivedResources: new Set(),
    linkIds: [],
  };
}
