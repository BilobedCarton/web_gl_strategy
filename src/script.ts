import { createGLContext } from "./core/gl-context";
import { Camera } from "./core/camera";
import { Grid } from "./game/grid";
import { createCellFromTerrainData, createRandomTerrainCell } from "./game/cell";
import { GridRenderer } from "./rendering/grid-renderer";
import { ProceduralTerrainGenerator, MapType } from "./game/procedural-generator";
import { getTerrainColor } from "./game/terrain";

// Initialize WebGL context
const glContext = createGLContext("canvaselement", {
  alpha: false,
  depth: true,
  antialias: true,
});

const { gl, canvas } = glContext;

// Set clear color to dark gray
glContext.setClearColor(0.1, 0.1, 0.1, 1.0);

// Get canvas size
const { width, height } = glContext.getCanvasSize();

// Create camera with view matching canvas size
const camera = new Camera(width, height);

// Grid configuration
const gridWidth = 50;
const gridHeight = 50;
const grid = new Grid(gridWidth, gridHeight, [0.5, 0.5, 0.5, 1.0]);

// Create grid renderer
const gridRenderer = new GridRenderer(glContext, gridWidth * gridHeight);
const cellWidth = width / gridWidth;
const cellHeight = height / gridHeight;
gridRenderer.setCellSize(cellWidth, cellHeight);

// UI Elements
const mapTypeSelect = document.getElementById("mapType") as HTMLSelectElement;
const seedInput = document.getElementById("seed") as HTMLInputElement;
const latitudeInput = document.getElementById("latitude") as HTMLInputElement;
const latitudeValue = document.getElementById("latitudeValue") as HTMLSpanElement;
const seaLevelInput = document.getElementById("seaLevel") as HTMLInputElement;
const seaLevelValue = document.getElementById("seaLevelValue") as HTMLSpanElement;
const viewModeSelect = document.getElementById("viewMode") as HTMLSelectElement;
const regenerateBtn = document.getElementById("regenerate") as HTMLButtonElement;

// Current terrain generator
let terrainGenerator: ProceduralTerrainGenerator;

// View mode type
type ViewMode = "terrain" | "elevation" | "moisture" | "temperature";
let currentViewMode: ViewMode = "terrain";

// Generate/regenerate the map
function generateMap() {
  // Get values from UI
  const mapTypeValue = mapTypeSelect.value;
  const seedValue = seedInput.value ? parseInt(seedInput.value) : undefined;
  const latitudeValue = latitudeInput.value ? parseInt(latitudeInput.value) / 100 : undefined;
  const seaLevelValue = parseInt(seaLevelInput.value) / 100;

  // Determine map type
  let mapType: MapType | undefined;
  if (mapTypeValue !== "random") {
    mapType = mapTypeValue as MapType;
  } else if (terrainGenerator) {
    // If "random" is selected and we already have a generator, preserve its map type
    mapType = terrainGenerator.getMapType();
  }

  // Create terrain generator with custom settings
  terrainGenerator = new ProceduralTerrainGenerator(seedValue, mapType, seaLevelValue);

  // Override latitude if specified
  if (latitudeValue !== undefined) {
    terrainGenerator.setLatitude(latitudeValue);
  }

  // Display the generated seed in the UI
  seedInput.value = terrainGenerator.getSeed().toString();

  console.log("\n🗺️  Generating new terrain:");
  console.log(`  Seed: ${terrainGenerator.getSeed()}`);
  console.log(`  Map Type: ${terrainGenerator.getMapType()}`);
  console.log(`  Latitude: ${terrainGenerator.getLatitude().toFixed(2)}`);
  console.log(`  Sea Level: ${terrainGenerator.getSeaLevel().toFixed(2)}`);

  // Clear existing grid
  grid.clear();

  // First pass: generate all terrain data
  const terrainMap = new Map<
    string,
    {
      terrain: import("./game/terrain").TerrainType;
      elevation: number;
      elevationType: import("./game/procedural-generator").ElevationType;
      temperature: number;
      moisture: number;
    }
  >();

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const terrainData = terrainGenerator.generateTerrainData(x, y, gridWidth, gridHeight);
      terrainMap.set(`${x},${y}`, terrainData);
    }
  }

  // Generate rivers
  terrainGenerator.generateRivers(terrainMap, gridWidth, gridHeight);

  // Validate coast terrain connectivity
  terrainGenerator.validateCoastTerrain(terrainMap, gridWidth, gridHeight);

  // Populate grid with validated terrain
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const terrainData = terrainMap.get(`${x},${y}`)!;

      const cell = createCellFromTerrainData(
        terrainData.terrain,
        terrainData.elevation,
        terrainData.elevationType,
        terrainData.temperature,
        terrainData.moisture,
      );

      grid.setCell(x, y, cell);
    }
  }

  // Update renderer with current view mode
  updateGridView();
}

