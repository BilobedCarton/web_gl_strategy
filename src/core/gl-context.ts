export interface GLContextOptions {
  alpha?: boolean;
  depth?: boolean;
  stencil?: boolean;
  antialias?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
}

export class GLContext {
  public readonly gl: WebGLRenderingContext;
  public readonly canvas: HTMLCanvasElement;
  private instancedArraysExt: ANGLE_instanced_arrays | null = null;

  constructor(canvasId: string, options: GLContextOptions = {}) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (canvas === null) {
      throw new Error(`Could not find canvas element with id: ${canvasId}`);
    }

    const gl = canvas.getContext("webgl", {
      alpha: options.alpha ?? true,
      depth: options.depth ?? true,
      stencil: options.stencil ?? false,
      antialias: options.antialias ?? true,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });

    if (gl === null) {
      throw new Error("WebGL is not supported in this browser");
    }

    this.canvas = canvas;
    this.gl = gl;

    // Setup viewport
    this.setViewport(0, 0, canvas.width, canvas.height);

    // Enable depth testing by default
    this.gl.enable(this.gl.DEPTH_TEST);

    // Check for instanced arrays extension
    this.instancedArraysExt = this.gl.getExtension("ANGLE_instanced_arrays");
    if (!this.instancedArraysExt) {
      console.warn(
        "ANGLE_instanced_arrays extension not supported. Instanced rendering will not work.",
      );
    }
  }

  public setViewport(x: number, y: number, width: number, height: number): void {
    this.gl.viewport(x, y, width, height);
  }

  public setClearColor(r: number, g: number, b: number, a: number): void {
    this.gl.clearColor(r, g, b, a);
  }

  public clear(mask: number = this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT): void {
    this.gl.clear(mask);
  }

  public getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  public resizeCanvas(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.setViewport(0, 0, width, height);
  }

  // Instanced rendering methods (wrapper for extension)
  public drawArraysInstanced(
    mode: number,
    first: number,
    count: number,
    instanceCount: number,
  ): void {
    if (this.instancedArraysExt) {
      this.instancedArraysExt.drawArraysInstancedANGLE(mode, first, count, instanceCount);
    } else {
      throw new Error("Instanced rendering not supported");
    }
  }

  public drawElementsInstanced(
    mode: number,
    count: number,
    type: number,
    offset: number,
    instanceCount: number,
  ): void {
    if (this.instancedArraysExt) {
      this.instancedArraysExt.drawElementsInstancedANGLE(mode, count, type, offset, instanceCount);
    } else {
      throw new Error("Instanced rendering not supported");
    }
  }

  public vertexAttribDivisor(index: number, divisor: number): void {
    if (this.instancedArraysExt) {
      this.instancedArraysExt.vertexAttribDivisorANGLE(index, divisor);
    } else {
      throw new Error("Instanced rendering not supported");
    }
  }

  // Check if extension is supported
  public hasInstancedArrays(): boolean {
    return this.instancedArraysExt !== null;
  }
}

// Utility function for quick setup
export function createGLContext(canvasId: string, options?: GLContextOptions): GLContext {
  return new GLContext(canvasId, options);
}
