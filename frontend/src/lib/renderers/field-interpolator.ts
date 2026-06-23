/**
 * @fileoverview
 * Data Field Interpolator - Phase 2.3 Implementation
 * 
 * This module faithfully reproduces the interpolateField logic from the original earth.js,
 * implementing the most critical and complex step of the migration with modern TypeScript
 * and Web Worker optimization.
 */

import type { Globe, Viewport } from '../globes/types';
import type { Grid } from '../products/types';

/**
 * Field object containing corrected vector field and overlay data
 * Reproduces the field object from the original earth.js
 */
export interface Field {
    /** Screen-space corrected vector field for each pixel */
    vectors: Float32Array; // [u1, v1, u2, v2, ...] for each pixel
    /** Pre-rendered overlay colors as ImageData */
    overlay: ImageData;
    /** Field bounds and metadata */
    bounds: {
        width: number;
        height: number;
        valid: boolean;
    };
}

/**
 * Distortion correction parameters
 * Reproduces the distortion calculation from micro.js
 */
interface DistortionInfo {
    scaleX: number;
    scaleY: number;
    angle: number;
}

/**
 * Progress callback for interpolation task
 */
export type InterpolationProgressCallback = (progress: number, message: string) => void;

/**
 * Interpolation task configuration
 */
export interface InterpolationConfig {
    globe: Globe;
    grid: Grid;
    onProgress?: InterpolationProgressCallback;
    colorScale?: (magnitude: number) => string;
}

/**
 * Calculate projection distortion at a given geographic point
 * Faithfully reproduces the distortion() function from micro.js using finite difference method
 */
function calculateDistortion(
    projection: any,
    lon: number,
    lat: number,
    x: number,
    y: number
): DistortionInfo {
    const h = 0.0001; // Small increment for finite difference
    
    // Calculate nearby points
    const pLon = projection([lon + h, lat]);
    const pLat = projection([lon, lat + h]);
    
    if (!pLon || !pLat) {
        // Fallback for edge cases
        return { scaleX: 1, scaleY: 1, angle: 0 };
    }
    
    // Calculate derivatives (stretching factors)
    const scaleX = (pLon[0] - x) / h;
    const scaleY = (pLat[1] - y) / h;
    const rotationX = (pLon[1] - y) / h;
    const rotationY = (pLat[0] - x) / h;
    
    // Calculate angle for rotation correction
    const angle = Math.atan2(rotationX, scaleX);
    
    return {
        scaleX: Math.sqrt(scaleX * scaleX + rotationX * rotationX),
        scaleY: Math.sqrt(scaleY * scaleY + rotationY * rotationY),
        angle
    };
}

/**
 * Apply distortion correction to a vector
 * Transforms geographic [u, v] to visually correct screen space vector
 */
function applyDistortionCorrection(
    u: number,
    v: number,
    distortion: DistortionInfo
): [number, number] {
    if (!isFinite(u) || !isFinite(v)) {
        return [0, 0];
    }
    
    // Apply scaling
    const scaledU = u * distortion.scaleX;
    const scaledV = v * distortion.scaleY;
    
    // Apply rotation correction
    const cos = Math.cos(distortion.angle);
    const sin = Math.sin(distortion.angle);
    
    const correctedU = scaledU * cos - scaledV * sin;
    const correctedV = scaledU * sin + scaledV * cos;
    
    return [correctedU, correctedV];
}

/**
 * Proper temperature colormap (reproducing original earth.js colors)
 * Cold (blue) -> Moderate (green/yellow) -> Hot (red)
 */
function temperatureColorScale(value: number): [number, number, number] {
    // Normalize temperature value (-40°C to +40°C range)
    const normalized = Math.max(0, Math.min(1, (value + 40) / 80));
    
    if (normalized < 0.25) {
        // Blue to cyan
        const t = normalized * 4;
        return [0, Math.floor(t * 255), 255];
    } else if (normalized < 0.5) {
        // Cyan to green
        const t = (normalized - 0.25) * 4;
        return [0, 255, Math.floor((1 - t) * 255)];
    } else if (normalized < 0.75) {
        // Green to yellow
        const t = (normalized - 0.5) * 4;
        return [Math.floor(t * 255), 255, 0];
    } else {
        // Yellow to red
        const t = (normalized - 0.75) * 4;
        return [255, Math.floor((1 - t) * 255), 0];
    }
}

/**
 * Wind speed colormap (reproducing original earth.js colors)
 * Calm (transparent) -> Light (blue) -> Strong (red/purple)
 */
