function deg2rad(angle) {
    return angle * Math.PI / 180;
}

// Data structre to hold U and V curves
function WireframeModel() {
    this.uPolylines = []; // Array to hold U polylines
    this.vPolylines = []; // Array to hold V polylines
}


function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.uPolylineRanges = []; // Ranges for U polylines
    this.vPolylineRanges = []; // Ranges for V polylines

    this.BufferData = function (wireframeModel) {
        let vertices = [];
        this.uPolylineRanges = [];
        this.vPolylineRanges = [];

        // Combine U polylines into one array
        wireframeModel.uPolylines.forEach(polyline => {
            let start = vertices.length / 3;
            vertices.push(...polyline);
            let count = polyline.length / 3;
            this.uPolylineRanges.push({ start, count });
        });

        // Combine V polylines into one array along with U curves
        wireframeModel.vPolylines.forEach(polyline => {
            let start = vertices.length / 3;
            vertices.push(...polyline);
            let count = polyline.length / 3;
            this.vPolylineRanges.push({ start, count });
        });

        // Upload the combined vertex data to a single buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    };

    this.Draw = function () {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        // Draw U polylines
        gl.uniform4fv(shProgram.iColor, [50 / 255, 222 / 255, 132 / 255, 1]); // Green color
        this.uPolylineRanges.forEach(({ start, count }) => {
            gl.drawArrays(gl.LINE_STRIP, start, count);
        });

        // Draw V polylines
        gl.uniform4fv(shProgram.iColor, [229 / 255, 43 / 255, 80 / 255, 1]); // Red color
        this.vPolylineRanges.forEach(({ start, count }) => {
            gl.drawArrays(gl.LINE_STRIP, start, count);
        });
    };
}


function CreateSurfaceData() {
    let wireframeModel = new WireframeModel();

    const R = 1;   // Radius of the base sphere on the equator
    const a = 0.24; // Maximum amplitude of the crimps at the base of the surfase (on equator)
    const n = 6;   // Number of "crimps/waves" (for n = 6 -> 12 crimps/waves)

    vVerticesNumber = parseInt(vSlider.value);
    maxV = 90;
    minV = -90;
    stepV = (maxV - minV) / (vVerticesNumber);

    let vVerticesArr = []
    for (let i = 0; i < vVerticesNumber; i += 1) {
        vVerticesArr.push(deg2rad(minV + i * stepV));
    }
    vVerticesArr.push(deg2rad(maxV));

    uVerticesNumber = parseInt(uSlider.value);
    minU = 0;
    maxU = 360;
    stepU = (maxU - minU) / (uVerticesNumber);

    let uVerticesArr = []
    for (let i = 0; i < uVerticesNumber; i += 1) {
        uVerticesArr.push(deg2rad(minU + i * stepU));
    }
    uVerticesArr.push(deg2rad(maxU));

    vVerticesArr.forEach(vRad => {
        let uPolyline = [];
        uVerticesArr.forEach(uRad => {
            let x = (R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad))) * Math.cos(uRad);
            let y = (R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad))) * Math.sin(uRad);
            let z = R * Math.sin(vRad);

            uPolyline.push(x, y, z);
        });
        wireframeModel.uPolylines.push(uPolyline);
    });

    uVerticesArr.forEach(uRad => {
        let vPolyline = [];
        vVerticesArr.forEach(vRad => {
            let x = (R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad))) * Math.cos(uRad);
            let y = (R * Math.cos(vRad) + a * (1 - Math.sin(vRad)) * Math.abs(Math.cos(n * uRad))) * Math.sin(uRad);
            let z = R * Math.sin(vRad);

            vPolyline.push(x, y, z);
        });
        wireframeModel.vPolylines.push(vPolyline);
    });

    return wireframeModel;
}