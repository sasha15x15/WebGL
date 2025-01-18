// Convert degrees to radians
function deg2rad(angle) {
    return angle * Math.PI / 180.0;
}

/**
 * A structure that holds a position of a single vertex (x,y,z) and its normal (nx,ny,nz),
 * + tangent (tx, ty, tz) and texture coords (u, v).
 * Used to replicate vertices for flat shading (one normal per face).
 */
function FlatVertex(px, py, pz, nx, ny, nz, tx, ty, tz, u, v) {
    this.x = px;
    this.y = py;
    this.z = pz;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.tx = tx;
    this.ty = ty;
    this.tz = tz;
    this.u = u;
    this.v = v;
}

/**
 * The Model class encapsulates GPU buffer setup (positions, normals, tangents, texcoords)
 * + draw function.
 */
function Model(name) {
    this.name = name;

    // GPU buffer handles
    this.iVertexBuffer = gl.createBuffer();
    this.iNormalBuffer = gl.createBuffer();
    this.iTangentBuffer = gl.createBuffer();
    this.iTexCoordBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();

    // Number of indices
    this.count = 0;

    // For textures
    this.iTextureDiffuse = null;
    this.iTextureSpecular = null;
    this.iTextureNormal = null;

    /**
     * Upload data to GPU:
     *  positions -> iVertexBuffer
     *  normals   -> iNormalBuffer
     *  tangents  -> iTangentBuffer
     *  texcoords -> iTexCoordBuffer
     *  indices   -> iIndexBuffer
     */
    this.BufferData = function (positions, normals, tangents, texcoords, indices) {
        // Positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // Normals
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        // Tangents
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTangentBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, tangents, gl.STATIC_DRAW);

        // Texcoords
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);

        // Indices
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.count = indices.length;
    };

    /**
     * Draw call, enabling all required attributes.
     */
    this.Draw = function () {
        // Diffuse
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.iTextureDiffuse);
        gl.uniform1i(shProgram.iDiffuseSampler, 0);

        // Specular
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.iTextureSpecular);
        gl.uniform1i(shProgram.iSpecularSampler, 1);

        // Normal
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.iTextureNormal);
        gl.uniform1i(shProgram.iNormalSampler, 2);

        // Position
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);

        // Normal
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);

        // Tangent
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTangentBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribTangent);
        gl.vertexAttribPointer(shProgram.iAttribTangent, 3, gl.FLOAT, false, 0, 0);

        // TexCoord
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoord);
        gl.vertexAttribPointer(shProgram.iAttribTexCoord, 2, gl.FLOAT, false, 0, 0);

        // Indices
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);

        // Draw
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    };
}

/**
 * Compute a single triangle's face normal (unit vector) and the face area.
 */
function computeFaceNormalAndArea(p0, p1, p2) {
    let u = m4.subtractVectors(p1, p0);
    let v = m4.subtractVectors(p2, p0);
    let cross = m4.cross(u, v);
    let area = m4.length(cross) * 0.5;
    if (area < 1e-14) {
        return { normal: [0, 0, 1], area: 0 };
    }
    return { normal: m4.normalize(cross), area };
}

/**
 * Compute tangents for each face.
 */
function computeFaceTangent(p0, p1, p2, uv0, uv1, uv2) {
    // edges
    let edge1 = m4.subtractVectors(p1, p0);
    let edge2 = m4.subtractVectors(p2, p0);
    let deltaUV1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
    let deltaUV2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];
    let f = (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);
    if (Math.abs(f) < 1e-14) {
        // fallback
        return [1.0, 0.0, 0.0];
    }
    f = 1.0 / f;
    let tx = f * (edge1[0] * deltaUV2[1] - edge2[0] * deltaUV1[1]);
    let ty = f * (edge1[1] * deltaUV2[1] - edge2[1] * deltaUV1[1]);
    let tz = f * (edge1[2] * deltaUV2[1] - edge2[2] * deltaUV1[1]);
    return [tx, ty, tz];
}

/**
 * Creates the 3D surface geometry using Weighted-Average vertex normals,
 * replicates each face for Flat Shading, and also assigns texture coords
 * plus tangent.
 */
