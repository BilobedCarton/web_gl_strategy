import type { TerrainData } from "./procedural-generator";
import { ElevationType } from "./procedural-generator";
import { TerrainType, TerrainFeature } from "./terrain";

// Movement cost per tile based on terrain
function getMovementCost(data: TerrainData): number {
  // Water is impassable
  if (data.terrain === TerrainType.DeepWaters || data.terrain === TerrainType.Shallows) {
    return Infinity;
  }

  // River tiles are cheap
  if (data.terrain === TerrainType.River) return 0.5;

  // Feature-based costs (mountains are expensive, forests moderate)
  if (data.feature === TerrainFeature.Mountain) return 5;
  if (data.feature === TerrainFeature.Forest) return 2;
  if (data.feature === TerrainFeature.Jungle) return 2;
  if (data.feature === TerrainFeature.Marsh) return 3;

  // Terrain-based costs
  if (data.terrain === TerrainType.Wetlands) return 2;
  if (data.terrain === TerrainType.Coast) return 1;

  // Hills cost more
  if (data.elevationType === ElevationType.Hills) return 3;

  // Plains, Desert, Tundra
  return 1;
}

interface PathNode {
  x: number;
  y: number;
  g: number; // cost from start
  f: number; // g + heuristic
  parent: PathNode | null;
}

export interface PathResult {
  path: Array<{ x: number; y: number }>;
  totalCost: number;
}

export function findPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  terrainMap: Map<string, TerrainData>,
  gridWidth: number,
  gridHeight: number,
): PathResult | null {
  const getKey = (x: number, y: number) => `${x},${y}`;
  const heuristic = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY);

  const open: PathNode[] = [
    { x: startX, y: startY, g: 0, f: heuristic(startX, startY), parent: null },
  ];
  const closed = new Set<string>();
  const gScores = new Map<string, number>();
  gScores.set(getKey(startX, startY), 0);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const current = open[bestIdx]!;
    open.splice(bestIdx, 1);

    if (current.x === endX && current.y === endY) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, totalCost: current.g };
    }

    const currentKey = getKey(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

      const neighborKey = getKey(nx, ny);
      if (closed.has(neighborKey)) continue;

      const neighborData = terrainMap.get(neighborKey);
      if (!neighborData) continue;

      const moveCost = getMovementCost(neighborData);
      if (moveCost === Infinity) continue; // Impassable

      const tentativeG = current.g + moveCost;
      const existingG = gScores.get(neighborKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScores.set(neighborKey, tentativeG);
      open.push({
        x: nx,
        y: ny,
        g: tentativeG,
        f: tentativeG + heuristic(nx, ny),
        parent: current,
      });
    }
  }

  return null; // No path found
}

// Compute link capacity from path cost
export function computeLinkCapacity(pathCost: number): number {
  return Math.max(5, Math.floor(20 / pathCost));
}
