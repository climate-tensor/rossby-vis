/**
 * @fileoverview
 * Equirectangular Globe Implementation - Phase 1.4 Implementation
 * 
 * This module implements the equirectangular projection globe,
 * reproducing the equirectangular functionality from the original globes.js
 */

import { geoEquirectangular, geoPath, geoGraticule } from 'd3-geo';
import type { 
    Globe, 
    GlobeOrientation, 
    GlobeManipulator, 
    GeoBounds, 
    Viewport, 
    MaskConfig, 
    MapConfig 
} from './types';

/**
 * Simple event emitter for manipulator events
 */
class EventEmitter {
    private listeners = new Map<string, Set<() => void>>();

    on(event: string, listener: () => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
    }

    off(event: string, listener: () => void): void {
        this.listeners.get(event)?.delete(listener);
    }

    emit(event: string): void {
        this.listeners.get(event)?.forEach(listener => listener());
    }
}

/**
 * Equirectangular manipulator for handling user interactions
 */
class EquirectangularManipulator extends EventEmitter implements GlobeManipulator {
    private globe: EquirectangularGlobe;
    private isActive = false;
    private lastPosition: [number, number] | null = null;
    private startOrientation: GlobeOrientation | null = null;

    constructor(globe: EquirectangularGlobe) {
        super();
        this.globe = globe;
    }

    start(x: number, y: number): void {
        this.isActive = true;
        this.lastPosition = [x, y];
        this.startOrientation = { ...this.globe.orientation() };
        this.emit('moveStart');
    }

    move(x: number, y: number): void {
        if (!this.isActive || !this.lastPosition || !this.startOrientation) {
            return;
        }

        const [lastX, lastY] = this.lastPosition;
        const deltaX = x - lastX;
        const deltaY = y - lastY;

        // For equirectangular, we can pan the center longitude and latitude
        const scale = this.globe.projection.scale();
        const lonScale = 360 / (scale * 2 * Math.PI);
        const latScale = 180 / (scale * Math.PI);

        const newLambda = this.startOrientation.lambda - deltaX * lonScale;
        const newPhi = Math.max(-90, Math.min(90, 
            this.startOrientation.phi + deltaY * latScale));

        this.globe.setOrientation({
            lambda: newLambda,
            phi: newPhi,
            gamma: this.startOrientation.gamma
        });

        this.emit('move');
    }

    end(): void {
        this.isActive = false;
        this.lastPosition = null;
        this.startOrientation = null;
        this.emit('moveEnd');
    }

    orientation(): GlobeOrientation {
        return this.globe.orientation();
    }

    setOrientation(orientation: GlobeOrientation): void {
        this.globe.setOrientation(orientation);
    }
}

/**
 * Equirectangular globe implementation
 */
export class EquirectangularGlobe implements Globe {
    readonly id = 'equirectangular';
    readonly name = 'Equirectangular';
    readonly projection: ReturnType<typeof geoEquirectangular>;

    private currentOrientation: GlobeOrientation = { lambda: 0, phi: 0, gamma: 0 };
    private viewport: Viewport;
    private manipulatorInstance: EquirectangularManipulator;

    constructor(viewport: Viewport) {
        this.viewport = viewport;
        this.projection = geoEquirectangular()
            .scale(viewport.scale)
            .translate(viewport.translate)
            .rotate([0, 0, 0]);
        
        this.manipulatorInstance = new EquirectangularManipulator(this);
    }

    bounds(): GeoBounds {
        // For equirectangular projection, calculate visible bounds based on viewport
        const topLeft = this.projection.invert?.([0, 0]);
        const bottomRight = this.projection.invert?.([this.viewport.width, this.viewport.height]);
        
        if (!topLeft || !bottomRight) {
            return { north: 90, south: -90, east: 180, west: -180 };
        }

        return {
            north: topLeft[1],
            south: bottomRight[1],
            east: bottomRight[0],
            west: topLeft[0]
        };
    }

    orientation(): GlobeOrientation {
        return { ...this.currentOrientation };
    }

    setOrientation(orientation: GlobeOrientation, animate?: boolean): void {
        this.currentOrientation = { ...orientation };
        this.projection.rotate([
            orientation.lambda,
            -orientation.phi,  // Note: D3 uses negative phi
            orientation.gamma
        ]);

        // Animation would be implemented here if needed
        if (animate) {
            // TODO: Implement smooth panning animation
        }
    }

    serializeOrientation(): string {
        const { lambda, phi, gamma } = this.currentOrientation;
        return `${lambda.toFixed(2)},${phi.toFixed(2)},${gamma.toFixed(2)}`;
    }

    deserializeOrientation(serialized: string): GlobeOrientation | null {
        try {
            const parts = serialized.split(',').map(Number);
            if (parts.length !== 3 || parts.some(isNaN)) {
                return null;
            }
            return {
                lambda: parts[0],
                phi: parts[1],
                gamma: parts[2]
            };
        } catch {
            return null;
        }
    }

    manipulator(): GlobeManipulator {
        return this.manipulatorInstance;
    }

    defineMask(viewport: Viewport): MaskConfig {
        // For equirectangular projection, the entire viewport is visible
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d')!;

        // Fill entire canvas as visible
        context.fillStyle = 'rgba(255, 255, 255, 255)';
        context.fillRect(0, 0, viewport.width, viewport.height);

        return {
            canvas,
            context,
            isVisible: (x: number, y: number): boolean => {
                return x >= 0 && x < viewport.width && y >= 0 && y < viewport.height;
            }
        };
    }

    defineMap(config: MapConfig): void {
        const { svg, resolution, showGraticule } = config;
        const path = geoPath().projection(this.projection);

        // Clear existing content
        svg.innerHTML = '';

        // Add graticule if requested
        if (showGraticule) {
            const graticule = geoGraticule();
            const graticuleElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            graticuleElement.setAttribute('d', path(graticule()) || '');
            graticuleElement.setAttribute('class', 'graticule');
            graticuleElement.setAttribute('fill', 'none');
            graticuleElement.setAttribute('stroke', '#ccc');
            graticuleElement.setAttribute('stroke-width', '0.5');
            svg.appendChild(graticuleElement);
        }

        // Add coastlines placeholder
        // In a real implementation, this would load and render TopoJSON data
        const coastlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        coastlineGroup.setAttribute('class', 'coastlines');
        svg.appendChild(coastlineGroup);
    }

    updateViewport(viewport: Viewport): void {
        this.viewport = viewport;
        this.projection
            .scale(viewport.scale)
            .translate(viewport.translate);
    }

    isVisible(lon: number, lat: number): boolean {
        // For equirectangular, check if coordinates are within current view bounds
        const bounds = this.bounds();
        return lon >= bounds.west && lon <= bounds.east && 
               lat >= bounds.south && lat <= bounds.north;
    }

    invert(x: number, y: number): [number, number] | null {
        return this.projection.invert?.([x, y]) || null;
    }

    project(lon: number, lat: number): [number, number] | null {
        return this.projection([lon, lat]);
    }
}

/**
 * Factory function for creating equirectangular globes
 */
export function createEquirectangularGlobe(viewport: Viewport): Globe {
    return new EquirectangularGlobe(viewport);
}
