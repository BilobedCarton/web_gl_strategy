const canvas = document.getElementById("canvaselement") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("Could not find canvas element");

console.log("here");

const gl = canvas.getContext("webgl");
if (gl === null) throw new Error("Could not get WebGL context");

gl.viewport(0, 0, canvas.width, canvas.height);

gl.clearColor(0.5, 0.5, 0.5, 1.0);
gl.enable(gl.DEPTH_TEST);
gl.clear(gl.COLOR_BUFFER_BIT);

// Step 1: Create a vertex shader object
const vertexShader = gl.createShader(gl.VERTEX_SHADER);

if (vertexShader === null) throw new Error("Could not establish vertex shader"); // handle possibility of null

// Step 2: Write the vertex shader code
const vertexShaderCode = `
  attribute vec2 coordinates;

  void main(void) {
    gl_Position = vec4(coordinates, 0.0, 1.0);
  }
`;

// Step 3: Attach the shader code to the vertex shader
gl.shaderSource(vertexShader, vertexShaderCode);

// Step 4: Compile the vertex shader
gl.compileShader(vertexShader);

// Step 1: Create a fragment shader object
const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
if (fragmentShader === null) throw new Error("Could not establish fragment shader"); // handle possibility of null

// Step 2: Write the fragment shader code
const fragmentShaderCode = `
  void main(void) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
`;
// Step 3: Attach the shader code to the fragment shader
gl.shaderSource(fragmentShader, fragmentShaderCode);

// Step 4: Compile the fragment shader
gl.compileShader(fragmentShader);

// Step 1: Create a WebGL program instance
const shaderProgram = gl.createProgram();
if (shaderProgram === null) throw new Error("Could not create shader program");

// Step 2: Attach the vertex and fragment shaders to the program
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);

// Step 3: Activate the program as part of the rendering pipeline
gl.useProgram(shaderProgram);

// Step 1: Initialize the array of vertices for our triangle
const vertices = new Float32Array([0.5, -0.5, -0.5, -0.5, 0.0, 0.5]);

// Step 2: Create a new buffer object
const vertex_buffer = gl.createBuffer();

// Step 3: Bind the object to `gl.ARRAY_BUFFER`
gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

// Step 4: Pass the array of vertices to `gl.ARRAY_BUFFER
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

// Step 5: Get the location of the `coordinates` attribute of the vertex shader
const coordinates = gl.getAttribLocation(shaderProgram, "coordinates");
gl.vertexAttribPointer(coordinates, 2, gl.FLOAT, false, 0, 0);

// Step 6: Enable the attribute to receive vertices from the vertex buffer
gl.enableVertexAttribArray(coordinates);

// Step 1: Set the viewport for WebGL in the canvas
gl.viewport(0, 0, canvas.width, canvas.height);

// Step 2: Clear the canvas with gray color
gl.clearColor(0.5, 0.5, 0.5, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

// Step 3: Draw the model on the canvas
gl.drawArrays(gl.TRIANGLES, 0, 3);
