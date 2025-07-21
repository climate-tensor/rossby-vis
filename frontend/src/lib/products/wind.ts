/**
 * @fileoverview
 * Wind Product Implementation - Phase 1.3 Implementation
 * 
 * This module implements wind data products (u/v components),
 * reproducing the wind factory pattern from the original products.js
 */

import type { Product, VectorGrid, ParticleConfig, ColorScale } from './types';
import { GridFactory } from './grid';

/**
 * Base wind product implementation
 */
class WindProduct implements Product {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly source: string;
    readonly units: string;
    readonly type = 'vector' as const;
    readonly role = 'overlay' as const;
    readonly scale: ColorScale;
    readonly particles: ParticleConfig;

    constructor(config: {
        id: string;
        name: string;
        description: string;
        source: string;
        scale: ColorScale;
        particles?: Partial<ParticleConfig>;
    }) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.source = config.source;
        this.units = 'm/s';
        this.scale = config.scale;
        this.particles = {
            count: 2000,
            maxAge: 90,
            velocityScale: 0.01,
            trailLength: 1,
            ...config.particles
        };
    }

    async buildGrid(rawData: any): Promise<VectorGrid> {
        if (!this.isValidData(rawData)) {
            throw new Error(`Invalid data format for wind product ${this.id}`);
        }

        // Extract metadata and data arrays
        const { metadata, data } = rawData;
        const { shape, bounds } = metadata;
        
        // Assuming data format: { u: number[], v: number[] }
        const uData = data.u || data.uComponent || data['10u'] || [];
        const vData = data.v || data.vComponent || data['10v'] || [];

        if (uData.length === 0 || vData.length === 0) {
            throw new Error('Missing u or v wind components in data');
        }

        // Extract grid dimensions and bounds
        const dimensions = {
            width: shape[2] || shape[1], // longitude dimension
            height: shape[1] || shape[0]  // latitude dimension
        };

        const gridBounds = {
            north: bounds.north || 90,
            south: bounds.south || -90,
            east: bounds.east || 180,
            west: bounds.west || -180
        };

        return GridFactory.createVectorGrid(uData, vData, gridBounds, dimensions);
    }

    isValidData(rawData: any): boolean {
        if (!rawData || typeof rawData !== 'object') {
            return false;
        }

        const { metadata, data } = rawData;
        
        // Check metadata structure
        if (!metadata || !metadata.shape || !Array.isArray(metadata.shape)) {
            return false;
        }

        // Check data structure - should have u and v components
        if (!data || typeof data !== 'object') {
            return false;
        }

        const hasUComponent = !!(data.u || data.uComponent || data['10u']);
        const hasVComponent = !!(data.v || data.vComponent || data['10v']);

        return hasUComponent && hasVComponent;
    }
}

/**
 * 10-meter wind product factory
 */
export function createWind10mProduct(): Product {
    return new WindProduct({
        id: 'wnd10m',
        name: '10m Wind',
        description: 'Wind velocity at 10 meters above ground level',
        source: 'ERA5',
        scale: {
            min: 0,
            max: 20,
            palette: 'wind',
            steps: 10
        },
        particles: {
            count: 3000,
            maxAge: 100,
            velocityScale: 0.012
        }
    });
}

/**
 * Surface wind product factory (generic)
 */
export function createSurfaceWindProduct(): Product {
    return new WindProduct({
        id: 'wind-surface',
        name: 'Surface Wind',
        description: 'Surface wind velocity',
        source: 'Generic',
        scale: {
            min: 0,
            max: 25,
            palette: 'wind'
        }
    });
}

/**
 * Upper-level wind product factory
 */
export function createUpperWindProduct(level: number): Product {
    return new WindProduct({
        id: `wind-${level}`,
        name: `${level}hPa Wind`,
        description: `Wind velocity at ${level} hPa pressure level`,
        source: 'ERA5',
        scale: {
            min: 0,
            max: 50,
            palette: 'wind'
        },
        particles: {
            count: 2500,
            maxAge: 80,
            velocityScale: 0.008
        }
    });
}
