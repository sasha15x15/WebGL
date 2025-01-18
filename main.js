'use strict';

let gl;          // The WebGL rendering context
let surface;     // A 'Model' object for our surface geometry
let shProgram;   // The compiled & linked shader program
let spaceball;   // Object to handle trackball-like rotation (user interaction)
let sphere

// Light rotation angle around the Z-axis
let lightAngle = 0.0;

// (u,v) parameters for  sphere. Initialize to place it visibly on the surface.
let paramU = Math.PI;   // Start at u = π (opposite side)
let paramV = 0.0;       // Start at v = 0 (equator)

// sphere radius
let sphereRadius = 0.1;

// Texture scaling parameters
let textureScale = 1.0;
let scaleCenter = []; // Will be updated based on paramU and paramV

/**
 * Convert (u, v) parameters to 3D coordinates using the corrugated sphere formula.
 */
function paramTo3D(u, v) {
    let R = 1.0;
    let a = 0.24;
    let n = 6;

    let radial = R * Math.cos(v) + a * (1 - Math.sin(v)) * Math.abs(Math.cos(n * u));
    let x = radial * Math.cos(u);
    let y = radial * Math.sin(u);
    let z = R * Math.sin(v);
    return [x, y, z];
}

/**
 * Convert (u, v) to texture coordinates [0,1].
 */
function paramToTexCoord(u, v) {
    let texU = u / (2.0 * Math.PI);          // Assuming u ranges from 0 to 2π
    let texV = (v + (Math.PI / 2)) / Math.PI; // Assuming v ranges from -π/2 to π/2
    return [texU, texV];
}

/**
 * Shader Program Wrapper
 */
function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;

    // Attributes
    this.iAttribVertex = gl.getAttribLocation(program, "aPosition");
    this.iAttribNormal = gl.getAttribLocation(program, "aNormal");
    this.iAttribTangent = gl.getAttribLocation(program, "aTangent");
    this.iAttribTexCoord = gl.getAttribLocation(program, "aTexCoord");

    // Uniforms (matrices)
    this.iModelViewMatrix = gl.getUniformLocation(program, "uModelViewMatrix");
    this.iProjectionMatrix = gl.getUniformLocation(program, "uProjectionMatrix");
    this.iNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");

    // Lighting
    this.iLightPos = gl.getUniformLocation(program, "uLightPos");
    this.iAmbientFactor = gl.getUniformLocation(program, "uAmbientFactor");
    this.iDiffuseFactor = gl.getUniformLocation(program, "uDiffuseFactor");
    this.iSpecularFactor = gl.getUniformLocation(program, "uSpecularFactor");
    this.iShininess = gl.getUniformLocation(program, "uShininess");
    this.iColor = gl.getUniformLocation(program, "uColor");
    this.iViewDir = gl.getUniformLocation(program, "uViewDir");

    // Texturing
    this.iDiffuseSampler = gl.getUniformLocation(program, "uDiffuseSampler");
    this.iSpecularSampler = gl.getUniformLocation(program, "uSpecularSampler");
    this.iNormalSampler = gl.getUniformLocation(program, "uNormalSampler");

    // Texture scaling
    this.iTextureScale = gl.getUniformLocation(program, "uTextureScale");
    this.iStartScalePoint = gl.getUniformLocation(program, "uStartScalePoint");

    this.Use = function () {
        gl.useProgram(this.prog);
    };
}

/**
 * The main rendering loop.
 * This function is only called once to start the animation.
 */
