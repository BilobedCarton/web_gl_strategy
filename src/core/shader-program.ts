export class ShaderCompilationError extends Error {
  constructor(
    message: string,
    public readonly shaderType: string,
    public readonly log: string,
  ) {
    super(message);
    this.name = "ShaderCompilationError";
  }
}

export class ProgramLinkError extends Error {
  constructor(
    message: string,
    public readonly log: string,
  ) {
    super(message);
    this.name = "ProgramLinkError";
  }
}

export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error(`Failed to create shader of type ${type}`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  if (!success) {
    const log = gl.getShaderInfoLog(shader) || "Unknown error";
    gl.deleteShader(shader);
    const shaderTypeName = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    throw new ShaderCompilationError(
      `Failed to compile ${shaderTypeName} shader: ${log}`,
      shaderTypeName,
      log,
    );
  }

  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create shader program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  if (!success) {
    const log = gl.getProgramInfoLog(program) || "Unknown error";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new ProgramLinkError(`Failed to link shader program: ${log}`, log);
  }

  // Clean up shaders after successful link (they're no longer needed)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

export class ShaderProgram {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly attributes: Map<string, number> = new Map();
  private readonly uniforms: Map<string, WebGLUniformLocation> = new Map();

  constructor(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
    this.gl = gl;
    this.program = createProgram(gl, vertexSource, fragmentSource);
  }

  public use(): void {
    this.gl.useProgram(this.program);
  }

  public getProgram(): WebGLProgram {
    return this.program;
  }

  // Attribute methods
  public getAttributeLocation(name: string): number {
    if (this.attributes.has(name)) {
      return this.attributes.get(name)!;
    }

    const location = this.gl.getAttribLocation(this.program, name);
    if (location === -1) {
      console.warn(`Attribute '${name}' not found in shader program`);
    }
    this.attributes.set(name, location);
    return location;
  }

  public enableAttribute(name: string): void {
    const location = this.getAttributeLocation(name);
    if (location !== -1) {
      this.gl.enableVertexAttribArray(location);
    }
  }

  public disableAttribute(name: string): void {
    const location = this.getAttributeLocation(name);
    if (location !== -1) {
      this.gl.disableVertexAttribArray(location);
    }
  }

  // Uniform methods
  public getUniformLocation(name: string): WebGLUniformLocation | null {
    if (this.uniforms.has(name)) {
      return this.uniforms.get(name)!;
    }

    const location = this.gl.getUniformLocation(this.program, name);
    if (location === null) {
      console.warn(`Uniform '${name}' not found in shader program`);
      return null;
    }
    this.uniforms.set(name, location);
    return location;
  }

  public setUniform1f(name: string, value: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform1f(location, value);
    }
  }

  public setUniform2f(name: string, x: number, y: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform2f(location, x, y);
    }
  }

  public setUniform3f(name: string, x: number, y: number, z: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform3f(location, x, y, z);
    }
  }

  public setUniform4f(name: string, x: number, y: number, z: number, w: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform4f(location, x, y, z, w);
    }
  }

  public setUniform1i(name: string, value: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform1i(location, value);
    }
  }

  public setUniformMatrix4fv(name: string, value: Float32Array): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniformMatrix4fv(location, false, value);
    }
  }

  public setUniform2fv(name: string, value: Float32Array | number[]): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform2fv(location, value);
    }
  }

  public dispose(): void {
    this.gl.deleteProgram(this.program);
    this.attributes.clear();
    this.uniforms.clear();
  }
}