function windSpeedColorScale(magnitude: number): [number, number, number, number] {
    // Normalize wind speed (0 to 30 m/s range)
    const normalized = Math.max(0, Math.min(1, magnitude / 30));
    
    // Very low wind speeds should be nearly transparent
    if (magnitude < 0.5) {
        return [255, 255, 255, Math.floor(magnitude * 50)]; // Almost transparent
    }
    
    if (normalized < 0.3) {
        // Light blue for calm winds
        const t = normalized / 0.3;
        return [
            Math.floor(200 + t * 55),      // 200 -> 255
            Math.floor(230 + t * 25),      // 230 -> 255  
            255,                           // Full blue
            150                            // Semi-transparent
        ];
    } else if (normalized < 0.6) {
        // Blue to green for moderate winds
        const t = (normalized - 0.3) / 0.3;
        return [
            Math.floor((1 - t) * 100),     // 100 -> 0
            255,                           // Full green
            Math.floor((1 - t) * 255),     // 255 -> 0
            200                            // More opaque
        ];
    } else {
        // Green to red for strong winds
        const t = (normalized - 0.6) / 0.4;
        return [
            255,                           // Full red
            Math.floor((1 - t) * 255),     // 255 -> 0
            0,                             // No blue
            255                            // Fully opaque
        ];
    }
}

/**
 * Convert data values to color using proper scientific colormaps
 */
function vectorToColor(u: number, v: number, dataType: string = 'wind'): [number, number, number, number] {
    if (dataType === 'temperature' || dataType === 'scalar') {
        // For temperature data, use the first component (u) as temperature value
        const [r, g, b] = temperatureColorScale(u);
        return [r, g, b, 200]; // Semi-transparent temperature overlay
    } else {
        // For wind data, use magnitude
        const magnitude = Math.sqrt(u * u + v * v);
        return windSpeedColorScale(magnitude);
    }
}

/**
 * Core field interpolation function
 * Faithfully reproduces the interpolateField logic from earth.js with modern optimizations
 */
