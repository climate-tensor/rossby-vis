/**
 * @fileoverview
 * Globe Registry and Factory - Phase 1.4 Implementation
 * 
 * This module implements the main globe registry, reproducing the
 * globe factory pattern from the original globes.js with type safety.
 */

import type { Globe, GlobeFactory, GlobeRegistry, ProjectionType, Viewport } from './types';
import { createOrthographicGlobe } from './orthographic';
import { createEquirectangularGlobe } from './equirectangular';

/**
 * Globe factory registry
 * Reproduces the globe factory pattern from the original globes.js
 */
export const GLOBE_FACTORIES: GlobeRegistry = {
    'orthographic': createOrthographicGlobe,
    'equirectangular': createEquirectangularGlobe,
};

/**
 * Globe factory service
 * Provides the main interface for creating and managing globes
 */
export class GlobeService {
    private static instance: GlobeService;
    private globeCache = new Map<string, Globe>();

    private constructor() {}

    /**
     * Get singleton instance
     */
    static getInstance(): GlobeService {
        if (!GlobeService.instance) {
            GlobeService.instance = new GlobeService();
        }
        return GlobeService.instance;
    }

    /**
     * Create a globe by projection type
     * Reproduces the globe creation logic from the original globes.js
     */
    createGlobe(projectionType: ProjectionType, viewport: Viewport): Globe | null {
        // Create cache key from projection type and viewport signature
        const cacheKey = `${projectionType}-${viewport.width}x${viewport.height}-${viewport.scale}`;
        
        // Check cache first (but only for identical viewports)
        if (this.globeCache.has(cacheKey)) {
            const cachedGlobe = this.globeCache.get(cacheKey)!;
            // Update viewport in case it changed
            cachedGlobe.updateViewport(viewport);
            return cachedGlobe;
        }

        // Get factory from registry
        const factory = GLOBE_FACTORIES[projectionType];
        if (!factory) {
            console.warn(`Unknown projection type: ${projectionType}`);
            return null;
        }

        try {
            // Create globe using factory
            const globe = factory(viewport);
            
            // Cache the globe
            this.globeCache.set(cacheKey, globe);
            
            return globe;
        } catch (error) {
            console.error(`Failed to create globe with projection ${projectionType}:`, error);
            return null;
        }
    }

    /**
     * Get all available projection types
     */
    getAvailableProjections(): ProjectionType[] {
        return Object.keys(GLOBE_FACTORIES) as ProjectionType[];
    }

    /**
     * Check if a projection type is supported
     */
    hasProjection(projectionType: string): boolean {
        return projectionType in GLOBE_FACTORIES;
    }

    /**
     * Clear globe cache
     */
    clearCache(): void {
        this.globeCache.clear();
    }

    /**
     * Get human-readable names for projections
     */
    getProjectionDisplayName(projectionType: ProjectionType): string {
        const displayNames: Record<ProjectionType, string> = {
            'orthographic': 'Orthographic',
            'equirectangular': 'Equirectangular',
            'mercator': 'Mercator',
            'stereographic': 'Stereographic',
            'azimuthalEqualArea': 'Azimuthal Equal Area'
        };
        return displayNames[projectionType] || projectionType;
    }
}

/**
 * Default globe service instance
 */
export const globeService = GlobeService.getInstance();

/**
 * Convenience function to create a globe
 * Maintains compatibility with the original factory pattern
 */
export function createGlobe(projectionType: ProjectionType, viewport: Viewport): Globe | null {
    return globeService.createGlobe(projectionType, viewport);
}

/**
 * Create a standard globe with default settings
 * Reproduces the standardGlobe function from the original globes.js
 */
export function createStandardGlobe(
    projectionType: ProjectionType = 'orthographic',
    options: {
        width?: number;
        height?: number;
        scale?: number;
    } = {}
): Globe | null {
    const viewport: Viewport = {
        width: options.width || 800,
        height: options.height || 600,
        scale: options.scale || 250,
        translate: [
            (options.width || 800) / 2,
            (options.height || 600) / 2
        ]
    };

    return createGlobe(projectionType, viewport);
}

/**
 * Export all types and implementations for external use
 */
export * from './types';
export * from './orthographic';
export * from './equirectangular';
