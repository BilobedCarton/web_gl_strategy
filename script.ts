const canvas = document.getElementById(
  "canvaselement",
) as HTMLCanvasElement | null;
if (canvas === null) throw new Error("Could not find canvas element");

const gl = canvas.getContext("webgl");
if (gl === null) throw new Error("Could not get WebGL context");