export async function interpolateField(config: InterpolationConfig): Promise<Field> {
    const { globe, grid, onProgress } = config;
    const projection = globe.projection;
    
    // Get viewport dimensions from globe object
    const { width, height } = globe.getViewport();
    
    onProgress?.(0, 'Creating mask...');
    
    // Create mask for visible area (critical performance optimization)
    const viewport: Viewport = globe.getViewport();
    
    const maskConfig = globe.defineMask(viewport);
    const maskData = maskConfig.context.getImageData(0, 0, width, height);
    
    // Prepare output arrays
    const vectors = new Float32Array(width * height * 2); // [u, v] pairs
    const overlayData = new ImageData(width, height);
    
    let processedPixels = 0;
    const totalPixels = width * height;
    const progressInterval = Math.floor(totalPixels / 100); // Update progress every 1%
    
    onProgress?.(5, 'Interpolating field...');
    
    // Process pixels in chunks to avoid blocking (async processing)
    const CHUNK_SIZE = 1000;
    
    for (let startPixel = 0; startPixel < totalPixels; startPixel += CHUNK_SIZE) {
        const endPixel = Math.min(startPixel + CHUNK_SIZE, totalPixels);
        
        // Process chunk
        for (let pixelIndex = startPixel; pixelIndex < endPixel; pixelIndex++) {
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            
            // Check if pixel is visible using mask
            const maskIndex = (y * width + x) * 4;
            const isVisible = maskData.data[maskIndex + 3] > 0; // Check alpha channel
            
            if (isVisible) {
                // Convert screen coordinates to geographic coordinates
                const coord = projection.invert ? projection.invert([x, y]) : null;
                
                if (coord && isFinite(coord[0]) && isFinite(coord[1])) {
                    const [lon, lat] = coord;
                    
                    // Interpolate data at this location
                    const interpolationResult = grid.interpolate(lon, lat);
                    
                    if (interpolationResult !== null) {
                        if (grid.type === 'vector' && Array.isArray(interpolationResult) && interpolationResult.length >= 2) {
                            const [rawU, rawV] = interpolationResult;
                            
                            // Calculate distortion correction
                            const distortion = calculateDistortion(projection, lon, lat, x, y);
                            
                            // Apply distortion correction to get visually correct vector
                            const [correctedU, correctedV] = applyDistortionCorrection(rawU, rawV, distortion);
                            
                            // Store corrected vector
                            const vectorIndex = pixelIndex * 2;
                            vectors[vectorIndex] = correctedU;
                            vectors[vectorIndex + 1] = correctedV;
                            
                            // Calculate overlay color
                            const [r, g, b, a] = vectorToColor(correctedU, correctedV, 'wind');
                            
                            // Store overlay color
                            const colorIndex = pixelIndex * 4;
                            overlayData.data[colorIndex] = r;
                            overlayData.data[colorIndex + 1] = g;
                            overlayData.data[colorIndex + 2] = b;
                            overlayData.data[colorIndex + 3] = a;
                        } else if (grid.type === 'scalar' && typeof interpolationResult === 'number') {
                            // For scalar data, we only need to calculate the color
                            const [r, g, b, a] = vectorToColor(interpolationResult, 0, 'temperature');
                            
                            // Store overlay color
                            const colorIndex = pixelIndex * 4;
                            overlayData.data[colorIndex] = r;
                            overlayData.data[colorIndex + 1] = g;
                            overlayData.data[colorIndex + 2] = b;
                            overlayData.data[colorIndex + 3] = a;
                        }
                    }
                }
            }
            
            processedPixels++;
            
            // Update progress
            if (processedPixels % progressInterval === 0) {
                const progress = 5 + (processedPixels / totalPixels) * 90; // 5% to 95%
                onProgress?.(progress, `Processing pixels: ${processedPixels}/${totalPixels}`);
            }
        }
        
        // Yield control to prevent blocking UI
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    onProgress?.(100, 'Field interpolation complete');
    
    return {
        vectors,
        overlay: overlayData,
        bounds: {
            width,
            height,
            valid: true
        }
    };
}

/**
 * Web Worker wrapper for field interpolation
 * Modern improvement over the original implementation - now with real Web Worker!
 */
export class FieldInterpolationWorker {
    private worker: Worker | null = null;
    private currentRequestId: string | null = null;
    
    constructor() {
        try {
            // Load the dedicated worker script
            this.worker = new Worker(
                new URL('../workers/field-interpolator.worker.ts', import.meta.url),
                { type: 'module' }
            );
            console.log('FieldInterpolationWorker initialized with Web Worker');
        } catch (error) {
            console.warn('Failed to create Web Worker, falling back to main thread:', error);
            this.worker = null;
        }
    }
    
    async interpolate(config: InterpolationConfig): Promise<Field> {
        // Cancel any existing work
        if (this.currentRequestId) {
            console.log('Cancelling previous interpolation task');
        }
        
        if (!this.worker) {
            // Fallback to main thread if worker failed to initialize
            console.log('Using main thread fallback for interpolation');
            return interpolateField(config);
        }
        
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not available'));
                return;
            }
            
            // Generate unique request ID
            const requestId = Math.random().toString(36).substring(2);
            this.currentRequestId = requestId;
            
            // Prepare worker data
            const { globe, grid } = config;
            const projection = globe.projection;
            
            // Get viewport from globe
            const viewport = globe.getViewport();
            
            // Create mask for visible area
            const maskConfig = globe.defineMask(viewport);
            const maskData = maskConfig.context.getImageData(0, 0, viewport.width, viewport.height);
            
            // Setup message handler
            const handleMessage = (event: MessageEvent) => {
                const response = event.data;
                
                if (response.id !== requestId) {
                    return; // Ignore messages from previous requests
                }
                
                switch (response.type) {
                    case 'progress':
                        if (config.onProgress && response.progress) {
                            config.onProgress(response.progress.percentage, response.progress.message);
                        }
                        break;
                        
                    case 'result':
                        this.worker?.removeEventListener('message', handleMessage);
                        this.currentRequestId = null;
                        
                        // Reconstruct Field object from transferred data
                        const { vectors: vectorsBuffer, overlay: overlayData, bounds } = response.data;
                        
                        const vectors = new Float32Array(vectorsBuffer);
                        const overlay = new ImageData(
                            new Uint8ClampedArray(overlayData.data),
                            overlayData.width,
                            overlayData.height
                        );
                        
                        resolve({
                            vectors,
                            overlay,
                            bounds
                        });
                        break;
                        
                    case 'error':
                        this.worker?.removeEventListener('message', handleMessage);
                        this.currentRequestId = null;
                        reject(new Error(response.error || 'Worker error'));
                        break;
                }
            };
            
            this.worker.addEventListener('message', handleMessage);
            
            // Send work to worker
            try {
                // Prepare grid data based on type
                let gridData: any = {
                    type: grid.type,
                    bounds: grid.bounds,
                    dimensions: grid.dimensions,
                    resolution: grid.resolution,
                    // Per-variable color scale descriptor (raw-unit). The worker
                    // reconstructs the gradient so each field is colored on its
                    // own physical range, matching the original earth.js.
                    colorScale: grid.colorScale
                };

                if (grid.type === 'vector') {
                    const vectorGrid = grid as any;
                    gridData.data = {
                        u: vectorGrid.uData,
                        v: vectorGrid.vData
                    };
                } else {
                    const scalarGrid = grid as any;
                    gridData.data = {
                        scalar: scalarGrid.scalarData
                    };
                }

                // `globe` and `grid` are already destructured at the top of this
                // Promise executor. Re-declaring them here put `grid` in a
                // temporal dead zone, so `grid.type` above threw
                // "Cannot access 'grid' before initialization".
                const orientation = globe.orientation(); // Get the globe's current rotation

                this.worker.postMessage({
                    id: requestId,
                    type: 'interpolate',
                    data: {
                        projectionConfig: {
                            scale: projection.scale(),
                            translate: projection.translate(),
                            orientation: orientation
                        },
                        grid: gridData,
                        viewport,
                        maskData
                    }
                });
            } catch (error) {
                this.worker.removeEventListener('message', handleMessage);
                reject(error);
            }
        });
    }
    
    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.currentRequestId = null;
    }
}

/**
 * Create a field interpolation worker
 * Factory function maintaining compatibility with original pattern
 */
export function createFieldInterpolator(): FieldInterpolationWorker {
    return new FieldInterpolationWorker();
}
