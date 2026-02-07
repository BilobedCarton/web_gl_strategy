export class Camera {
  private projectionMatrix: Float32Array;
  private viewWidth: number;
  private viewHeight: number;

  constructor(viewWidth: number, viewHeight: number) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.projectionMatrix = new Float32Array(16);
    this.updateProjection();
  }

  private updateProjection(): void {
    // Create orthographic projection matrix
    // Maps world coordinates to normalized device coordinates (NDC)
    // Left: 0, Right: viewWidth, Bottom: 0, Top: viewHeight
    // This gives us a top-down 2D view with (0,0) at top-left
    const left = 0;
    const right = this.viewWidth;
    const bottom = this.viewHeight; // Note: bottom and top are swapped to make Y point down
    const top = 0;
    const near = -1;
    const far = 1;

    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);

    this.projectionMatrix[0] = -2 * lr;
    this.projectionMatrix[1] = 0;
    this.projectionMatrix[2] = 0;
    this.projectionMatrix[3] = 0;

    this.projectionMatrix[4] = 0;
    this.projectionMatrix[5] = -2 * bt;
    this.projectionMatrix[6] = 0;
    this.projectionMatrix[7] = 0;

    this.projectionMatrix[8] = 0;
    this.projectionMatrix[9] = 0;
    this.projectionMatrix[10] = 2 * nf;
    this.projectionMatrix[11] = 0;

    this.projectionMatrix[12] = (left + right) * lr;
    this.projectionMatrix[13] = (top + bottom) * bt;
    this.projectionMatrix[14] = (far + near) * nf;
    this.projectionMatrix[15] = 1;
  }

  public getProjectionMatrix(): Float32Array {
    return this.projectionMatrix;
  }

  public setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.updateProjection();
  }

  public getViewWidth(): number {
    return this.viewWidth;
  }

  public getViewHeight(): number {
    return this.viewHeight;
  }

  // Convert screen coordinates to world coordinates
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX,
      y: screenY,
    };
  }

  // Convert world coordinates to screen coordinates
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX,
      y: worldY,
    };
  }
}
