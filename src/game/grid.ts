import type { CellData } from "./cell";

export class Grid {
  private cells: Map<string, CellData>;
  private readonly width: number;
  private readonly height: number;
  private readonly defaultCell: CellData;

  constructor(width: number, height: number, defaultColor: [number, number, number, number]) {
    if (width <= 0 || height <= 0) {
      throw new Error("Grid dimensions must be positive");
    }

    this.width = width;
    this.height = height;
    this.cells = new Map();
    this.defaultCell = { color: defaultColor };
  }

  private getCellKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  public isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  public setCell(x: number, y: number, data: CellData): void {
    if (!this.isInBounds(x, y)) {
      console.warn(`Attempted to set cell at out of bounds position: (${x}, ${y})`);
      return;
    }

    const key = this.getCellKey(x, y);
    this.cells.set(key, data);
  }

  public getCell(x: number, y: number): CellData | null {
    if (!this.isInBounds(x, y)) {
      return null;
    }

    const key = this.getCellKey(x, y);
    return this.cells.get(key) || null;
  }

  public getCellOrDefault(x: number, y: number): CellData {
    if (!this.isInBounds(x, y)) {
      return this.defaultCell;
    }

    const key = this.getCellKey(x, y);
    return this.cells.get(key) || this.defaultCell;
  }

  public clearCell(x: number, y: number): void {
    if (!this.isInBounds(x, y)) {
      return;
    }

    const key = this.getCellKey(x, y);
    this.cells.delete(key);
  }

  public clear(): void {
    this.cells.clear();
  }

  // Generator to iterate over all cells (including default cells)
  public *allCells(): IterableIterator<{ x: number; y: number; data: CellData }> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        yield {
          x,
          y,
          data: this.getCellOrDefault(x, y),
        };
      }
    }
  }

  // Generator to iterate only over modified cells (sparse iteration)
  public *modifiedCells(): IterableIterator<{ x: number; y: number; data: CellData }> {
    for (const [key, data] of this.cells.entries()) {
      const parts = key.split(",");
      const x = parseInt(parts[0]!, 10);
      const y = parseInt(parts[1]!, 10);
      yield { x, y, data };
    }
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  public getDefaultCell(): CellData {
    return this.defaultCell;
  }

  public getModifiedCellCount(): number {
    return this.cells.size;
  }
}
