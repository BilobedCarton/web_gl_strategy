export class BufferManager {
  private readonly gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
  }

  public createStaticBuffer(data: Float32Array | Uint16Array, target: number): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (buffer === null) {
      throw new Error("Failed to create buffer");
    }

    this.gl.bindBuffer(target, buffer);
    this.gl.bufferData(target, data, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(target, null); // Unbind

    return buffer;
  }

  public createDynamicBuffer(data: Float32Array | Uint16Array, target: number): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (buffer === null) {
      throw new Error("Failed to create buffer");
    }

    this.gl.bindBuffer(target, buffer);
    this.gl.bufferData(target, data, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(target, null); // Unbind

    return buffer;
  }

  public updateBuffer(
    buffer: WebGLBuffer,
    data: Float32Array | Uint16Array,
    target: number,
    offset: number = 0,
  ): void {
    this.gl.bindBuffer(target, buffer);
    if (offset === 0) {
      // Replace entire buffer contents
      this.gl.bufferData(target, data, this.gl.DYNAMIC_DRAW);
    } else {
      // Update partial buffer
      this.gl.bufferSubData(target, offset, data);
    }
    this.gl.bindBuffer(target, null); // Unbind
  }

  public deleteBuffer(buffer: WebGLBuffer): void {
    this.gl.deleteBuffer(buffer);
  }

  public bindBuffer(buffer: WebGLBuffer, target: number): void {
    this.gl.bindBuffer(target, buffer);
  }

  public unbindBuffer(target: number): void {
    this.gl.bindBuffer(target, null);
  }
}
