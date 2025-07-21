/**
 * @fileoverview
 * Web Worker for Field Interpolation (Complete Version for Scalar & Vector)
 *
 * This worker performs computationally intensive field interpolation off the main thread.
 * This version handles both scalar (temperature) and vector (wind) data, and includes
 * all necessary fixes for projection, longitude, and distortion correction.
 */

// region: Type Definitions
interface WorkerRequest {
    id: string;
    type: 'interpolate';
    data: {
        projectionConfig: {
            scale: number;
            translate: [number, number];
            orientation: { lambda: number; phi: number; gamma: number; };
        };
        grid: any;
        viewport: { width: number; height: number; };
        maskData: ImageData;
    };
}

interface WorkerResponse {
    id: string;
    type: 'progress' | 'result' | 'error';
    data?: any;
    error?: string;
    progress?: { percentage: number; message: string; };
}
// endregion

// region: Color and Math Utilities
function colorInterpolator(start: number[], end: number[]) {
    const r = start[0], g = start[1], b = start[2];
    const Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
    return (i: number, a: number) => [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
}

function proportion(x: number, low: number, high: number) {
    return Math.max(0, Math.min(1, (x - low) / (high - low)));
}

function segmentedColorScale(segments: [number, number[]][]) {
    const points: number[] = [], interpolators: any[] = [], ranges: [number, number][] = [];
    for (let i = 0; i < segments.length - 1; i++) {
        points.push(segments[i + 1][0]);
        interpolators.push(colorInterpolator(segments[i][1], segments[i + 1][1]));
        ranges.push([segments[i][0], segments[i + 1][0]]);
    }
    return (point: number, alpha: number) => {
        let i;
        for (i = 0; i < points.length - 1; i++) {
            if (point <= points[i]) break;
        }
        return interpolators[i](proportion(point, ranges[i][0], ranges[i][1]), alpha);
    };
}

const tempScale = segmentedColorScale([
    [-50, [37, 4, 42]], [-30, [41, 10, 130]], [-10, [70, 215, 215]], [0, [21, 84, 187]],
    [10, [24, 132, 14]], [20, [247, 251, 59]], [30, [235, 167, 21]], [50, [88, 27, 67]]
]);

const windScale = segmentedColorScale([
    [0, [255, 255, 255]], [5, [130, 180, 255]], [10, [70, 215, 215]], [15, [24, 132, 14]],
    [20, [247, 251, 59]], [25, [235, 167, 21]], [30, [255, 0, 0]], [40, [150, 0, 150]]
]);
// endregion

// region: Core Logic (Interpolation, Distortion)

function bilinearInterpolate(grid: any, lon: number, lat: number): [number, number] | number | null {
    const { type, bounds, dimensions, data } = grid;
    const { width, height } = dimensions;
    const { north, south, east, west } = bounds;

    const deltaLon = (east - west) / (width - 1);
    const deltaLat = (north - south) / (height - 1);

    const i = (lon - west) / deltaLon;
    const j = (north - lat) / deltaLat;

    if (i < 0 || i >= width - 1 || j < 0 || j >= height - 1) return null;

    const x0 = Math.floor(i), x1 = x0 + 1;
    const y0 = Math.floor(j), y1 = y0 + 1;
    const fx = i - x0, fy = j - y0;
    const get = (arr: Float32Array, x: number, y: number) => arr[y * width + x];

    if (type === 'vector') {
        const u = data.u, v = data.v;
        if (!u || !v) return null;
        const u00 = get(u, x0, y0), u01 = get(u, x0, y1), u10 = get(u, x1, y0), u11 = get(u, x1, y1);
        const v00 = get(v, x0, y0), v01 = get(v, x0, y1), v10 = get(v, x1, y0), v11 = get(v, x1, y1);
        if (u00 === undefined || v00 === undefined) return null;
        const uInterp = (u00 * (1 - fx) + u10 * fx) * (1 - fy) + (u01 * (1 - fx) + u11 * fx) * fy;
        const vInterp = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
        return [uInterp, vInterp];
    } else {
        const scalar = data.scalar;
        if (!scalar) return null;
        const v00 = get(scalar, x0, y0), v01 = get(scalar, x0, y1), v10 = get(scalar, x1, y0), v11 = get(scalar, x1, y1);
        if (v00 === undefined) return null;
        return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
    }
}

function calculateDistortion(project: (c: [number, number]) => [number, number] | null, λ: number, φ: number, x: number, y: number) {
    const h = 0.0001; // Small increment for finite difference
    const pλ = project([λ + h, φ]);
    const pφ = project([λ, φ + h]);

    if (!pλ || !pφ) return { scaleX: 1, scaleY: 1, angle: 0 };

    const del_x_λ = (pλ[0] - x) / h;
    const del_y_λ = (pλ[1] - y) / h;
    const del_x_φ = (pφ[0] - x) / h;
    const del_y_φ = (pφ[1] - y) / h;

    const angle = Math.atan2(del_y_λ, del_x_λ);

    return {
        scaleX: Math.sqrt(del_x_λ * del_x_λ + del_y_λ * del_y_λ),
        scaleY: Math.sqrt(del_x_φ * del_x_φ + del_y_φ * del_y_φ),
        angle
    };
}

function applyDistortionCorrection(u: number, v: number, distortion: any) {
    const { scaleX, scaleY, angle } = distortion;
    const scaledU = u * scaleX, scaledV = v * scaleY;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [scaledU * cos - scaledV * sin, scaledU * sin + scaledV * cos];
}
// endregion

// region: Main Worker Function
async function performInterpolation(request: WorkerRequest): Promise<void> {
    const { id, data } = request;
    const { projectionConfig, grid: gridData, viewport, maskData } = data;
    const { width, height } = viewport;

    postMessage({ id, type: 'progress', progress: { percentage: 0, message: 'Initializing...' } });

    const { scale, translate, orientation } = projectionConfig;
    const λ0 = orientation.lambda * Math.PI / 180;
    const φ0 = orientation.phi * Math.PI / 180;
    const cosφ0 = Math.cos(φ0), sinφ0 = Math.sin(φ0);

    const projection = (c: [number, number]): [number, number] => {
        const λ = c[0] * Math.PI / 180, φ = c[1] * Math.PI / 180;
        const cosφ = Math.cos(φ), cosλ_λ0 = Math.cos(λ - λ0);
        const x = cosφ * Math.sin(λ - λ0);
        const y = cosφ0 * Math.sin(φ) - sinφ0 * cosφ * cosλ_λ0;
        return [translate[0] + scale * x, translate[1] - scale * y];
    };

    const projectionInvert = (screenX: number, screenY: number): [number, number] | null => {
        const x = screenX - translate[0], y = translate[1] - screenY;
        const ρ = Math.sqrt(x * x + y * y);
        if (ρ > scale) return null;
        const c = Math.asin(ρ / scale);
        const cosc = Math.cos(c), sinc = Math.sin(c);
        const φ = ρ === 0 ? φ0 : Math.asin(cosc * sinφ0 + y * sinc * cosφ0 / ρ);
        const λ = ρ === 0 ? λ0 : λ0 + Math.atan2(x * sinc, ρ * cosc * cosφ0 - y * sinc * sinφ0);
        return [λ * 180 / Math.PI, φ * 180 / Math.PI];
    };

    const vectors = new Float32Array(width * height * 2);
    const overlay = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        const x = i % width, y = Math.floor(i / width);
        if (maskData.data[i * 4 + 3] > 0) {
            const coord = projectionInvert(x, y);
            if (coord) {
                let [lon, lat] = coord;
                if (lon < gridData.bounds.west) lon += 360;

                const value = bilinearInterpolate(gridData, lon, lat);
                if (value !== null) {
                    let r, g, b, a;
                    if (gridData.type === 'vector') {
                        const [rawU, rawV] = value as [number, number];
                        const distortion = calculateDistortion(projection, lon, lat, x, y);
                        const [u, v] = applyDistortionCorrection(rawU, rawV, distortion);
                        vectors[i * 2] = u;
                        vectors[i * 2 + 1] = v;
                        [r, g, b, a] = windScale(Math.sqrt(u * u + v * v), 180);
                    } else {
                        [r, g, b, a] = tempScale(value as number, 200);
                    }
                    overlay[i * 4] = r;
                    overlay[i * 4 + 1] = g;
                    overlay[i * 4 + 2] = b;
                    overlay[i * 4 + 3] = a;
                }
            }
        }
    }

    postMessage({ id, type: 'progress', progress: { percentage: 100, message: 'Complete' } });

    const message: WorkerResponse = {
        id, type: 'result', data: {
            vectors: vectors.buffer,
            overlay: { data: overlay.buffer, width, height },
            bounds: { width, height, valid: true }
        }
    };
    (self as any).postMessage(message, [vectors.buffer, overlay.buffer]);
}
// endregion

// region: Worker Event Listener
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    if (event.data.type === 'interpolate') {
        performInterpolation(event.data).catch(error => {
            postMessage({
                id: event.data.id, type: 'error',
                error: error instanceof Error ? error.message : 'Unknown worker error'
            });
        });
    }
};
// endregion

export { };