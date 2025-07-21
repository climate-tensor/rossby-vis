/**
 * @fileoverview
 * SVG Geographic Renderer - Phase 2.2 Implementation
 * 
 * This module handles all SVG-based geographic element rendering,
 * reproducing the buildRenderer functionality from the original earth.js
 */

import { geoPath, geoGraticule } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { Globe, MapConfig } from '../globes/types';

/**
 * SVG Renderer configuration
 */
export interface SvgRendererConfig {
    showCoastlines: boolean;
    showGraticule: boolean;
    resolution: 'low' | 'medium' | 'high';
}

/**
 * SVG Geographic Renderer
 * Reproduces the buildRenderer pattern from the original earth.js
 */
export class SvgRenderer {
    private globe: Globe;
    private svg: SVGElement;
    private isLowResolution = false;
    private topoData: any = null;
    private loadingPromise: Promise<void> | null = null;

    constructor(globe: Globe, svg: SVGElement) {
        this.globe = globe;
        this.svg = svg;
        this.loadTopologyData();
    }

    /**
     * Update the globe instance (for projection changes)
     */
    updateGlobe(globe: Globe): void {
        this.globe = globe;
    }

    /**
     * Set resolution mode for performance optimization
     * During user interaction, switch to low resolution
     */
    setLowResolution(lowRes: boolean): void {
        this.isLowResolution = lowRes;
        // In a real implementation, this would switch between different TopoJSON datasets
        console.log(`SVG resolution mode: ${lowRes ? 'low' : 'high'}`);
    }

    /**
     * Render SVG geographic elements
     * Reproduces the buildRenderer.render functionality
     */
    async render(config: SvgRendererConfig): Promise<void> {
        // Clear existing content
        this.svg.innerHTML = '';

        // Create geographic path generator
        const path = geoPath().projection(this.globe.projection);

        // Render graticule if requested
        if (config.showGraticule) {
            this.renderGraticule(path);
        }

        // Render coastlines if requested
        if (config.showCoastlines) {
            await this.renderCoastlines(path, config.resolution);
        }
    }

    /**
     * Render graticule (grid lines)
     */
    private renderGraticule(path: any): void {
        const graticule = geoGraticule();
        
        // Create graticule path element
        const graticuleElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const graticuleData = path(graticule());
        
        if (graticuleData) {
            graticuleElement.setAttribute('d', graticuleData);
            graticuleElement.setAttribute('class', 'graticule');
            graticuleElement.setAttribute('fill', 'none');
            graticuleElement.setAttribute('stroke', '#ccc');
            graticuleElement.setAttribute('stroke-width', '0.25');
            graticuleElement.setAttribute('opacity', '0.5');
            this.svg.appendChild(graticuleElement);
        }
    }

    /**
     * Load topology data based on device type
     * Reproduces the topology loading pattern from Globe.svelte
     */
    private async loadTopologyData(): Promise<void> {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = (async () => {
            try {
                // Choose appropriate topology resolution based on device type
                const isMobile = /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
                const topoFile = isMobile ? '/data/earth-topo-mobile.json' : '/data/earth-topo.json';
                
                console.log('Loading topology for', isMobile ? 'mobile' : 'desktop', 'device:', topoFile);
                
                const response = await fetch(topoFile);
                if (!response.ok) {
                    throw new Error(`Failed to load topology data: ${response.statusText}`);
                }
                
                this.topoData = await response.json();
                console.log('SVG Renderer: Loaded topology data');
            } catch (error) {
                console.error('SVG Renderer: Failed to load topology data:', error);
                this.topoData = null;
            }
        })();

        return this.loadingPromise;
    }

    /**
     * Render coastlines and geographic boundaries
     * Now with real TopoJSON data support
     */
    private async renderCoastlines(path: any, resolution: string): Promise<void> {
        // Wait for topology data to load
        await this.loadTopologyData();

        // Create coastlines group
        const coastlinesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        coastlinesGroup.setAttribute('class', 'coastlines');

        if (this.topoData && this.topoData.objects) {
            try {
                // Use correct object names from original earth.js topology structure
                const objects = this.topoData.objects;
                
                // Determine which coastline resolution to use based on device and performance mode
                const isMobile = /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
                let coastlineObject;
                
                if (this.isLowResolution) {
                    // Use lowest resolution during interaction
                    coastlineObject = objects.coastline_tiny || objects.coastline_110m;
                } else {
                    // Use appropriate resolution for device
                    coastlineObject = isMobile ? 
                        (objects.coastline_110m || objects.coastline_50m) : 
                        (objects.coastline_50m || objects.coastline_110m);
                }
                
                if (coastlineObject) {
                    const coastlines = topojson.feature(this.topoData, coastlineObject);
                    const coastlinePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const coastlinePathData = path(coastlines);
                    
                    if (coastlinePathData) {
                        coastlinePath.setAttribute('d', coastlinePathData);
                        coastlinePath.setAttribute('class', 'coastlines');
                        coastlinePath.setAttribute('fill', 'none');
                        coastlinePath.setAttribute('stroke', '#666');
                        coastlinePath.setAttribute('stroke-width', this.isLowResolution ? '0.35' : '0.5');
                        coastlinesGroup.appendChild(coastlinePath);
                    }
                }

                // Render lakes if available
                let lakesObject;
                if (this.isLowResolution) {
                    lakesObject = objects.lakes_tiny || objects.lakes_110m;
                } else {
                    lakesObject = isMobile ? 
                        (objects.lakes_110m || objects.lakes_50m) : 
                        (objects.lakes_50m || objects.lakes_110m);
                }
                
                if (lakesObject) {
                    const lakes = topojson.feature(this.topoData, lakesObject);
                    const lakesPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const lakesPathData = path(lakes);
                    
                    if (lakesPathData) {
                        lakesPath.setAttribute('d', lakesPathData);
                        lakesPath.setAttribute('class', 'lakes');
                        lakesPath.setAttribute('fill', 'none');
                        lakesPath.setAttribute('stroke', '#666');
                        lakesPath.setAttribute('stroke-width', this.isLowResolution ? '0.25' : '0.35');
                        lakesPath.setAttribute('opacity', '0.8');
                        coastlinesGroup.appendChild(lakesPath);
                    }
                }

            } catch (error) {
                console.error('SVG Renderer: Error rendering coastlines:', error);
                // Fallback to placeholder
                this.renderCoastlinePlaceholder(coastlinesGroup);
            }
        } else {
            // Fallback to placeholder if no topology data
            this.renderCoastlinePlaceholder(coastlinesGroup);
        }

        this.svg.appendChild(coastlinesGroup);
    }

    /**
     * Render placeholder when topology data is unavailable
     */
    private renderCoastlinePlaceholder(coastlinesGroup: SVGGElement): void {
        const placeholderText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        placeholderText.setAttribute('x', '10');
        placeholderText.setAttribute('y', '30');
        placeholderText.setAttribute('fill', '#666');
        placeholderText.setAttribute('font-size', '12');
        placeholderText.textContent = `Coastlines (${this.isLowResolution ? 'low' : 'high'} res)`;
        coastlinesGroup.appendChild(placeholderText);
    }
}

/**
 * Factory function to create SVG renderer
 * Maintains compatibility with the original buildRenderer pattern
 */
export function createSvgRenderer(globe: Globe, svg: SVGElement): SvgRenderer {
    return new SvgRenderer(globe, svg);
}
