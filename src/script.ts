import { createGLContext } from "./core/gl-context";
import { Camera } from "./core/camera";
import { Grid } from "./game/grid";
import { createCell } from "./game/cell";
import { GridRenderer } from "./rendering/grid-renderer";

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

// Create grid (20x20 cells)
const gridWidth = 20;
const gridHeight = 20;
const grid = new Grid(gridWidth, gridHeight, [0.2, 0.2, 0.2, 1.0]); // Default dark gray

// Populate grid with a checkerboard pattern
for (let y = 0; y < gridHeight; y++) {
  for (let x = 0; x < gridWidth; x++) {
    const isEvenRow = y % 2 === 0;
    const isEvenCol = x % 2 === 0;
    const isWhite = isEvenRow === isEvenCol;

    if (isWhite) {
      grid.setCell(x, y, createCell(0.8, 0.8, 0.8, 1.0)); // Light gray
    } else {
      grid.setCell(x, y, createCell(0.3, 0.3, 0.3, 1.0)); // Dark gray
    }
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
    // Set cell to random color
    const randomColor = createCell(Math.random(), Math.random(), Math.random(), 1.0);
    grid.setCell(gridX, gridY, randomColor);

    // Update renderer with new grid data
    gridRenderer.updateFromGrid(grid);

    console.log(`Cell (${gridX}, ${gridY}) updated to color:`, randomColor.color);
  }
});

console.log("Grid-based strategy game initialized!");
console.log("Click on cells to change their colors!");
