import { createGLContext } from "./core/gl-context";
import { Camera } from "./core/camera";
import { Grid } from "./game/grid";
import { createCellFromTerrainData, createRandomTerrainCell } from "./game/cell";
import { GridRenderer } from "./rendering/grid-renderer";
import { ProceduralTerrainGenerator, MapType, type TerrainData } from "./game/procedural-generator";
import { getTerrainColor, TerrainFeature } from "./game/terrain";
import { placeCities } from "./game/city-placer";
import { GameState } from "./game/game-state";
import { ResourceType, ResourceNames } from "./game/resources";

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
const gridWidth = 75;
const gridHeight = 75;
const grid = new Grid(gridWidth, gridHeight, [0.5, 0.5, 0.5, 1.0]);

// Create grid renderer
const gridRenderer = new GridRenderer(glContext, gridWidth * gridHeight);
const cellWidth = width / gridWidth;
const cellHeight = height / gridHeight;
gridRenderer.setCellSize(cellWidth, cellHeight);

// Feature overlay canvas (2D canvas layered on top of WebGL canvas)
const overlayCanvas = document.getElementById("overlaycanvas") as HTMLCanvasElement;
const overlayCtx = overlayCanvas.getContext("2d")!;

const FeatureEmojis: Record<TerrainFeature, string> = {
  [TerrainFeature.Forest]: "\u{1F332}",
  [TerrainFeature.Jungle]: "\u{1F334}",
  [TerrainFeature.Marsh]: "\u{1FAB7}",
  [TerrainFeature.Mountain]: "\u{26F0}\u{FE0F}",
};

// UI Elements
const mapTypeSelect = document.getElementById("mapType") as HTMLSelectElement;
const seedInput = document.getElementById("seed") as HTMLInputElement;
const currentSeedDisplay = document.getElementById("currentSeed") as HTMLSpanElement;
const latitudeInput = document.getElementById("latitude") as HTMLInputElement;
const latitudeValue = document.getElementById("latitudeValue") as HTMLSpanElement;
const seaLevelInput = document.getElementById("seaLevel") as HTMLInputElement;
const seaLevelValue = document.getElementById("seaLevelValue") as HTMLSpanElement;
const moistureLevelInput = document.getElementById("moistureLevel") as HTMLInputElement;
const moistureLevelValue = document.getElementById("moistureLevelValue") as HTMLSpanElement;
const viewModeSelect = document.getElementById("viewMode") as HTMLSelectElement;
const regenerateBtn = document.getElementById("regenerate") as HTMLButtonElement;

// Game UI elements
const turnCounter = document.getElementById("turnCounter") as HTMLSpanElement;
const endTurnBtn = document.getElementById("endTurn") as HTMLButtonElement;
const cityListDiv = document.getElementById("cityList") as HTMLDivElement;
const cityDetailDiv = document.getElementById("cityDetail") as HTMLDivElement;
const cityDetailName = document.getElementById("cityDetailName") as HTMLElement;
const cityDetailScore = document.getElementById("cityDetailScore") as HTMLSpanElement;
const cityDetailProduction = document.getElementById("cityDetailProduction") as HTMLDivElement;
const cityDetailStockpile = document.getElementById("cityDetailStockpile") as HTMLDivElement;
const cityDetailLinks = document.getElementById("cityDetailLinks") as HTMLDivElement;
const buildLinkBtn = document.getElementById("buildLinkBtn") as HTMLButtonElement;
const linkBuildModeDiv = document.getElementById("linkBuildMode") as HTMLDivElement;
const linkBuildStatus = document.getElementById("linkBuildStatus") as HTMLDivElement;
const linkBuildPreview = document.getElementById("linkBuildPreview") as HTMLDivElement;
const linkBuildConfirm = document.getElementById("linkBuildConfirm") as HTMLButtonElement;
const linkBuildCancel = document.getElementById("linkBuildCancel") as HTMLButtonElement;

let selectedCityId: string | null = null;
let buildLinkSourceId: string | null = null;
let buildLinkTargetId: string | null = null;

// Current terrain generator
let terrainGenerator: ProceduralTerrainGenerator;

// Game state
let gameState: GameState;

// View mode type
type ViewMode = "terrain" | "elevation" | "moisture" | "temperature";
let currentViewMode: ViewMode = "terrain";

