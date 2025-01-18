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
    this.iAttribVertex = gl.getAttribLocation(program, "aPosition");
    this.iAttribNormal = gl.getAttribLocation(program, "aNormal");
    this.iAttribTangent = gl.getAttribLocation(program, "aTangent");
    this.iAttribTexCoord = gl.getAttribLocation(program, "aTexCoord");

    // -- Uniforms --
    this.iModelViewMatrix = gl.getUniformLocation(program, "uModelViewMatrix");
    this.iProjectionMatrix = gl.getUniformLocation(program, "uProjectionMatrix");
    this.iNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");

    // Lighting
    this.iLightPos = gl.getUniformLocation(program, "uLightPos");

    // Material/lighting factors
    this.iAmbientFactor = gl.getUniformLocation(program, "uAmbientFactor");
    this.iDiffuseFactor = gl.getUniformLocation(program, "uDiffuseFactor");
    this.iSpecularFactor = gl.getUniformLocation(program, "uSpecularFactor");
    this.iShininess = gl.getUniformLocation(program, "uShininess");
    this.iColor = gl.getUniformLocation(program, "uColor");

    // Additional uniforms for texturing
    this.iDiffuseSampler = gl.getUniformLocation(program, "uDiffuseSampler");
    this.iSpecularSampler = gl.getUniformLocation(program, "uSpecularSampler");
    this.iNormalSampler = gl.getUniformLocation(program, "uNormalSampler");

    // View direction uniform
    this.iViewDir = gl.getUniformLocation(program, "uViewDir");

    this.Use = function () {
        gl.useProgram(this.prog);
    };
}

/**
 * The animation loop
 */
function draw() {
    // Clear
    gl.clearColor(51 / 255, 51 / 255, 51 / 255, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Projection
    let projection = m4.perspective(Math.PI / 8, 1, 8, 12);

    // ModelView from trackball
    let modelView = spaceball.getViewMatrix();

    // Translate scene
    let translateToPointZero = m4.translation(0, 0, -10);
    modelView = m4.multiply(translateToPointZero, modelView);

    // Normal matrix
    let normalMatrix = m4.inverse(modelView);
    normalMatrix = m4.transpose(normalMatrix);

    // Pass them to GPU
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);
    gl.uniformMatrix4fv(shProgram.iNormalMatrix, false, normalMatrix);

    // Animate light around Z-axis
    lightAngle += 0.001;
    lightAngle %= (2.0 * Math.PI);

    // Light position
    let radius = 30.0;
    let lx = radius * Math.cos(lightAngle);
    let ly = radius * Math.sin(lightAngle);
    let lz = -20.0;
    gl.uniform3fv(shProgram.iLightPos, [lx, ly, lz]);

    // Some material parameters
    gl.uniform4fv(shProgram.iColor, [1.0, 0.75, 0.0, 1.0]); // gold color
    gl.uniform1f(shProgram.iAmbientFactor, 0.2);
    gl.uniform1f(shProgram.iDiffuseFactor, 0.6);
    gl.uniform1f(shProgram.iSpecularFactor, 0.8);
    gl.uniform1f(shProgram.iShininess, 20.0);

    // We'll just fix the view direction to (0,0,1) for demonstration,
    // as in the original Project 1 approach. 
    // If you want it from the real camera position, you can compute it from modelView.
    gl.uniform3fv(shProgram.iViewDir, [0.0, 0.0, 1.0]);

    // Draw
    surface.Draw();

    requestAnimationFrame(draw);
}

/**
 * Initialization
 */
function initGL() {
    // 1) Create shaders
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vertexShaderSource);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Vertex shader error:\n" + gl.getShaderInfoLog(vsh));
    }

    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fragmentShaderSource);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Fragment shader error:\n" + gl.getShaderInfoLog(fsh));
    }

    // 2) Link
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error:\n" + gl.getProgramInfoLog(prog));
    }

    // 3) Create wrapper
    shProgram = new ShaderProgram("BasicProgram", prog);
    shProgram.Use();

    // 4) Create geometry data
    let data = {};
    CreateSurfaceData(data);

    // 5) Create model and upload buffers
    surface = new Model("Surface");
    surface.BufferData(
        data.positions,
        data.normals,
        data.tangents,
        data.texcoords,
        data.indices
    );

    // 6) Load textures
    surface.iTextureDiffuse = LoadTexture("surfaceTextures/diffuse.png");
    surface.iTextureSpecular = LoadTexture("surfaceTextures/specular.png");
    surface.iTextureNormal = LoadTexture("surfaceTextures/normal.png");

    // 7) Enable depth test
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
}

/**
 * Main entry point
 */
function init() {
    let canvas = document.getElementById("webglcanvas");
    try {
        gl = canvas.getContext("webgl");
        if (!gl) throw "Browser does not support WebGL.";
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Could not initialize WebGL context:</p>" + e;
        return;
    }

    try {
        initGL();
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Could not init WebGL:</p>" + e;
        return;
    }

    // Set up trackball
    spaceball = new TrackballRotator(canvas, null, 0);

    // Connect UI
    vSlider = document.getElementById("vSlider");
    uSlider = document.getElementById("uSlider");
    let vValue = document.getElementById("vValue");
    let uValue = document.getElementById("uValue");

    // Sync text boxes with slider changes
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

    function rebuildSurface() {
        let data = {};
        CreateSurfaceData(data);
        surface.BufferData(
            data.positions,
            data.normals,
            data.tangents,
            data.texcoords,
            data.indices
        );
    }

    // Start loop
    requestAnimationFrame(draw);
}
