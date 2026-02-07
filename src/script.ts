import { createGLContext } from "./core/gl-context";
import { Camera } from "./core/camera";
import { Grid } from "./game/grid";
import { createCellFromTerrainData, createRandomTerrainCell } from "./game/cell";
import { GridRenderer } from "./rendering/grid-renderer";
import { ProceduralTerrainGenerator } from "./game/procedural-generator";

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

// Create grid (50x50 cells for more interesting terrain)
const gridWidth = 50;
const gridHeight = 50;
const grid = new Grid(gridWidth, gridHeight, [0.5, 0.5, 0.5, 1.0]); // Default gray

// Create procedural terrain generator
const terrainGenerator = new ProceduralTerrainGenerator();
console.log(`Generating terrain with latitude: ${terrainGenerator.getLatitude().toFixed(2)}`);

// Populate grid with procedurally generated terrain
for (let y = 0; y < gridHeight; y++) {
  for (let x = 0; x < gridWidth; x++) {
    const terrainData = terrainGenerator.generateTerrainData(x, y, gridWidth, gridHeight);

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

// Create grid renderer
const gridRenderer = new GridRenderer(glContext, gridWidth * gridHeight);

// Set cell size to fill the canvas
const cellWidth = width / gridWidth;
const cellHeight = height / gridHeight;
gridRenderer.setCellSize(cellWidth, cellHeight);

// Update renderer with grid data
gridRenderer.updateFromGrid(grid);

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

    // Set cell to random terrain type
    const newCell = createRandomTerrainCell();
    grid.setCell(gridX, gridY, newCell);

    // Update renderer with new grid data
    gridRenderer.updateFromGrid(grid);

    console.log(`→ Changed to: ${newCell.terrain}`);
  }
});

console.log("\n🗺️  Grid-based strategy game initialized!");
console.log("📊 Procedural terrain generation complete");
console.log("   - Perlin noise elevation");
console.log("   - Temperature based on latitude");
console.log("   - Moisture/watershed calculation");
console.log("   - 7 terrain types (DeepWaters, Shallows, Coast, Plains, Wetlands, Tundra, Desert)");
console.log("   - 6 elevation types (DeepOcean, Ocean, Flat, Hills, Valley, Mountain)");
console.log("\n💡 Click any cell to see detailed terrain info and change terrain type!\n");