// Generate/regenerate the map
function generateMap(preserveSeed = false) {
  // Get values from UI
  const mapTypeValue = mapTypeSelect.value;
  const seedValue = seedInput.value
    ? parseInt(seedInput.value)
    : preserveSeed
      ? terrainGenerator?.getSeed()
      : undefined;
  const latitudeValue = latitudeInput.value ? parseInt(latitudeInput.value) / 100 : undefined;
  const seaLevelValue = parseInt(seaLevelInput.value) / 100;
  const moistureLevelValue = parseInt(moistureLevelInput.value) / 100;

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

  // Set moisture level
  terrainGenerator.setMoistureModifier(moistureLevelValue);

  // Display the generated seed in the UI
  currentSeedDisplay.textContent = terrainGenerator.getSeed().toString();

  console.log("\n🗺️  Generating new terrain:");
  console.log(`  Seed: ${terrainGenerator.getSeed()}`);
  console.log(`  Map Type: ${terrainGenerator.getMapType()}`);
  console.log(`  Latitude: ${terrainGenerator.getLatitude().toFixed(2)}`);
  console.log(`  Sea Level: ${terrainGenerator.getSeaLevel().toFixed(2)}`);
  console.log(`  Moisture Level: ${terrainGenerator.getMoistureModifier().toFixed(2)}`);

  // Clear existing grid
  grid.clear();

  // First pass: generate all terrain data
  const terrainMap = new Map<string, TerrainData>();

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const terrainData = terrainGenerator.generateTerrainData(x, y, gridWidth, gridHeight);
      terrainMap.set(`${x},${y}`, terrainData);
    }
  }

  // Validate coast terrain connectivity
  terrainGenerator.validateCoastTerrain(terrainMap, gridWidth, gridHeight);

  // Assign terrain features (forests, jungles, marshes, mountains)
  terrainGenerator.generateFeatures(terrainMap, gridWidth, gridHeight);

  // Generate rivers from mountain runoff
  terrainGenerator.generateRivers(terrainMap, gridWidth, gridHeight);

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
        terrainData.feature,
      );

      grid.setCell(x, y, cell);
    }
  }

  // Initialize game state
  gameState = new GameState();
  gameState.terrainMap = terrainMap;
  gameState.gridWidth = gridWidth;
  gameState.gridHeight = gridHeight;
  gameState.cities = placeCities(terrainMap, gridWidth, gridHeight, terrainGenerator.getSeed());

  // Run initial production
  gameState.runProduction();

  // Log city info
  for (const city of gameState.cities) {
    console.log(`\n🏰 ${city.name} at (${city.position.x}, ${city.position.y})`);
    console.log(`   Territory: ${city.territoryTiles.size} tiles`);
    const prodEntries = [...city.production.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`);
    console.log(`   Production: ${prodEntries.join(", ") || "none"}`);
    const stockEntries = [...city.stockpile.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`);
    console.log(`   Stockpile: ${stockEntries.join(", ") || "none"}`);
  }

  // Update renderer with current view mode
  updateGridView();
}

