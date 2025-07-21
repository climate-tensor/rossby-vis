/**
 * @fileoverview
 * Grid Implementation with Bilinear Interpolation - Phase 1.3 Implementation
 * 
 * This module implements the Grid interfaces with bilinear interpolation,
 * reproducing the interpolation algorithms from the original products.js
 */

import type { Grid, VectorGrid, ScalarGrid } from './types';

/**
 * Base grid implementation with common functionality
 */
abstract class BaseGrid implements Grid {
    abstract type: 'vector' | 'scalar';
    protected data: Float32Array;
    protected width: number;
    protected height: number;
    protected north: number;
    protected south: number;
    protected east: number;
    protected west: number;
    protected deltaLon: number;
    protected deltaLat: number;

    constructor(
        data: Float32Array,
        bounds: { north: number; south: number; east: number; west: number },
        dimensions: { width: number; height: number }
    ) {
        this.data = data;
        this.width = dimensions.width;
        this.height = dimensions.height;
        this.north = bounds.north;
        this.south = bounds.south;
        this.east = bounds.east;
        this.west = bounds.west;
        this.deltaLon = (this.east - this.west) / (this.width - 1);
        this.deltaLat = (this.north - this.south) / (this.height - 1);
    }

    get bounds() {
        return {
            north: this.north,
            south: this.south,
            east: this.east,
            west: this.west
        };
    }

    get dimensions() {
        return {
            width: this.width,
            height: this.height
        };
    }

    get resolution() {
        return {
            deltaLon: this.deltaLon,
            deltaLat: this.deltaLat
        };
    }

    /**
     * Check if coordinates are within grid bounds
     */
    protected isInBounds(lon: number, lat: number): boolean {
        return lon >= this.west && lon <= this.east && 
               lat >= this.south && lat <= this.north;
    }

    /**
     * Convert geographic coordinates to grid indices
     * Returns floating point indices for interpolation
     */
    protected coordsToIndices(lon: number, lat: number): { i: number; j: number } {
        const i = (lon - this.west) / this.deltaLon;
        const j = (this.north - lat) / this.deltaLat; // Note: j increases downward
        return { i, j };
    }

    /**
     * Get data value at specific grid point
     */
    protected getValueAt(x: number, y: number): number {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return NaN;
        }
        return this.data[y * this.width + x];
    }

    /**
     * Bilinear interpolation implementation
     * Reproduces the bilinearInterpolateVector logic from the original products.js
     */
    protected bilinearInterpolate(i: number, j: number): number | null {
        // Get the four surrounding grid points
        const x0 = Math.floor(i);
        const x1 = x0 + 1;
        const y0 = Math.floor(j);
        const y1 = y0 + 1;

        // Get values at the four corners
        const v00 = this.getValueAt(x0, y0); // top-left
        const v10 = this.getValueAt(x1, y0); // top-right
        const v01 = this.getValueAt(x0, y1); // bottom-left
        const v11 = this.getValueAt(x1, y1); // bottom-right

        // Check if any corner value is invalid
        if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) {
            return null;
        }

        // Calculate interpolation weights
        const fx = i - x0; // fractional part of i
        const fy = j - y0; // fractional part of j

        // Bilinear interpolation formula
        const top = v00 * (1 - fx) + v10 * fx;
        const bottom = v01 * (1 - fx) + v11 * fx;
        return top * (1 - fy) + bottom * fy;
    }

    abstract interpolate(lon: number, lat: number): number[] | number | null;
}

/**
 * Scalar grid implementation for single-value data
 */
export class ScalarGridImpl extends BaseGrid implements ScalarGrid {
    readonly type = 'scalar';

    /**
     * Get raw scalar data (for worker serialization)
     */
    get scalarData(): Float32Array {
        return this.data;
    }

    interpolate(lon: number, lat: number): number | null {
        if (!this.isInBounds(lon, lat)) {
            return null;
        }

        const { i, j } = this.coordsToIndices(lon, lat);
        return this.bilinearInterpolate(i, j);
    }
}

/**
 * Vector grid implementation for two-component data (u, v)
 */
export class VectorGridImpl extends BaseGrid implements VectorGrid {
    readonly type = 'vector';
    private _vData: Float32Array; // v-component data

    constructor(
        uData: Float32Array,
        vData: Float32Array,
        bounds: { north: number; south: number; east: number; west: number },
        dimensions: { width: number; height: number }
    ) {
        super(uData, bounds, dimensions);
        this._vData = vData;
    }

    /**
     * Get raw u-component data (for worker serialization)
     */
    get uData(): Float32Array {
        return this.data;
    }

    /**
     * Get raw v-component data (for worker serialization)
     */
    get vData(): Float32Array {
        return this._vData;
    }

    /**
     * Get v-component value at specific grid point
     */
    private getVValueAt(x: number, y: number): number {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return NaN;
        }
        return this._vData[y * this.width + x];
    }

    /**
     * Bilinear interpolation for v-component
     */
    private bilinearInterpolateV(i: number, j: number): number | null {
        const x0 = Math.floor(i);
        const x1 = x0 + 1;
        const y0 = Math.floor(j);
        const y1 = y0 + 1;

        const v00 = this.getVValueAt(x0, y0);
        const v10 = this.getVValueAt(x1, y0);
        const v01 = this.getVValueAt(x0, y1);
        const v11 = this.getVValueAt(x1, y1);

        if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) {
            return null;
        }

        const fx = i - x0;
        const fy = j - y0;

        const top = v00 * (1 - fx) + v10 * fx;
        const bottom = v01 * (1 - fx) + v11 * fx;
        return top * (1 - fy) + bottom * fy;
    }

    interpolate(lon: number, lat: number): [number, number] | null {
        if (!this.isInBounds(lon, lat)) {
            return null;
        }

        const { i, j } = this.coordsToIndices(lon, lat);
        
        const u = this.bilinearInterpolate(i, j);
        const v = this.bilinearInterpolateV(i, j);

        if (u === null || v === null) {
            return null;
        }

        return [u, v];
    }
}

/**
 * Factory functions for creating grids from raw data
 */
export class GridFactory {
    /**
     * Create a scalar grid from raw data
     */
    static createScalarGrid(
        data: number[],
        bounds: { north: number; south: number; east: number; west: number },
        dimensions: { width: number; height: number }
    ): ScalarGrid {
        const float32Data = new Float32Array(data);
        return new ScalarGridImpl(float32Data, bounds, dimensions);
    }

    /**
     * Create a vector grid from raw u and v component data
     */
    static createVectorGrid(
        uData: number[],
        vData: number[],
        bounds: { north: number; south: number; east: number; west: number },
        dimensions: { width: number; height: number }
    ): VectorGrid {
        const uFloat32 = new Float32Array(uData);
        const vFloat32 = new Float32Array(vData);
        return new VectorGridImpl(uFloat32, vFloat32, bounds, dimensions);
    }
}
