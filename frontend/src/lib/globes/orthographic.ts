/**
 * @fileoverview
 * Orthographic Globe Implementation - Phase 1.4 Implementation
 * 
 * This module implements the orthographic projection globe,
 * reproducing the orthographic functionality from the original globes.js
 */

import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
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
 * Orthographic manipulator for handling user interactions
 */
class OrthographicManipulator extends EventEmitter implements GlobeManipulator {
    private globe: OrthographicGlobe;
    private isActive = false;
    private lastPosition: [number, number] | null = null;
    private startOrientation: GlobeOrientation | null = null;

    constructor(globe: OrthographicGlobe) {
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

        // Calculate rotation based on mouse movement
        const rotationScale = 0.5; // Sensitivity factor
        const newLambda = this.startOrientation.lambda + deltaX * rotationScale;
        const newPhi = Math.max(-90, Math.min(90, 
            this.startOrientation.phi + deltaY * rotationScale));

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
 * Orthographic globe implementation
 */
export class OrthographicGlobe implements Globe {
    readonly id = 'orthographic';
    readonly name = 'Orthographic';
    readonly projection: ReturnType<typeof geoOrthographic>;

    private currentOrientation: GlobeOrientation = { lambda: 0, phi: 0, gamma: 0 };
    private viewport: Viewport;
    private manipulatorInstance: OrthographicManipulator;

    constructor(viewport: Viewport) {
        this.viewport = viewport;
        this.projection = geoOrthographic()
            .scale(viewport.scale)
            .translate(viewport.translate)
            .rotate([0, 0, 0]);
        
        this.manipulatorInstance = new OrthographicManipulator(this);
    }

    bounds(): GeoBounds {
        // For orthographic projection, visible bounds depend on rotation
        // This is a simplified implementation
        return {
            north: 90,
            south: -90,
            east: 180,
            west: -180
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
            // TODO: Implement smooth rotation animation
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
        // Create a circular mask for orthographic projection
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;

        // Clear canvas to transparent (invisible by default)
        context.clearRect(0, 0, viewport.width, viewport.height);
        
        // Draw circle for visible Earth area
        context.fillStyle = 'white';
        context.beginPath();
        context.arc(
            viewport.translate[0],
            viewport.translate[1],
            viewport.scale,
            0,
            2 * Math.PI
        );
        context.fill();

        // Create visibility checker based on the mask
        const imageData = context.getImageData(0, 0, viewport.width, viewport.height);
        const data = imageData.data;

        return {
            canvas,
            context,
            isVisible: (x: number, y: number): boolean => {
                if (x < 0 || x >= viewport.width || y < 0 || y >= viewport.height) {
                    return false;
                }
                const index = (y * viewport.width + x) * 4;
                return data[index + 3] > 0; // Check alpha channel - now pixels INSIDE circle are visible
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

    getViewport(): Viewport {
        return this.viewport;
    }

    isVisible(lon: number, lat: number): boolean {
        const projected = this.projection([lon, lat]);
        return projected !== null;
    }

    invert(x: number, y: number): [number, number] | null {
        return this.projection.invert?.([x, y]) || null;
    }

    project(lon: number, lat: number): [number, number] | null {
        return this.projection([lon, lat]);
    }
}

/**
 * Factory function for creating orthographic globes
 */
export function createOrthographicGlobe(viewport: Viewport): Globe {
    return new OrthographicGlobe(viewport);
}