// Render feature emojis on the 2D overlay canvas
function renderFeatureOverlay(): void {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  const fontSize = Math.floor(Math.min(cellWidth, cellHeight) * 0.7);
  overlayCtx.font = `${fontSize}px serif`;
  overlayCtx.textAlign = "center";
  overlayCtx.textBaseline = "middle";

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const cell = grid.getCell(x, y);
      if (cell?.feature) {
        const emoji = FeatureEmojis[cell.feature];
        const px = x * cellWidth + cellWidth / 2;
        const py = y * cellHeight + cellHeight / 2;
        overlayCtx.fillText(emoji, px, py);
      }
    }
  }

  // Render city markers and territory borders
  if (gameState) {
    for (const city of gameState.cities) {
      // Territory border
      overlayCtx.strokeStyle = `rgba(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255}, 0.8)`;
      overlayCtx.lineWidth = 1.5;
      for (const key of city.territoryTiles) {
        const parts = key.split(",");
        const tx = parseInt(parts[0]!, 10);
        const ty = parseInt(parts[1]!, 10);
        const px = tx * cellWidth;
        const py = ty * cellHeight;

        // Draw border only on edges adjacent to non-territory tiles
        const directions = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ] as const;
        for (const [dx, dy] of directions) {
          const neighborKey = `${tx + dx},${ty + dy}`;
          if (!city.territoryTiles.has(neighborKey)) {
            overlayCtx.beginPath();
            if (dx === 0 && dy === -1) {
              overlayCtx.moveTo(px, py);
              overlayCtx.lineTo(px + cellWidth, py);
            }
            if (dx === 1 && dy === 0) {
              overlayCtx.moveTo(px + cellWidth, py);
              overlayCtx.lineTo(px + cellWidth, py + cellHeight);
            }
            if (dx === 0 && dy === 1) {
              overlayCtx.moveTo(px, py + cellHeight);
              overlayCtx.lineTo(px + cellWidth, py + cellHeight);
            }
            if (dx === -1 && dy === 0) {
              overlayCtx.moveTo(px, py);
              overlayCtx.lineTo(px, py + cellHeight);
            }
            overlayCtx.stroke();
          }
        }
      }

      // City marker
      const cx = city.position.x * cellWidth + cellWidth / 2;
      const cy = city.position.y * cellHeight + cellHeight / 2;
      overlayCtx.fillStyle = `rgba(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255}, 1.0)`;
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, cellWidth * 1.5, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.strokeStyle = "white";
      overlayCtx.lineWidth = 1;
      overlayCtx.stroke();

      // City name
      const nameFontSize = Math.max(8, Math.floor(cellWidth * 1.2));
      overlayCtx.font = `bold ${nameFontSize}px sans-serif`;
      overlayCtx.fillStyle = "white";
      overlayCtx.textAlign = "center";
      overlayCtx.textBaseline = "top";
      overlayCtx.fillText(city.name, cx, cy + cellWidth * 2);
    }

    // Render trade links
    for (const link of gameState.links.values()) {
      const cityA = gameState.cities.find((c) => c.id === link.cityA);
      if (!cityA) continue;

      // Draw path
      overlayCtx.strokeStyle = `rgba(${cityA.color[0] * 255}, ${cityA.color[1] * 255}, ${cityA.color[2] * 255}, 0.6)`;
      overlayCtx.lineWidth = 2;
      overlayCtx.beginPath();
      for (let i = 0; i < link.path.length; i++) {
        const px = link.path[i]!.x * cellWidth + cellWidth / 2;
        const py = link.path[i]!.y * cellHeight + cellHeight / 2;
        if (i === 0) overlayCtx.moveTo(px, py);
        else overlayCtx.lineTo(px, py);
      }
      overlayCtx.stroke();

      // Capacity label at midpoint
      if (link.path.length > 1) {
        const mid = link.path[Math.floor(link.path.length / 2)]!;
        const mpx = mid.x * cellWidth + cellWidth / 2;
        const mpy = mid.y * cellHeight + cellHeight / 2;
        const used = link.allocations.reduce((sum, a) => sum + a.amount, 0);
        overlayCtx.fillStyle = "white";
        overlayCtx.font = `bold ${Math.max(8, Math.floor(cellWidth))}px sans-serif`;
        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillText(`${used}/${link.capacity}`, mpx, mpy);
      }
    }
  }
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
    // Restore terrain colors with elevation shading
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid.getCell(x, y);
        if (cell && cell.terrain) {
          const baseColor = getTerrainColor(cell.terrain);

          // Apply elevation-based brightness modulation
          // Elevation 0-1 maps to brightness 0.6-1.2 (darker low, brighter high)
          if (cell.elevation !== undefined) {
            const elevationFactor = 0.6 + cell.elevation * 0.6;
            const color: [number, number, number, number] = [
              Math.min(1.0, baseColor[0] * elevationFactor),
              Math.min(1.0, baseColor[1] * elevationFactor),
              Math.min(1.0, baseColor[2] * elevationFactor),
              baseColor[3],
            ];
            grid.setCell(x, y, { ...cell, color });
          } else {
            grid.setCell(x, y, { ...cell, color: baseColor });
          }
        }
      }
    }
  }

  gridRenderer.updateFromGrid(grid);
  renderFeatureOverlay();
}

// Update latitude value display and regenerate map
latitudeInput.addEventListener("input", () => {
  const value = parseInt(latitudeInput.value);
  latitudeValue.textContent = (value / 100).toFixed(2);
  generateMap(true);
});

