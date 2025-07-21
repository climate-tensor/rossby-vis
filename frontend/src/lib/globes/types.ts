/**
 * @fileoverview
 * Globe Model Type Definitions - Phase 1.4 Implementation
 * 
 * This module defines the core interfaces for globe models, reproducing
 * the standardGlobe API from the original globes.js with TypeScript safety.
 */

import type { GeoProjection, GeoPath } from 'd3-geo';

/**
 * Geographic bounds
 */
export interface GeoBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

/**
 * Globe orientation (rotation angles)
 */
export interface GlobeOrientation {
    /** Longitude rotation (yaw) */
    lambda: number;
    /** Latitude rotation (pitch) */
    phi: number;
    /** Roll rotation */
    gamma: number;
}

/**
 * Viewport configuration
 */
export interface Viewport {
    width: number;
    height: number;
    scale: number;
    translate: [number, number];
}

/**
 * Mask configuration for rendering optimization
 * This reproduces the defineMask functionality from the original
 */
export interface MaskConfig {
    /** Canvas element for the mask */
    canvas: HTMLCanvasElement;
    /** Render context */
    context: CanvasRenderingContext2D;
    /** Check if a pixel is visible */
    isVisible(x: number, y: number): boolean;
}

/**
 * Interaction manipulator for handling user input
 * Reproduces the manipulator API from the original globes.js
 */
export interface GlobeManipulator {
    /** Start interaction (mouse down) */
    start(x: number, y: number): void;
    /** Update interaction (mouse move) */
    move(x: number, y: number): void;
    /** End interaction (mouse up) */
    end(): void;
    /** Get current orientation */
    orientation(): GlobeOrientation;
    /** Set orientation */
    setOrientation(orientation: GlobeOrientation): void;
    /** Event listeners */
    on(event: 'moveStart' | 'move' | 'moveEnd', listener: () => void): void;
    off(event: 'moveStart' | 'move' | 'moveEnd', listener: () => void): void;
}

/**
 * Map configuration for SVG rendering
 */
export interface MapConfig {
    /** SVG container element */
    svg: SVGElement;
    /** Coastline resolution ('low' | 'medium' | 'high') */
    resolution: string;
    /** Show graticule grid */
    showGraticule: boolean;
}

/**
 * Core Globe interface
 * Reproduces the standardGlobe API from the original globes.js
 */
export interface Globe {
    /** Unique identifier for this globe type */
    readonly id: string;
    
    /** Human-readable name */
    readonly name: string;
    
    /** D3 projection instance */
    readonly projection: GeoProjection;
    
    /** Geographic bounds of the visible area */
    bounds(): GeoBounds;
    
    /** Current orientation (rotation) */
    orientation(): GlobeOrientation;
    
    /** Set orientation with optional animation */
    setOrientation(orientation: GlobeOrientation, animate?: boolean): void;
    
    /** Serialize orientation to string for URL persistence */
    serializeOrientation(): string;
    
    /** Deserialize orientation from string */
    deserializeOrientation(serialized: string): GlobeOrientation | null;
    
    /** Interaction manipulator */
    manipulator(): GlobeManipulator;
    
    /** Define rendering mask for performance optimization */
    defineMask(viewport: Viewport): MaskConfig;
    
    /** Define SVG map structure */
    defineMap(config: MapConfig): void;
    
    /** Update viewport (size, scale, translation) */
    updateViewport(viewport: Viewport): void;

    /** Get current viewport */
    getViewport(): Viewport;
    
    /** Check if coordinates are visible in current projection */
    isVisible(lon: number, lat: number): boolean;
    
    /** Convert screen coordinates to geographic coordinates */
    invert(x: number, y: number): [number, number] | null;
    
    /** Convert geographic coordinates to screen coordinates */
    project(lon: number, lat: number): [number, number] | null;
}

/**
 * Globe factory function type
 */
export type GlobeFactory = (viewport: Viewport) => Globe;

/**
 * Registry of available globe factories
 */
export interface GlobeRegistry {
    [globeId: string]: GlobeFactory;
}

/**
 * Projection type identifiers
 */
export type ProjectionType = 
    | 'orthographic'
    | 'equirectangular' 
    | 'mercator'
    | 'stereographic'
    | 'azimuthalEqualArea';