function draw() {
    // Clear the canvas
    gl.clearColor(0.15, 0.15, 0.15, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Projection Matrix
    let projection = m4.perspective(Math.PI / 8, 1, 8, 12);

    // ModelView Matrix from trackball
    let modelView = spaceball.getViewMatrix();
    let translate = m4.translation(0, 0, -10);
    modelView = m4.multiply(translate, modelView);

    // Normal Matrix
    let normalMatrix = m4.transpose(m4.inverse(modelView));

    // Pass matrices to shader
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);
    gl.uniformMatrix4fv(shProgram.iNormalMatrix, false, normalMatrix);

    // Update and pass light position
    lightAngle += 0.002;
    if (lightAngle > 2.0 * Math.PI) lightAngle -= 2.0 * Math.PI;

    let lRadius = 30.0;
    let lx = lRadius * Math.cos(lightAngle);
    let ly = lRadius * Math.sin(lightAngle);
    let lz = -20.0;
    gl.uniform3fv(shProgram.iLightPos, [lx, ly, lz]);

    // Material properties for the surface
    gl.uniform1f(shProgram.iAmbientFactor, 0.2);
    gl.uniform1f(shProgram.iDiffuseFactor, 0.6);
    gl.uniform1f(shProgram.iSpecularFactor, 0.8);
    gl.uniform1f(shProgram.iShininess, 20.0);
    gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
    gl.uniform3fv(shProgram.iViewDir, [0.0, 0.0, 1.0]);

    // Update scaleCenter based on paramU and paramV
    scaleCenter = paramToTexCoord(paramU, paramV);

    // Texture scaling
    gl.uniform1f(shProgram.iTextureScale, textureScale);
    gl.uniform2fv(shProgram.iStartScalePoint, scaleCenter);

    // Draw the main surface
    surface.Draw();

    // Draw the red sphere at (paramU, paramV)
    let sphereCenter = paramTo3D(paramU, paramV);
    let sphereVerts = generateSphere(sphereCenter, sphereRadius);
    sphere.BufferData(sphereVerts);

    // Set material properties for the sphere
    gl.uniform1f(shProgram.iAmbientFactor, 1.0);
    gl.uniform1f(shProgram.iDiffuseFactor, 0.0);
    gl.uniform1f(shProgram.iSpecularFactor, 0.0);
    gl.uniform1f(shProgram.iShininess, 1.0);
    gl.uniform4fv(shProgram.iColor, [1.0, 0.0, 0.0, 0.0]);

    sphere.Draw();

    requestAnimationFrame(draw);
}

/**
 * Initialization function.
 * Sets up WebGL, shaders, models, textures, and event handlers.
 */
function initGL() {
    // Compile vertex shader
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vertexShaderSource);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Vertex shader error:\n" + gl.getShaderInfoLog(vsh));
    }

    // Compile fragment shader
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fragmentShaderSource);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Fragment shader error:\n" + gl.getShaderInfoLog(fsh));
    }

    // Link shaders into a program
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error:\n" + gl.getProgramInfoLog(prog));
    }

    // Create shader program wrapper
    shProgram = new ShaderProgram("MainProgram", prog);
    shProgram.Use();

    // Create the main surface model
    let data = {};
    CreateSurfaceData(data);
    surface = new Model("Surface");
    surface.BufferData(data.positions, data.normals, data.tangents, data.texcoords, data.indices);

    // Load textures (ensure the paths are correct)
    surface.iTextureDiffuse = LoadTexture("surfaceTextures/diffuse.png");
    surface.iTextureSpecular = LoadTexture("surfaceTextures/specular.png");
    surface.iTextureNormal = LoadTexture("surfaceTextures/normal.png");

    // Create the small sphere model
    sphere = new PointModel("Sphere");

    // Initialize scaleCenter based on initial paramU and paramV
    scaleCenter = paramToTexCoord(paramU, paramV);

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
}

/**
 * Main entry point.
 * Initializes WebGL and starts the rendering loop.
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
            "<p>Could not initialize WebGL:</p>" + e;
        return;
    }

    // Set up trackball rotation
    spaceball = new TrackballRotator(canvas, null, 0);

    // Connect UI sliders
    let vSlider = document.getElementById("vSlider");
    let uSlider = document.getElementById("uSlider");
    let scaleSlider = document.getElementById("scaleSlider");
    let vValue = document.getElementById("vValue");
    let uValue = document.getElementById("uValue");
    let scaleValue = document.getElementById("scaleValue");

    // Sync sliders with input fields
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
    scaleSlider.oninput = function () {
        scaleValue.value = scaleSlider.value;
        textureScale = parseFloat(scaleSlider.value);
    };
    scaleValue.oninput = function () {
        scaleSlider.value = scaleValue.value;
        textureScale = parseFloat(scaleValue.value);
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

    // Keyboard event handler to move the sphere without affecting the light
    document.addEventListener("keydown", (event) => {
        const step = 0.05; // Increment step in radians

        switch (event.key.toLowerCase()) {
            case "a":
                paramU -= step;
                if (paramU < 0) paramU += 2.0 * Math.PI;
                break;
            case "d":
                paramU += step;
                if (paramU > 2.0 * Math.PI) paramU -= 2.0 * Math.PI;
                break;
            case "w":
                paramV += step;
                if (paramV > Math.PI / 2) paramV = Math.PI / 2;
                break;
            case "s":
                paramV -= step;
                if (paramV < -Math.PI / 2) paramV = -Math.PI / 2;
                break;
        }

    });

    // Start the rendering loop
    requestAnimationFrame(draw);
}
