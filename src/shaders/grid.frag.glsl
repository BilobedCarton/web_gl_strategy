precision mediump float;

// Interpolated color from vertex shader
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