// Update sea level value display and regenerate map
seaLevelInput.addEventListener("input", () => {
  const value = parseInt(seaLevelInput.value);
  seaLevelValue.textContent = (value / 100).toFixed(2);
  generateMap(true);
});

// Update moisture level value display and regenerate map
moistureLevelInput.addEventListener("input", () => {
  const value = parseInt(moistureLevelInput.value);
  moistureLevelValue.textContent = (value / 100).toFixed(2);
  generateMap(true);
});

// Handle view mode change
viewModeSelect.addEventListener("change", () => {
  currentViewMode = viewModeSelect.value as ViewMode;
  updateGridView();
});

// Handle regenerate button
regenerateBtn.addEventListener("click", () => {
  generateMap();
  selectedCityId = null;
  exitBuildLinkMode();
  cityDetailDiv.style.display = "none";
  turnCounter.textContent = "1";
  updateCityList();
});

// --- Game UI Functions ---

function updateCityList(): void {
  if (!gameState) return;
  let html = "";
  for (const city of gameState.cities) {
    const score = gameState.getCityScore(city.id);
    const isSelected = city.id === selectedCityId;
    html += `<button class="city-list-btn" data-city-id="${city.id}" style="
      width: 100%; padding: 6px 8px; margin-bottom: 4px; font-size: 12px; text-align: left;
      background: ${isSelected ? "#333" : "#222"}; border: 1px solid ${isSelected ? `rgb(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255})` : "#444"};
      color: #e0e0e0; border-radius: 3px; cursor: pointer;
    ">
      <span style="color: rgb(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255}); font-weight: bold;">${city.name}</span>
      <span style="float: right; color: #888;">Score: ${score}/6</span>
    </button>`;
  }
  cityListDiv.innerHTML = html;

  // Attach click listeners
  cityListDiv.querySelectorAll(".city-list-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cityId = (btn as HTMLElement).dataset.cityId!;
      selectedCityId = cityId;
      showCityDetail(cityId);
      updateCityList();
    });
  });
}