// Update grid visualization based on current view mode
function updateGridView(): void {
  if (currentViewMode === "elevation") {
    // Update colors to show elevation (grayscale)
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid.getCell(x, y);
        if (cell && cell.elevation !== undefined) {
          // Map elevation (0-1) to grayscale (black to white)
          const brightness = cell.elevation;
          const color: [number, number, number, number] = [brightness, brightness, brightness, 1.0];
          grid.setCell(x, y, { ...cell, color });
        }
      }
    }
  } else if (currentViewMode === "moisture") {
    // Update colors to show moisture (white to blue)
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid.getCell(x, y);
        if (cell && cell.moisture !== undefined) {
          // Map moisture (0-1) to white-to-blue gradient
          // 0 = white (dry), 1 = blue (wet)
          const moistureLevel = cell.moisture;
          const r = 1.0 - moistureLevel * 0.8; // 1.0 to 0.2
          const g = 1.0 - moistureLevel * 0.5; // 1.0 to 0.5
          const b = 1.0; // Always 1.0
          const color: [number, number, number, number] = [r, g, b, 1.0];
          grid.setCell(x, y, { ...cell, color });
        }
      }
    }
  } else if (currentViewMode === "temperature") {
    // Update colors to show temperature (blue to red)
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid.getCell(x, y);
        if (cell && cell.temperature !== undefined) {
          // Map temperature (0-1) to blue-to-red gradient
          // 0 = blue (cold), 1 = red (hot)
          const temp = cell.temperature;
          const r = temp; // 0.0 to 1.0
          const g = 0.0; // Keep at 0 for pure blue-to-red
          const b = 1.0 - temp; // 1.0 to 0.0
          const color: [number, number, number, number] = [r, g, b, 1.0];
          grid.setCell(x, y, { ...cell, color });
        }
      }
    }
  } else {
    // Restore terrain colors
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid.getCell(x, y);
        if (cell && cell.terrain) {
          const terrainColor = getTerrainColor(cell.terrain);
          grid.setCell(x, y, { ...cell, color: terrainColor });
        }
      }
    }
  }

  gridRenderer.updateFromGrid(grid);
}

// Update latitude value display and regenerate map
latitudeInput.addEventListener("input", () => {
  const value = parseInt(latitudeInput.value);
  latitudeValue.textContent = (value / 100).toFixed(2);
  generateMap();
});

// Update sea level value display and regenerate map
seaLevelInput.addEventListener("input", () => {
  const value = parseInt(seaLevelInput.value);
  seaLevelValue.textContent = (value / 100).toFixed(2);
  generateMap();
});

// Handle view mode change
viewModeSelect.addEventListener("change", () => {
  currentViewMode = viewModeSelect.value as ViewMode;
  updateGridView();
});

// Handle regenerate button
regenerateBtn.addEventListener("click", () => {
  generateMap();
});

// Game loop
function render(): void {
  // Clear the canvas
  glContext.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Render the grid
  gridRenderer.render(camera);

  // Request next frame
  requestAnimationFrame(render);
}

// Start the render loop
render();

// Add mouse click handler for interactive demo
canvas.addEventListener("click", (event: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Convert screen coordinates to grid coordinates
  const gridX = Math.floor(x / cellWidth);
  const gridY = Math.floor(y / cellHeight);

  // Check if click is within grid bounds
  if (grid.isInBounds(gridX, gridY)) {
    // Get current cell to show detailed info
    const currentCell = grid.getCell(gridX, gridY);
    if (currentCell) {
      console.log(`\n=== Cell (${gridX}, ${gridY}) ===`);
      console.log(`Terrain: ${currentCell.terrain}`);
      console.log(`Elevation: ${currentCell.elevation?.toFixed(3)} (${currentCell.elevationType})`);
      console.log(`Temperature: ${currentCell.temperature?.toFixed(3)}`);
      console.log(`Moisture: ${currentCell.moisture?.toFixed(3)}`);
    }
  }
});

// Generate initial map
generateMap();

console.log("\n🗺️  Grid-based strategy game initialized!");
console.log("📊 Procedural terrain generation complete");
console.log("   - Perlin noise elevation with configurable sea level");
console.log("   - Temperature based on latitude");
console.log("   - Moisture/watershed calculation");
console.log("   - River generation from high elevations");
console.log("   - 5 map types (Island, Inland, Peninsula, Archipelago, Coastal)");
console.log(
  "   - 8 terrain types (DeepWaters, Shallows, River, Coast, Plains, Wetlands, Tundra, Desert)",
);
console.log("   - 3 land elevation types (Flat, Hills, Mountain)");
console.log("\n💡 Click any cell to see detailed terrain info!");
console.log("🎮 Use the controls panel to customize map generation!\n");
