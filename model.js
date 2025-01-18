// Convert degrees to radians
function deg2rad(angle) {
    return angle * Math.PI / 180.0;
}

/**
 * A structure that holds position of a single vertex (x,y,z) and its normal (nx,ny,nz).
 * Used to replicate vertices for flat shading (one normal per face).
 */
function FlatVertex(px, py, pz, nx, ny, nz) {
    this.x = px;
    this.y = py;
    this.z = pz;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
}

/**
 * The Model class encapsulates the GPU buffer setup (positions, normals, indices)
 * and a draw function to render the geometry.
 */
function Model(name) {
    this.name = name;

    // Create GPU buffer handles
    this.iVertexBuffer = gl.createBuffer();
    this.iNormalBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();

    // Total number of index elements (triangles * 3)
    this.count = 0;

    /**
     * Upload vertex attributes (positions, normals) and indices to the GPU.
     * @param {Float32Array} positions - Interleaved vertex coordinate data (x,y,z per vertex).
     * @param {Float32Array} normals   - Interleaved vertex normal data (nx,ny,nz per vertex).
     * @param {Uint16Array}  indices   - Triangle index data referencing the vertex arrays.
     */
    this.BufferData = function (positions, normals, indices) {
        // 1. Positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // 2. Normals
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        // 3. Indices
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        // Store count of indices to draw later
        this.count = indices.length;
    };

    /**
    * Draws the model using the bound buffers for positions, normals, and indices.
    * Configures shader attributes and renders in TRIANGLES mode.
    */
    this.Draw = function () {
        // Bind vertex position buffer, enable and define the pointer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);

        // Bind normal buffer, enable and define the pointer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);

        // Bind the index buffer and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    };
}

/**
 * Calculate a face normal (unit vector) and the face area of a single triangle,
 * using the m4.js library for cross-product.
 * @param {number[]} p0 - Vertex 0 in [x,y,z].
 * @param {number[]} p1 - Vertex 1 in [x,y,z].
 * @param {number[]} p2 - Vertex 2 in [x,y,z].
 * @returns {Object} { normal: [nx, ny, nz], area: faceArea }.
 */
function computeFaceNormalAndArea(p0, p1, p2) {
    // u = p1 - p0
    let u = m4.subtractVectors(p1, p0);
    // v = p2 - p0
    let v = m4.subtractVectors(p2, p0);

    // cross = u x v
    let cross = m4.cross(u, v);

    // Area is half of the cross-product magnitude
    let area = m4.length(cross) * 0.5;

    // If nearly zero area, default normal to [0,0,1]
    if (area < 1e-14) {
        return { normal: [0, 0, 1], area: 0 };
    }

    // Unit normal (m4.normalize) and the raw area
    return { normal: m4.normalize(cross), area };
}

/**
 * Creates the 3D surface geometry using Weighted-Average vertex normals.
 * Adds unique vertices for each face due to the Flat Shading
 *
 * The final geometry data is placed into the `data` object as:
 *  data.positions (Float32Array)
 *  data.normals   (Float32Array)
 *  data.indices   (Uint16Array)
 *
 * External references:
 *  - vSlider, uSlider: UI range inputs for granularity along V & U.
 *  - m4.*: Vector/matrix operations from the webgl-3d-math library.
 *
 * @param {Object} data - An object to which we attach positions, normals, indices.
 */
function CreateSurfaceData(data) {
    // 1. Read user slider values for V/U resolution
    let vCount = parseInt(vSlider.value);
    let uCount = parseInt(uSlider.value);

    // 2. Parameter ranges (in degrees) for V and U
    let vDegMin = -90, vDegMax = 90;
    let uDegMin = 0, uDegMax = 360;
    let stepV = (vDegMax - vDegMin) / vCount;
    let stepU = (uDegMax - uDegMin) / uCount;

    // Build arrays of angles in radians
    let vAngles = Array.from({ length: vCount + 1 },
        (_, i) => deg2rad(vDegMin + i * stepV));
    let uAngles = Array.from({ length: uCount + 1 },
        (_, j) => deg2rad(uDegMin + j * stepU));

    // 3. "Corrugated sphere" geometry parameters
    let R = 1.0;     // base sphere radius
    let a = 0.24;    // amplitude of corrugation
    let n = 6;       // frequency of corrugation

    // 4. Build a 2D grid of unique vertex positions in (x,y,z)
    let vertexGrid = vAngles.map(vRad => {
        return uAngles.map(uRad => {
            // radial computation
            let radial = R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad));
            let x = radial * Math.cos(uRad);
            let y = radial * Math.sin(uRad);
            let z = R * Math.sin(vRad);
            return [x, y, z];
        });
    });

    // Convert the 2D grid into a single array
    let vertexArray = vertexGrid.flat();

    // Converts grid coordinates (iv, iu) into a single vertexArray index.
    function indexOf(iv, iu) {
        return iv * (uCount + 1) + iu;
    }

    // 5. Build the "faces" array of triangle indices.
    //    Each grid cell forms two triangles: (i0,i2,i1) and (i1,i2,i3).
    let faces = [];
    for (let iv = 0; iv < vCount; iv++) {
        for (let iu = 0; iu < uCount; iu++) {
            let i0 = indexOf(iv, iu);
            let i1 = indexOf(iv, iu + 1);
            let i2 = indexOf(iv + 1, iu);
            let i3 = indexOf(iv + 1, iu + 1);
            faces.push([i0, i2, i1], [i1, i2, i3]);
        }
    }

    // 6. Accumulate Weighted Average vertex normals
    //    accumNormals[i] holds the sum of (faceNormal * faceArea) for each adjacent face.
    let accumNormals = vertexArray.map(() => [0, 0, 0]);

    faces.forEach(([iA, iB, iC]) => {
        let pA = vertexArray[iA];
        let pB = vertexArray[iB];
        let pC = vertexArray[iC];

        let { normal, area } = computeFaceNormalAndArea(pA, pB, pC);

        // Weighted by area => accumulate normal * area
        [iA, iB, iC].forEach(idx => {
            let scaled = m4.scaleVector(normal, area);
            accumNormals[idx] = m4.addVectors(accumNormals[idx], scaled);
        });
    });

    // 7. Normalize the accumulated normals to get Weighted-Average vertex normals
    let normalizedNormals = accumNormals.map(nrm => m4.normalize(nrm));

    // 8. For Flat Shading:
    //    - For each face, compute the "Facet Weighted Average Normal" by averaging
    //      the 3 Weighted-Average vertex normals (then normalizing again).
    //    - Replicate each triangle's normal for its 3 vertices, creating new
    //      FlatVertex objects and corresponding indices.
    let flatVertices = [];
    let flatIndices = [];
    let idxCounter = 0;

    faces.forEach(([iA, iB, iC]) => {
        let nA = normalizedNormals[iA];
        let nB = normalizedNormals[iB];
        let nC = normalizedNormals[iC];

        // Take an average of the 3 vertex normals, then normalize => face normal
        let sumABC = m4.addVectors(m4.addVectors(nA, nB), nC);
        let faceNormal = m4.normalize(sumABC);

        // For each corner, create a new FlatVertex with the faceNormal
        [iA, iB, iC].forEach(cornerIdx => {
            let p = vertexArray[cornerIdx];
            flatVertices.push(new FlatVertex(p[0], p[1], p[2], faceNormal[0], faceNormal[1], faceNormal[2]));
            flatIndices.push(idxCounter++);
        });
    });

    // 9. Convert flat vertex data into typed arrays suitable for WebGL
    let positions = new Float32Array(flatVertices.length * 3);
    let normals = new Float32Array(flatVertices.length * 3);

    flatVertices.forEach((fv, i) => {
        positions[3 * i + 0] = fv.x;
        positions[3 * i + 1] = fv.y;
        positions[3 * i + 2] = fv.z;

        normals[3 * i + 0] = fv.nx;
        normals[3 * i + 1] = fv.ny;
        normals[3 * i + 2] = fv.nz;
    });

    let indices = new Uint16Array(flatIndices);

    // 10. Attach the final geometry data to the 'data' object
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
}