function showCityDetail(cityId: string): void {
  const city = gameState.cities.find((c) => c.id === cityId);
  if (!city) return;

  cityDetailDiv.style.display = "block";
  cityDetailName.textContent = city.name;
  cityDetailName.style.color = `rgb(${city.color[0] * 255}, ${city.color[1] * 255}, ${city.color[2] * 255})`;
  cityDetailScore.textContent = `Score: ${gameState.getCityScore(cityId)}/6`;

  // Production
  const prodHtml =
    [...city.production.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${ResourceNames[resource]}: ${amount}`)
      .join("<br>") || "None";
  cityDetailProduction.innerHTML = prodHtml;

  // Stockpile
  const stockHtml =
    Object.values(ResourceType)
      .map((r) => {
        const amount = city.stockpile.get(r) ?? 0;
        return amount > 0 ? `${ResourceNames[r]}: ${amount}` : null;
      })
      .filter(Boolean)
      .join("<br>") || "Empty";
  cityDetailStockpile.innerHTML = stockHtml;

  // Links with allocation controls
  let linksHtml = "";
  for (const linkId of city.linkIds) {
    const link = gameState.links.get(linkId);
    if (!link) continue;
    const otherCityId = link.cityA === cityId ? link.cityB : link.cityA;
    const otherCity = gameState.cities.find((c) => c.id === otherCityId);
    if (!otherCity) continue;

    const direction = link.cityA === cityId ? "a-to-b" : "b-to-a";
    const used = link.allocations.reduce((sum, a) => sum + a.amount, 0);

    linksHtml += `
      <div style="margin-bottom: 8px; padding: 6px; background: #222; border-radius: 3px">
        <div>\u2192 ${otherCity.name} (${used}/${link.capacity})</div>
        <div style="margin-top: 4px; display: flex; gap: 4px; align-items: center">
          <select data-link-id="${linkId}" data-direction="${direction}" class="trade-resource" style="flex: 1; padding: 2px; font-size: 11px">
            ${Object.values(ResourceType)
              .map((r) => `<option value="${r}">${ResourceNames[r]}</option>`)
              .join("")}
          </select>
          <input type="number" class="trade-amount" data-link-id="${linkId}" min="0" max="${link.capacity}" value="0" style="width: 40px; padding: 2px; font-size: 11px">
          <button class="trade-apply" data-link-id="${linkId}" data-direction="${direction}" style="padding: 2px 6px; font-size: 11px">Set</button>
        </div>
      </div>
    `;
  }
  cityDetailLinks.innerHTML = linksHtml || "No links";

  // Attach event listeners to "Set" buttons
  cityDetailLinks.querySelectorAll(".trade-apply").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lId = (btn as HTMLElement).dataset.linkId!;
      const dir = (btn as HTMLElement).dataset.direction! as "a-to-b" | "b-to-a";
      const container = btn.parentElement!;
      const resourceSelect = container.querySelector(".trade-resource") as HTMLSelectElement;
      const amountInput = container.querySelector(".trade-amount") as HTMLInputElement;

      const resource = resourceSelect.value as ResourceType;
      const amount = parseInt(amountInput.value) || 0;

      gameState.setAllocation(lId, [{ resource, amount, direction: dir }]);
      showCityDetail(cityId); // refresh
      renderFeatureOverlay(); // update link labels
    });
  });

  // Show/hide build link button based on link count
  buildLinkBtn.style.display = city.linkIds.length < 3 ? "block" : "none";
}

function enterBuildLinkMode(sourceCityId: string): void {
  buildLinkSourceId = sourceCityId;
  buildLinkTargetId = null;
  linkBuildModeDiv.style.display = "block";
  linkBuildStatus.textContent = "Click a destination city on the map...";
  linkBuildPreview.textContent = "";
  linkBuildConfirm.style.display = "none";
}

function exitBuildLinkMode(): void {
  buildLinkSourceId = null;
  buildLinkTargetId = null;
  linkBuildModeDiv.style.display = "none";
}

// Build Link button
buildLinkBtn.addEventListener("click", () => {
  if (selectedCityId) enterBuildLinkMode(selectedCityId);
});

// Build Link confirm
linkBuildConfirm.addEventListener("click", () => {
  if (buildLinkSourceId && buildLinkTargetId) {
    const link = gameState.buildLink(buildLinkSourceId, buildLinkTargetId);
    if (link) {
      exitBuildLinkMode();
      if (selectedCityId) showCityDetail(selectedCityId);
      updateCityList();
      renderFeatureOverlay();
    } else {
      linkBuildStatus.textContent = "Build failed! Need 10 Timber + 5 Iron Ore.";
    }
  }
});

// Build Link cancel
linkBuildCancel.addEventListener("click", () => {
  exitBuildLinkMode();
});

// End Turn
endTurnBtn.addEventListener("click", () => {
  gameState.endTurn();
  turnCounter.textContent = String(gameState.turn + 1);
  updateCityList();
  if (selectedCityId) showCityDetail(selectedCityId);
  renderFeatureOverlay();
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

// Canvas click handler — city selection and build link mode
canvas.addEventListener("click", (event: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const gridX = Math.floor(x / cellWidth);
  const gridY = Math.floor(y / cellHeight);

  if (!grid.isInBounds(gridX, gridY)) return;

  // Check if a city is at this position (within 2 tile radius for easier clicking)
  const clickedCity = gameState?.cities.find((c) => {
    const dx = c.position.x - gridX;
    const dy = c.position.y - gridY;
    return dx * dx + dy * dy <= 4;
  });

  if (buildLinkSourceId && clickedCity && clickedCity.id !== buildLinkSourceId) {
    // In build link mode — set target and preview
    buildLinkTargetId = clickedCity.id;
    const preview = gameState.previewLink(buildLinkSourceId, buildLinkTargetId);
    if (preview) {
      linkBuildPreview.textContent = `Cost: ${preview.cost.toFixed(1)} | Capacity: ${preview.capacity}/turn`;
      linkBuildConfirm.style.display = "block";
    } else {
      linkBuildPreview.textContent = "No path found!";
      linkBuildConfirm.style.display = "none";
    }
    return;
  }

  if (clickedCity) {
    selectedCityId = clickedCity.id;
    showCityDetail(clickedCity.id);
    updateCityList();
  } else {
    // Existing terrain info logging
    const currentCell = grid.getCell(gridX, gridY);
    if (currentCell) {
      console.log(
        `Cell (${gridX}, ${gridY}): ${currentCell.terrain}, elev=${currentCell.elevation?.toFixed(3)}`,
      );
    }
  }
});

// Generate initial map
generateMap();
updateCityList();
