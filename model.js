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
    this.x = px; this.y = py; this.z = pz;
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.tx = tx; this.ty = ty; this.tz = tz;
    this.u = u; this.v = v;
}

// Main Model for the surface
function Model(name) {
    this.name = name;

    // GPU buffers
    this.iVertexBuffer = gl.createBuffer();
    this.iNormalBuffer = gl.createBuffer();
    this.iTangentBuffer = gl.createBuffer();
    this.iTexCoordBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;

    // Textures
    this.iTextureDiffuse = null;
    this.iTextureSpecular = null;
    this.iTextureNormal = null;

    // Helper
    function uploadToGPU(target, buffer, data) {
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
    }

    this.BufferData = function (positions, normals, tangents, texcoords, indices) {
        uploadToGPU(gl.ARRAY_BUFFER, this.iVertexBuffer, positions);
        uploadToGPU(gl.ARRAY_BUFFER, this.iNormalBuffer, normals);
        uploadToGPU(gl.ARRAY_BUFFER, this.iTangentBuffer, tangents);
        uploadToGPU(gl.ARRAY_BUFFER, this.iTexCoordBuffer, texcoords);
        uploadToGPU(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer, indices);
        this.count = indices.length;
    };

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

function PointModel(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.count = 0;

    this.BufferData = function (positionArray) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.STATIC_DRAW);
        this.count = positionArray.length / 3;
    };

    this.Draw = function () {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);

        // Draw as triangles
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
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
    let edge1 = m4.subtractVectors(p1, p0);
    let edge2 = m4.subtractVectors(p2, p0);
    let deltaUV1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
    let deltaUV2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];
    let f = (deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0]);
    if (Math.abs(f) < 1e-14) {
        return [1.0, 0.0, 0.0];
    }
    f = 1.0 / f;
    return [
        f * (edge1[0] * deltaUV2[1] - edge2[0] * deltaUV1[1]),
        f * (edge1[1] * deltaUV2[1] - edge2[1] * deltaUV1[1]),
        f * (edge1[2] * deltaUV2[1] - edge2[2] * deltaUV1[1])
    ];
}

