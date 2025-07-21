/**
 * @fileoverview
 * Data Product Type Definitions - Phase 1.3 Implementation
 * 
 * This module defines the core interfaces for data products, reproducing
 * the factory pattern from the original products.js with TypeScript safety.
 */

/**
 * Represents a data grid with interpolation capabilities
 * This is the core data structure returned by Product.buildGrid()
 */
export interface Grid {
    /** Data type classification */
    type: 'vector' | 'scalar';

    /**
     * Interpolate data value at given geographic coordinates
     * This is the primary interface for data queries
     * @param lon Longitude in degrees
     * @param lat Latitude in degrees  
     * @returns Interpolated value(s) or null if outside bounds
     */
    interpolate(lon: number, lat: number): number[] | number | null;
    
    /**
     * Grid metadata
     */
    bounds: {
        north: number;
        south: number;
        east: number;
        west: number;
    };
    
    /**
     * Grid dimensions
     */
    dimensions: {
        width: number;
        height: number;
    };
    
    /**
     * Grid resolution
     */
    resolution: {
        deltaLon: number;
        deltaLat: number;
    };
}

/**
 * Vector grid for multi-component data (e.g., wind u/v components)
 */
export interface VectorGrid extends Grid {
    type: 'vector';
    interpolate(lon: number, lat: number): [number, number] | null;
}

/**
 * Scalar grid for single-value data (e.g., temperature, pressure)
 */
export interface ScalarGrid extends Grid {
    type: 'scalar';
    interpolate(lon: number, lat: number): number | null;
}

/**
 * Configuration for particle animation
 */
export interface ParticleConfig {
    /** Number of particles to animate */
    count: number;
    /** Particle lifecycle in animation frames */
    maxAge: number;
    /** Particle velocity multiplier */
    velocityScale: number;
    /** Particle trail length */
    trailLength: number;
}

/**
 * Color scale configuration for data visualization
 */
export interface ColorScale {
    /** Minimum value for color mapping */
    min: number;
    /** Maximum value for color mapping */
    max: number;
    /** Color palette identifier */
    palette: string;
    /** Number of color steps */
    steps?: number;
}

/**
 * Core Product interface - reproduces the product factory pattern
 * from the original earth project with modern TypeScript
 */
export interface Product {
    /** Unique identifier for this product */
    id: string;
    
    /** Human-readable name */
    name: string;
    
    /** Detailed description */
    description: string;
    
    /** Data source identifier */
    source: string;
    
    /** Physical units */
    units: string;
    
    /** Data type classification */
    type: 'vector' | 'scalar';
    
    /** Visualization role */
    role: 'base' | 'overlay';
    
    /** Color scale configuration for visualization */
    scale: ColorScale;
    
    /** Particle animation configuration (for vector fields) */
    particles?: ParticleConfig;
    
    /**
     * Build a data grid from raw data
     * This is the core method that loads and processes data
     * @param rawData Raw data from the server
     * @returns Promise resolving to a Grid with interpolation capabilities
     */
    buildGrid(rawData: any): Promise<Grid>;
    
    /**
     * Validate if raw data is compatible with this product
     * @param rawData Raw data to validate
     * @returns true if data is valid for this product
     */
    isValidData(rawData: any): boolean;
}

/**
 * Factory function type for creating products
 */
export type ProductFactory = () => Product;

/**
 * Registry of available product factories
 * Reproduces the FACTORIES pattern from the original products.js
 */
export interface ProductRegistry {
    [productId: string]: ProductFactory;
}
