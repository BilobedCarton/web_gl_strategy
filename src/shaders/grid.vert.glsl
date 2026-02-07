// Quad vertex position (0,0 to 1,1) - same for all instances
attribute vec2 a_quadPosition;

// Per-instance attributes
attribute vec2 a_cellPosition;  // Grid position (x, y)
attribute vec4 a_cellColor;     // RGBA color

// Uniforms
uniform mat4 u_projection;      // Orthographic projection matrix
uniform vec2 u_cellSize;        // Size of each cell in world units

// Varying to pass to fragment shader
varying vec4 v_color;

void main() {
  // Transform quad to world space
  // Cell position is in grid coordinates, quad position is 0-1
  vec2 worldPos = a_cellPosition * u_cellSize + a_quadPosition * u_cellSize;

  // Apply projection matrix
  gl_Position = u_projection * vec4(worldPos, 0.0, 1.0);

  // Pass color to fragment shader
  v_color = a_cellColor;
}