// Create the "corrugated sphere"
function CreateSurfaceData(data) {
    let vCount = parseInt(vSlider.value);
    let uCount = parseInt(uSlider.value);

    let vDegMin = -90, vDegMax = 90;
    let uDegMin = 0, uDegMax = 360;
    let stepV = (vDegMax - vDegMin) / vCount;
    let stepU = (uDegMax - uDegMin) / uCount;

    let vAngles = Array.from({ length: vCount + 1 }, (_, i) => deg2rad(vDegMin + i * stepV));
    let uAngles = Array.from({ length: uCount + 1 }, (_, j) => deg2rad(uDegMin + j * stepU));

    // "Corrugated sphere" parameters
    let R = 1.0, a = 0.24, n = 6;

    // Build vertex grid
    let vertexGrid = vAngles.map(vRad => {
        return uAngles.map(uRad => {
            let radial = R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad));
            let x = radial * Math.cos(uRad);
            let y = radial * Math.sin(uRad);
            let z = R * Math.sin(vRad);
            return [x, y, z];
        });
    });

    function indexOf(iv, iu) { return iv * (uCount + 1) + iu; }

    // Face indices
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

    // weighted normals
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
    let normalizedNormals = accumNormals.map(n => m4.normalize(n));

    // Flat replicate
    let flatVertices = [], flatIndices = [];
    let idxCounter = 0;

    function paramToUV(iv, iu) {
        let vRad = vAngles[iv];
        let uRad = uAngles[iu];
        let uu = uRad / (2 * Math.PI);
        let vv = (vRad + Math.PI * 0.5) / Math.PI;
        return [uu, vv];
    }

    faces.forEach(([iA, iB, iC]) => {
        let pA = vertexGrid.flat()[iA];
        let pB = vertexGrid.flat()[iB];
        let pC = vertexGrid.flat()[iC];

        let nA = normalizedNormals[iA];
        let nB = normalizedNormals[iB];
        let nC = normalizedNormals[iC];
        let sumN = m4.addVectors(m4.addVectors(nA, nB), nC);
        let faceNormal = m4.normalize(sumN);

        let ivA = Math.floor(iA / (uCount + 1));
        let iuA = iA % (uCount + 1);
        let ivB = Math.floor(iB / (uCount + 1));
        let iuB = iB % (uCount + 1);
        let ivC = Math.floor(iC / (uCount + 1));
        let iuC = iC % (uCount + 1);

        let uvA = paramToUV(ivA, iuA);
        let uvB = paramToUV(ivB, iuB);
        let uvC = paramToUV(ivC, iuC);

        let faceTangent = computeFaceTangent(pA, pB, pC, uvA, uvB, uvC);
        faceTangent = m4.normalize(faceTangent);

        [[pA, faceNormal, faceTangent, uvA],
        [pB, faceNormal, faceTangent, uvB],
        [pC, faceNormal, faceTangent, uvC]
        ].forEach(elem => {
            flatVertices.push(new FlatVertex(
                elem[0][0], elem[0][1], elem[0][2],
                elem[1][0], elem[1][1], elem[1][2],
                elem[2][0], elem[2][1], elem[2][2],
                elem[3][0], elem[3][1]
            ));
            flatIndices.push(idxCounter++);
        });
    });

    // Convert to typed arrays
    let positions = new Float32Array(flatVertices.length * 3);
    let normals = new Float32Array(flatVertices.length * 3);
    let tangents = new Float32Array(flatVertices.length * 3);
    let texcoords = new Float32Array(flatVertices.length * 2);

    flatVertices.forEach((v, i) => {
        positions[3 * i + 0] = v.x; positions[3 * i + 1] = v.y; positions[3 * i + 2] = v.z;
        normals[3 * i + 0] = v.nx; normals[3 * i + 1] = v.ny; normals[3 * i + 2] = v.nz;
        tangents[3 * i + 0] = v.tx; tangents[3 * i + 1] = v.ty; tangents[3 * i + 2] = v.tz;
        texcoords[2 * i + 0] = v.u; texcoords[2 * i + 1] = v.v;
    });
    let indices = new Uint16Array(flatIndices);

    data.positions = positions;
    data.normals = normals;
    data.tangents = tangents;
    data.texcoords = texcoords;
    data.indices = indices;
}

function generateSphere(center, radius) {
    const u = 20; // Number of u
    const v = 20; // Number of v
    let vertices = [];

    for (let i = 0; i < u; i++) {
        let theta1 = (i * Math.PI) / u;
        let theta2 = ((i + 1) * Math.PI) / u;

        for (let j = 0; j < v; j++) {
            let phi1 = (j * 2.0 * Math.PI) / v;
            let phi2 = ((j + 1) * 2.0 * Math.PI) / v;

            // Four corners of a quad, turned into two triangles
            let p1 = sphericalPoint(center, radius, theta1, phi1);
            let p2 = sphericalPoint(center, radius, theta1, phi2);
            let p3 = sphericalPoint(center, radius, theta2, phi1);
            let p4 = sphericalPoint(center, radius, theta2, phi2);

            // Triangle 1
            vertices.push(
                p1[0], p1[1], p1[2],
                p2[0], p2[1], p2[2],
                p3[0], p3[1], p3[2]
            );

            // Triangle 2
            vertices.push(
                p2[0], p2[1], p2[2],
                p4[0], p4[1], p4[2],
                p3[0], p3[1], p3[2]
            );
        }
    }
    return new Float32Array(vertices);
}

function sphericalPoint(center, r, theta, phi) {
    let sinTheta = Math.sin(theta);
    let cosTheta = Math.cos(theta);
    let sinPhi = Math.sin(phi);
    let cosPhi = Math.cos(phi);
    let x = r * sinTheta * cosPhi + center[0];
    let y = r * cosTheta + center[1];
    let z = r * sinTheta * sinPhi + center[2];
    return [x, y, z];
}
