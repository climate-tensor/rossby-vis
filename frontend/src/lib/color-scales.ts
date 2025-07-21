/**
 * @fileoverview
 * Color Scale Utilities - Faithful reproduction of micro.js color functions
 * 
 * This module reproduces the color scaling functions from the original earth.js micro.js,
 * providing scientific color mapping for meteorological and oceanographic data.
 */

const τ = 2 * Math.PI;

/**
 * Color interpolator function from micro.js
 */
function colorInterpolator(start: number[], end: number[]) {
    const r = start[0], g = start[1], b = start[2];
    const Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
    return function(i: number, a: number) {
        return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
    };
}

/**
 * Produces a color style in a rainbow-like trefoil color space.
 * Faithful reproduction from micro.js
 */
export function sinebowColor(hue: number, a: number): number[] {
    // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
    // hue == 1 from mapping to the same color.
    let rad = hue * τ * 5/6;
    rad *= 0.75;  // increase frequency to 2/3 cycle per rad

    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const r = Math.floor(Math.max(0, -c) * 255);
    const g = Math.floor(Math.max(s, 0) * 255);
    const b = Math.floor(Math.max(c, 0, -s) * 255);
    return [r, g, b, a];
}

const BOUNDARY = 0.45;
const fadeToWhite = colorInterpolator(sinebowColor(1.0, 0), [255, 255, 255]);

/**
 * Interpolates a sinebow color where 0 <= i <= j, then fades to white where j < i <= 1.
 * Faithful reproduction from micro.js
 */
export function extendedSinebowColor(i: number, a: number): number[] {
    return i <= BOUNDARY ?
        sinebowColor(i / BOUNDARY, a) :
        fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
}

/**
 * Clamps value to range [low, high]
 */
function clamp(x: number, low: number, high: number): number {
    return Math.max(low, Math.min(x, high));
}

/**
 * Returns the fraction of the bounds [low, high] covered by the value x, after clamping x to the bounds.
 */
function proportion(x: number, low: number, high: number): number {
    return (clamp(x, low, high) - low) / (high - low);
}

/**
 * Creates a color scale composed of the specified segments.
 * Faithful reproduction from micro.js
 */
export function segmentedColorScale(segments: [number, number[]][]): (point: number, alpha: number) => number[] {
    const points: number[] = [], interpolators: any[] = [], ranges: [number, number][] = [];
    
    for (let i = 0; i < segments.length - 1; i++) {
        points.push(segments[i+1][0]);
        interpolators.push(colorInterpolator(segments[i][1], segments[i+1][1]));
        ranges.push([segments[i][0], segments[i+1][0]]);
    }

    return function(point: number, alpha: number): number[] {
        let i;
        for (i = 0; i < points.length - 1; i++) {
            if (point <= points[i]) {
                break;
            }
        }
        const range = ranges[i];
        return interpolators[i](proportion(point, range[0], range[1]), alpha);
    };
}

/**
 * Convert color array to CSS color string
 */
export function asColorStyle(r: number, g: number, b: number, a: number): string {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Temperature color scale using segmented approach from original products.js
 * Based on the Temperature scale in products.js
 */
export function temperatureColorScale(): (value: number) => string {
    const scale = segmentedColorScale([
        [240,     [37, 4, 42]],      // Very cold (purple)
        [250,     [41, 10, 130]],    // Cold (blue)
        [260,     [70, 215, 215]],   // Cool (cyan)
        [273.15,  [21, 84, 187]],    // 0°C (blue)
        [280,     [24, 132, 14]],    // Mild (green)
        [290,     [247, 251, 59]],   // Warm (yellow)
        [300,     [235, 167, 21]],   // Hot (orange)
        [320,     [88, 27, 67]]      // Very hot (red)
    ]);
    
    return function(value: number): string {
        // Convert Celsius to Kelvin if needed
        const kelvin = value > 100 ? value : value + 273.15;
        const color = scale(kelvin, 1.0);
        return asColorStyle(color[0], color[1], color[2], color[3]);
    };
}

/**
 * Wind speed color scale using extended sinebow from original products.js
 */
export function windSpeedColorScale(): (speed: number) => string {
    return function(speed: number): string {
        // Normalize speed to [0, 1] range for color mapping
        const normalized = Math.min(speed / 100, 1); // 0-100 m/s range
        const color = extendedSinebowColor(normalized, 1.0);
        return asColorStyle(color[0], color[1], color[2], color[3]);
    };
}

/**
 * Pressure color scale based on original products.js
 */
export function pressureColorScale(): (value: number) => string {
    const scale = segmentedColorScale([
        [90000, [40, 0, 0]],
        [95000, [187, 60, 31]],
        [98000, [16, 1, 43]],
        [101300, [241, 254, 18]],
        [105000, [255, 255, 255]]
    ]);
    
    return function(value: number): string {
        const color = scale(value, 1.0);
        return asColorStyle(color[0], color[1], color[2], color[3]);
    };
}

/**
 * Geopotential height color scale based on original products.js
 */
export function geopotentialColorScale(): (value: number) => string {
    const scale = segmentedColorScale([
        [100,    [41, 10, 130]],     // Deep Trough (cool blue/purple)
        [5100,   [70, 215, 215]],    // Trough (cyan)
        [10100,  [24, 132, 14]],     // Zonal Flow (green)
        [15100,  [247, 251, 59]],    // Ridge (warm yellow)
        [20100,  [235, 167, 21]]     // Strong Ridge (hot orange)
    ]);
    
    return function(value: number): string {
        const color = scale(value, 1.0);
        return asColorStyle(color[0], color[1], color[2], color[3]);
    };
}

/**
 * Ocean currents color scale based on original products.js
 */
export function oceanCurrentsColorScale(): (speed: number) => string {
    const scale = segmentedColorScale([
        [0, [10, 25, 68]],
        [0.15, [10, 25, 250]],
        [0.4, [24, 255, 93]],
        [0.65, [255, 233, 102]],
        [1.0, [255, 233, 15]],
        [1.5, [255, 15, 15]]
    ]);
    
    return function(speed: number): string {
        const color = scale(speed, 1.0);
        return asColorStyle(color[0], color[1], color[2], color[3]);
    };
}

/**
 * Get appropriate color scale function for variable type
 */
export function getColorScaleForVariable(variable: string): (value: number) => string {
    const varLower = variable.toLowerCase();
    
    if (varLower.includes('temp') || varLower.includes('t2m') || varLower.includes('sst') || 
        varLower === 't' || /^t\d*$/.test(varLower)) {
        return temperatureColorScale();
    }
    
    if (varLower.includes('wind') || varLower.includes('gust') || 
        /^[uv]\d*$/.test(varLower)) {
        return windSpeedColorScale();
    }
    
    if (varLower.includes('pressure') || varLower.includes('sp') || varLower.includes('msl')) {
        return pressureColorScale();
    }
    
    if (varLower.includes('geopotential') || varLower === 'z' || /^z\d*$/.test(varLower)) {
        return geopotentialColorScale();
    }
    
    if (varLower.includes('current')) {
        return oceanCurrentsColorScale();
    }
    
    // Default to temperature scale
    return temperatureColorScale();
}