function CreateSurfaceData(data) {
    // 1) Same as Project 1: get user resolution
    let vCount = parseInt(vSlider.value);
    let uCount = parseInt(uSlider.value);

    // 2) Parameter ranges
    let vDegMin = -90, vDegMax = 90;
    let uDegMin = 0, uDegMax = 360;
    let stepV = (vDegMax - vDegMin) / vCount;
    let stepU = (uDegMax - uDegMin) / uCount;

    // Build angle arrays
    let vAngles = Array.from({ length: vCount + 1 }, (_, i) => deg2rad(vDegMin + i * stepV));
    let uAngles = Array.from({ length: uCount + 1 }, (_, j) => deg2rad(uDegMin + j * stepU));

    // "Corrugated sphere" parameters
    let R = 1.0;
    let a = 0.24;
    let n = 6;

    // 3) Build vertex grid
    let vertexGrid = vAngles.map(vRad => {
        return uAngles.map(uRad => {
            // Choose whichever formula you like:
            let radial = R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad));

            let x = radial * Math.cos(uRad);
            let y = radial * Math.sin(uRad);
            let z = R * Math.sin(vRad);
            return [x, y, z];
        });
    });

    function indexOf(iv, iu) {
        return iv * (uCount + 1) + iu;
    }

    // 4) Face indices
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

    // Weighted-average vertex normals
    let accumNormals = vertexGrid.flat().map(() => [0, 0, 0]);
    faces.forEach(([iA, iB, iC]) => {
        let pA = vertexGrid.flat()[iA];
        let pB = vertexGrid.flat()[iB];
        let pC = vertexGrid.flat()[iC];
        let { normal, area } = computeFaceNormalAndArea(pA, pB, pC);
        [iA, iB, iC].forEach(idx => {
            let scaled = m4.scaleVector(normal, area);
            accumNormals[idx] = m4.addVectors(accumNormals[idx], scaled);
        });
    });
    let normalizedNormals = accumNormals.map(nrm => m4.normalize(nrm));

    // 5) For Flat Shading
    let flatVertices = [];
    let flatIndices = [];
    let idxCounter = 0;

    // A revised param -> U V for a more spherical mapping:
    function paramToUV(iv, iu) {
        // Retrieve the actual angles from arrays
        let vRad = vAngles[iv]; // in [-π/2..+π/2]
        let uRad = uAngles[iu]; // in [0..2π]

        // Spherical-like transform:
        // uCoord in [0..1] as uRad goes from 0..2π
        // vCoord in [0..1] as vRad goes from -π/2..+π/2
        let uCoord = uRad / (2.0 * Math.PI);
        let vCoord = (vRad + Math.PI * 0.5) / Math.PI;

        return [uCoord, vCoord];
    }

    faces.forEach(([iA, iB, iC]) => {
        let pA = vertexGrid.flat()[iA];
        let pB = vertexGrid.flat()[iB];
        let pC = vertexGrid.flat()[iC];

        let nA = normalizedNormals[iA];
        let nB = normalizedNormals[iB];
        let nC = normalizedNormals[iC];

        // Face normal from average of the three:
        let sumABC = m4.addVectors(m4.addVectors(nA, nB), nC);
        let faceNormal = m4.normalize(sumABC);

        // Get (iv, iu) from indices for texture coordinate
        let ivA = Math.floor(iA / (uCount + 1));
        let iuA = iA % (uCount + 1);
        let ivB = Math.floor(iB / (uCount + 1));
        let iuB = iB % (uCount + 1);
        let ivC = Math.floor(iC / (uCount + 1));
        let iuC = iC % (uCount + 1);

        // Get the UV coords
        let uvA = paramToUV(ivA, iuA);
        let uvB = paramToUV(ivB, iuB);
        let uvC = paramToUV(ivC, iuC);

        // A quick tangent for the face:
        let faceTangent = computeFaceTangent(pA, pB, pC, uvA, uvB, uvC);
        faceTangent = m4.normalize(faceTangent);

        // Replicate each corner with the face normal, face tangent, and local UV
        [[pA, faceNormal, faceTangent, uvA],
        [pB, faceNormal, faceTangent, uvB],
        [pC, faceNormal, faceTangent, uvC]
        ].forEach((elem) => {
            let pos = elem[0];
            let nor = elem[1];
            let tan = elem[2];
            let uv = elem[3];
            flatVertices.push(new FlatVertex(
                pos[0], pos[1], pos[2],
                nor[0], nor[1], nor[2],
                tan[0], tan[1], tan[2],
                uv[0], uv[1]
            ));
            flatIndices.push(idxCounter++);
        });
    });

    // 6) Convert to typed arrays
    let positions = new Float32Array(flatVertices.length * 3);
    let normals = new Float32Array(flatVertices.length * 3);
    let tangents = new Float32Array(flatVertices.length * 3);
    let texcoords = new Float32Array(flatVertices.length * 2);

    flatVertices.forEach((fv, i) => {
        positions[3 * i + 0] = fv.x; positions[3 * i + 1] = fv.y; positions[3 * i + 2] = fv.z;
        normals[3 * i + 0] = fv.nx; normals[3 * i + 1] = fv.ny; normals[3 * i + 2] = fv.nz;
        tangents[3 * i + 0] = fv.tx; tangents[3 * i + 1] = fv.ty; tangents[3 * i + 2] = fv.tz;
        texcoords[2 * i + 0] = fv.u; texcoords[2 * i + 1] = fv.v;
    });
    let indices = new Uint16Array(flatIndices);

    // 7) Return data
    data.positions = positions;
    data.normals = normals;
    data.tangents = tangents;
    data.texcoords = texcoords;
    data.indices = indices;
}
