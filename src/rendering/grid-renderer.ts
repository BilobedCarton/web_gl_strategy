import { ShaderProgram } from "../core/shader-program";
import { BufferManager } from "./buffer-manager";
import type { Camera } from "../core/camera";
import type { Grid } from "../game/grid";
import type { GLContext } from "../core/gl-context";
import gridVertexShader from "../shaders/grid.vert.glsl?raw";
import gridFragmentShader from "../shaders/grid.frag.glsl?raw";

export class GridRenderer {
  private readonly glContext: GLContext;
  private readonly gl: WebGLRenderingContext;
  private readonly shaderProgram: ShaderProgram;
  private readonly bufferManager: BufferManager;

  // Static buffers for quad geometry
  private quadVBO: WebGLBuffer;
  private quadIBO: WebGLBuffer;

  // Dynamic buffer for instance data
  private instanceVBO: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount: number = 0;
  private maxInstances: number;

  // Attribute locations
  private attrQuadPosition: number;
  private attrCellPosition: number;
  private attrCellColor: number;

  // Cell rendering size
  private cellSize: [number, number] = [1.0, 1.0];

  constructor(glContext: GLContext, maxGridSize: number = 10000) {
    this.glContext = glContext;
    this.gl = glContext.gl;
    this.bufferManager = new BufferManager(this.gl);

    // Check for instanced arrays support
    if (!glContext.hasInstancedArrays()) {
      throw new Error("Instanced rendering is required but not supported");
    }

    // Create shader program
    this.shaderProgram = new ShaderProgram(this.gl, gridVertexShader, gridFragmentShader);

    // Get attribute locations
    this.attrQuadPosition = this.shaderProgram.getAttributeLocation("a_quadPosition");
    this.attrCellPosition = this.shaderProgram.getAttributeLocation("a_cellPosition");
    this.attrCellColor = this.shaderProgram.getAttributeLocation("a_cellColor");

    // Create static quad geometry
    this.quadVBO = this.createQuadBuffer();
    this.quadIBO = this.createQuadIndexBuffer();

    // Create instance buffer
    this.maxInstances = maxGridSize;
    this.instanceData = new Float32Array(this.maxInstances * 6); // 6 floats per instance: x, y, r, g, b, a
    this.instanceVBO = this.bufferManager.createDynamicBuffer(
      this.instanceData,
      this.gl.ARRAY_BUFFER,
    );
  }

  private createQuadBuffer(): WebGLBuffer {
    // Quad vertices: (0,0) to (1,1)
    const quadVertices = new Float32Array([
      0.0,
      0.0, // Bottom-left
      1.0,
      0.0, // Bottom-right
      1.0,
      1.0, // Top-right
      0.0,
      1.0, // Top-left
    ]);

    return this.bufferManager.createStaticBuffer(quadVertices, this.gl.ARRAY_BUFFER);
  }

  private createQuadIndexBuffer(): WebGLBuffer {
    // Two triangles to form a quad
    const indices = new Uint16Array([
      0,
      1,
      2, // First triangle
      2,
      3,
      0, // Second triangle
    ]);

    return this.bufferManager.createStaticBuffer(indices, this.gl.ELEMENT_ARRAY_BUFFER);
  }

  public setCellSize(width: number, height: number): void {
    this.cellSize = [width, height];
  }

  public updateFromGrid(grid: Grid): void {
    let index = 0;

    // Iterate through all cells and pack instance data
    for (const cell of grid.allCells()) {
      if (index >= this.maxInstances) {
        console.warn("Grid size exceeds maximum instance count");
        break;
      }

      const offset = index * 6;

      // Position (x, y)
      this.instanceData[offset + 0] = cell.x;
      this.instanceData[offset + 1] = cell.y;

      // Color (r, g, b, a)
      this.instanceData[offset + 2] = cell.data.color[0];
      this.instanceData[offset + 3] = cell.data.color[1];
      this.instanceData[offset + 4] = cell.data.color[2];
      this.instanceData[offset + 5] = cell.data.color[3];

      index++;
    }

    this.instanceCount = index;

    // Update GPU buffer
    if (this.instanceCount > 0) {
      const dataToUpload = this.instanceData.subarray(0, this.instanceCount * 6);
      this.bufferManager.updateBuffer(this.instanceVBO, dataToUpload, this.gl.ARRAY_BUFFER);
    }
  }

  public render(camera: Camera): void {
    if (this.instanceCount === 0) {
      return; // Nothing to render
    }

    // Use shader program
    this.shaderProgram.use();

    // Set uniforms
    this.shaderProgram.setUniformMatrix4fv("u_projection", camera.getProjectionMatrix());
    this.shaderProgram.setUniform2fv("u_cellSize", this.cellSize);

    // Bind quad vertex buffer
    this.bufferManager.bindBuffer(this.quadVBO, this.gl.ARRAY_BUFFER);
    this.gl.vertexAttribPointer(this.attrQuadPosition, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.enableVertexAttribArray(this.attrQuadPosition);
    this.glContext.vertexAttribDivisor(this.attrQuadPosition, 0); // 0 = per vertex

    // Bind instance buffer
    this.bufferManager.bindBuffer(this.instanceVBO, this.gl.ARRAY_BUFFER);

    // Configure cell position attribute (per instance)
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT; // 6 floats per instance
    this.gl.vertexAttribPointer(
      this.attrCellPosition,
      2,
      this.gl.FLOAT,
      false,
      stride,
      0, // offset for x, y
    );
    this.gl.enableVertexAttribArray(this.attrCellPosition);
    this.glContext.vertexAttribDivisor(this.attrCellPosition, 1); // 1 = per instance

    // Configure cell color attribute (per instance)
    this.gl.vertexAttribPointer(
      this.attrCellColor,
      4,
      this.gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT, // offset for r, g, b, a
    );
    this.gl.enableVertexAttribArray(this.attrCellColor);
    this.glContext.vertexAttribDivisor(this.attrCellColor, 1); // 1 = per instance

    // Bind index buffer
    this.bufferManager.bindBuffer(this.quadIBO, this.gl.ELEMENT_ARRAY_BUFFER);

    // Draw instanced
    this.glContext.drawElementsInstanced(
      this.gl.TRIANGLES,
      6, // 6 indices per quad
      this.gl.UNSIGNED_SHORT,
      0,
      this.instanceCount,
    );

    // Clean up
    this.gl.disableVertexAttribArray(this.attrQuadPosition);
    this.gl.disableVertexAttribArray(this.attrCellPosition);
    this.gl.disableVertexAttribArray(this.attrCellColor);
  }

  public dispose(): void {
    this.bufferManager.deleteBuffer(this.quadVBO);
    this.bufferManager.deleteBuffer(this.quadIBO);
    this.bufferManager.deleteBuffer(this.instanceVBO);
    this.shaderProgram.dispose();
  }
}
