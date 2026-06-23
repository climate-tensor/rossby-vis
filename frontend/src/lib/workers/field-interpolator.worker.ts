/**
 * @fileoverview
 * Web Worker for Field Interpolation (Complete Version for Scalar & Vector)
 *
 * This worker performs computationally intensive field interpolation off the main thread.
 * This version handles both scalar (temperature) and vector (wind) data, and includes
 * all necessary fixes for projection, longitude, and distortion correction.
 */

import {
    buildGradientFromDescriptor,
    getColorScaleDescriptor,
    type ColorScaleDescriptor
} from '../color-scales';

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
// Default gradients used only when a grid arrives without a color-scale
// descriptor (older callers / safety net). These mirror the per-variable scales
// from the original products.js: wind speed in m/s and 2m temperature in K.
const defaultScalarScale = buildGradientFromDescriptor(getColorScaleDescriptor('t2m'));
const defaultVectorScale = buildGradientFromDescriptor(getColorScaleDescriptor('wind'));

/**
 * Per-frame particle velocity scale.
 *
 * Distortion correction returns vectors stretched by the projection scale
 * (≈ `scale * π/180` per unit wind), which is far too large to use directly as a
 * per-frame pixel displacement — particles would teleport across the globe. This
 * constant converts the corrected wind into a sane on-screen step (a few pixels
 * per frame for typical winds) while preserving direction and relative speed.
 */
const PARTICLE_VELOCITY_SCALE = 0.08;
// endregion

// region: Core Logic (Interpolation, Distortion)

function bilinearInterpolate(grid: any, lon: number, lat: number): [number, number] | number | null {
    const { type, bounds, dimensions, data } = grid;
    const { width, height } = dimensions;
    const { north, south, east, west } = bounds;

    const deltaLon = (east - west) / (width - 1);
    const deltaLat = (north - south) / (height - 1);

    // A global grid whose columns span the full 360° wraps at the prime meridian.
    // Reproduce nullschool's technique (products.js buildGrid): treat the first
    // column as the column just past the last so interpolation across the seam is
    // seamless, instead of returning null and leaving a black gap near lon 0/360.
    const isContinuous = (east - west) + deltaLon >= 360 - deltaLon * 0.5;

    // Longitude index. For continuous grids wrap into [0, width) (floorMod);
    // otherwise the request must fall inside the grid.
    let i = (lon - west) / deltaLon;
    if (isContinuous) {
        i = ((i % width) + width) % width;
    } else if (i < 0 || i > width - 1) {
        return null;
    }

    const j = (north - lat) / deltaLat;
    if (j < 0 || j > height - 1) return null;

    const x0 = Math.floor(i);
    const x1 = isContinuous ? (x0 + 1) % width : Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(j);
    const y1 = Math.min(y0 + 1, height - 1);
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

// Finite-difference step (in degrees) for the distortion estimate. Matches
// nullschool's micro.js (0.0000360° ~= 4 m).
const DISTORTION_H = 0.0000360;

/**
 * Projection distortion at (λ, φ) as scaled partial derivatives
 * `[dx/dλ, dy/dλ, dx/dφ, dy/dφ]`. Faithfully reproduces nullschool's
 * `micro.distortion` so wind vectors stay correct at the poles:
 *   - the finite-difference step points toward the equator (`hφ = φ < 0 ? +H : -H`)
 *     so it never steps past ±90° latitude at the poles, and
 *   - the longitude derivatives are divided by the meridian scale factor
 *     `k = cos(φ)` (Snyder eq. 4-3); without this there is a pinching/blow-up
 *     effect where the meridians converge at the poles.
 */
function calculateDistortion(
    project: (c: [number, number]) => [number, number],
    λ: number,
    φ: number,
    x: number,
    y: number
): [number, number, number, number] {
    const hλ = λ < 0 ? DISTORTION_H : -DISTORTION_H;
    const hφ = φ < 0 ? DISTORTION_H : -DISTORTION_H;
    const pλ = project([λ + hλ, φ]);
    const pφ = project([λ, φ + hφ]);
    const k = Math.cos((φ * Math.PI) / 180);

    return [
        (pλ[0] - x) / hλ / k,
        (pλ[1] - y) / hλ / k,
        (pφ[0] - x) / hφ,
        (pφ[1] - y) / hφ
    ];
}

/**
 * Transform a geographic wind vector (u, v) into a screen-space vector via the
 * projection Jacobian (nullschool's `distort`): the columns are the longitude
 * and latitude derivatives from {@link calculateDistortion}.
 */
function applyDistortionCorrection(
    u: number,
    v: number,
    d: [number, number, number, number]
): [number, number] {
    return [d[0] * u + d[2] * v, d[1] * u + d[3] * v];
}
// endregion

// region: Main Worker Function
async function performInterpolation(request: WorkerRequest): Promise<void> {
    const { id, data } = request;
    const { projectionConfig, grid: gridData, viewport, maskData } = data;
    const { width, height } = viewport;

    postMessage({ id, type: 'progress', progress: { percentage: 0, message: 'Initializing...' } });

    const { scale, translate, orientation } = projectionConfig;
    // The SVG layer uses d3.geoOrthographic with rotate([λ, -φ, γ]) (see
    // OrthographicGlobe.setOrientation), and d3 centers the map at longitude -λ.
    // This hand-written projection must mirror that, otherwise the data layer's
    // longitude is flipped relative to the coastlines once the globe is rotated.
    const λ0 = -orientation.lambda * Math.PI / 180;
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

    // Reconstruct the per-variable gradient from the descriptor attached to the
    // grid (see product-data-loader). Falls back to the category default if a
    // caller didn't supply one. Colors are applied to RAW data values so each
    // field uses its true physical range (matching the original earth.js).
    const descriptor: ColorScaleDescriptor | undefined = gridData.colorScale;
    const gradient = descriptor
        ? buildGradientFromDescriptor(descriptor)
        : gridData.type === 'vector'
            ? defaultVectorScale
            : defaultScalarScale;

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
                        // Store screen-space displacement (px/frame) for particle motion.
                        // At the exact pole the meridian scale factor is 0, so guard
                        // against the resulting non-finite vector (leave it at 0).
                        if (Number.isFinite(u) && Number.isFinite(v)) {
                            vectors[i * 2] = u * PARTICLE_VELOCITY_SCALE;
                            vectors[i * 2 + 1] = v * PARTICLE_VELOCITY_SCALE;
                        }
                        // Colour by the true wind speed (m/s), not the projection-
                        // stretched screen vector, so the scale isn't saturated.
                        [r, g, b, a] = gradient(Math.sqrt(rawU * rawU + rawV * rawV), 180);
                    } else {
                        [r, g, b, a] = gradient(value as number, 200);
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