'use strict';

let gl;          // The WebGL rendering context
let surface;     // A 'Model' object for our surface geometry
let shProgram;   // The compiled & linked shader program
let spaceball;   // Object to handle trackball-like rotation (user interaction)

// Light rotation angle around the Z-axis
let lightAngle = 0.0;

/**
 * A small wrapper object around a compiled and linked GLSL program.
 * Holds references to attribute/uniform locations, so we don't need
 * repeated lookups.
 */
function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;

    // -- Attributes --
    // aPosition and aNormal are inputs to the vertex shader
    this.iAttribVertex = gl.getAttribLocation(program, "aPosition");
    this.iAttribNormal = gl.getAttribLocation(program, "aNormal");

    // -- Uniforms --
    // Matrices
    this.iModelViewMatrix = gl.getUniformLocation(program, "uModelViewMatrix");
    this.iProjectionMatrix = gl.getUniformLocation(program, "uProjectionMatrix");
    this.iNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");

    // Lighting
    this.iLightPos = gl.getUniformLocation(program, "uLightPos");

    // Material/Lighting factors
    this.iColor = gl.getUniformLocation(program, "uColor");
    this.iAmbientFactor = gl.getUniformLocation(program, "uAmbientFactor");
    this.iDiffuseFactor = gl.getUniformLocation(program, "uDiffuseFactor");
    this.iSpecularFactor = gl.getUniformLocation(program, "uSpecularFactor");
    this.iShininess = gl.getUniformLocation(program, "uShininess");

    /**
     * Helper function to set this shader as the active program,
     * i.e. to call `gl.useProgram(...)`.
     */
    this.Use = function () {
        gl.useProgram(this.prog);
    };
}

/**
 * This function is called continuously via `requestAnimationFrame(draw)`.
 * It handles:
 *   1) Clearing the screen
 *   2) Setting up camera and lighting uniforms
 *   3) Drawing the surface geometry
 *   4) Requesting another frame to animate
 */
function draw() {
    // Clear color and depth buffers
    gl.clearColor(10 / 255, 10 / 255, 10 / 255, 1.0); // grayish background
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Prepare a perspective projection matrix.
    //   fov = π/8 (22.5 degrees),
    //   aspect = 1 (square viewport),
    //   near = 8, far = 12
    let projection = m4.perspective(Math.PI / 8, 1, 8, 12);

    // Get the current trackball-based view transformation
    let modelView = spaceball.getViewMatrix();

    // Translate the entire scene backwards, so the object is in front of the camera
    let translateToPointZero = m4.translation(0, 0, -10);
    modelView = m4.multiply(translateToPointZero, modelView);

    // Compute the normal matrix = (modelView^-1)^T
    //  used to properly transform normals under rotation/scaling
    let normalMatrix = m4.inverse(modelView);
    normalMatrix = m4.transpose(normalMatrix);

    // ---- Pass the transformation matrices to the GPU ----
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);
    gl.uniformMatrix4fv(shProgram.iNormalMatrix, false, normalMatrix);

    // Animate the light by rotating around Z-axis
    // Increase angle each frame
    lightAngle += 0.005;
    // Keep angle in [0, 2π)
    lightAngle %= 2.0 * Math.PI;

    // Convert polar coords to Cartesian for the light
    let radius = 30.0;
    let lx = radius * Math.cos(lightAngle);
    let ly = radius * Math.sin(lightAngle);
    let lz = -20.0;  // a constant vertical offset
    gl.uniform3fv(shProgram.iLightPos, [lx, ly, lz]);

    // Set some material parameters for lighting
    // Here we just fix them, but you could expose them in a UI
    gl.uniform4fv(shProgram.iColor, [255 / 255, 0 / 255, 255 / 255, 1.0]); // a gold color
    gl.uniform1f(shProgram.iAmbientFactor, 0.2);
    gl.uniform1f(shProgram.iDiffuseFactor, 0.6);
    gl.uniform1f(shProgram.iSpecularFactor, 0.8);
    gl.uniform1f(shProgram.iShininess, 20.0);

    // Draw the surface geometry (created in model.js)
    // This triggers gl.drawElements(...) with the current buffers
    surface.Draw();

    // Request another frame for continuous animation
    requestAnimationFrame(draw);
}

/**
 * Called once at startup. Sets up shaders, buffers, and basic GL settings.
 */
function initGL() {
    // 1) Create and compile the vertex shader
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vertexShaderSource);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Vertex shader error:\n" + gl.getShaderInfoLog(vsh));
    }

    // 2) Create and compile the fragment shader
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fragmentShaderSource);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Fragment shader error:\n" + gl.getShaderInfoLog(fsh));
    }

    // 3) Link the two shaders into a GPU program
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error:\n" + gl.getProgramInfoLog(prog));
    }

    // 4) Create a ShaderProgram wrapper for convenience
    shProgram = new ShaderProgram("BasicProgram", prog);
    // Use this program for subsequent draw calls
    shProgram.Use();

    // 5) Generate the geometry data (positions/normals/indices) in model.js
    let data = {};
    CreateSurfaceData(data);

    // 6) Create a Model object and upload data to its GPU buffers
    surface = new Model("Surface");
    surface.BufferData(data.positions, data.normals, data.indices);

    // 7) Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
}

/**
 * The main entry point. It:
 *   - Gets the <canvas>
 *   - Creates a WebGL context
 *   - Calls initGL() to set up everything
 *   - Sets up trackball + slider event logic
 *   - Launches the animation loop
 */
function init() {
    let canvas;
    try {
        // Grab the canvas from the DOM
        canvas = document.getElementById("webglcanvas");
        // Try to get WebGL context
        gl = canvas.getContext("webgl");
        if (!gl) {
            throw "Browser does not support WebGL.";
        }
    } catch (e) {
        // If we fail, show an error in the page
        document.getElementById("canvas-holder").innerHTML =
            "<p>Could not initialize WebGL context:</p>" + e;
        return;
    }

    try {
        // Initialize all GL-related resources (shaders, buffers, etc.)
        initGL();
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Could not init WebGL:</p>" + e;
        return;
    }

    // Set up a trackball for user interaction (rotation)
    spaceball = new TrackballRotator(canvas, null, 0);

    // Connect slider UI elements for adjusting surface resolution
    vSlider = document.getElementById("vSlider");
    uSlider = document.getElementById("uSlider");
    let vValue = document.getElementById("vValue");
    let uValue = document.getElementById("uValue");

    // Keep text boxes in sync with slider changes
    vSlider.oninput = function () {
        vValue.value = vSlider.value;
        rebuildSurface();
    };
    vValue.oninput = function () {
        vSlider.value = vValue.value;
        rebuildSurface();
    };
    uSlider.oninput = function () {
        uValue.value = uSlider.value;
        rebuildSurface();
    };
    uValue.oninput = function () {
        uSlider.value = uValue.value;
        rebuildSurface();
    };

    /**
     * Rebuild the geometry whenever the user changes slider values.
     * This re-calls CreateSurfaceData(...) with new resolution
     * and re-uploads the data to the GPU buffers.
     */
    function rebuildSurface() {
        let data = {};
        CreateSurfaceData(data);
        surface.BufferData(data.positions, data.normals, data.indices);
    }

    // Start the continuous render loop
    requestAnimationFrame(draw);
}
