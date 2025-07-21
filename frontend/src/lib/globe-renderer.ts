import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { Projection } from './types';

// A simplified representation of the µ object from the original codebase.
const µ = {
    isMobile: () => /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent),
    clamp: (x: number, low: number, high: number) => Math.max(low, Math.min(x, high)),
    distance: (a: [number, number], b: [number, number]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)),
};

const MIN_MOVE = 4; // slack before a drag operation begins (pixels)

export class GlobeRenderer {
    private projection: d3.GeoProjection;
    private view: { width: number; height: number };
    private isDragging = false;
    private startMouse: [number, number] | null = null;
    private startRotation: [number, number, number] | null = null;

    constructor(projectionName: Projection, view: { width: number; height: number }) {
        this.view = view;
        this.projection = this.createProjection(projectionName);
    }

    private createProjection(projectionName: Projection): d3.GeoProjection {
        const builder = this.getProjectionBuilder(projectionName);
        const projection = builder();
        projection.scale(this.fit(projection));
        projection.translate([this.view.width / 2, this.view.height / 2]);
        return projection;
    }

    private getProjectionBuilder(projectionName: Projection): () => d3.GeoProjection {
        const builders: Record<Projection, () => d3.GeoProjection> = {
            orthographic: () => d3.geoOrthographic().precision(0.1).clipAngle(90),
            equirectangular: () => d3.geoEquirectangular().precision(0.1),
            mercator: () => d3.geoMercator().precision(0.1),
        };
        return builders[projectionName] || builders.orthographic;
    }

    private fit(projection: d3.GeoProjection): number {
        const bounds = d3.geoPath(projection).bounds({ type: 'Sphere' });
        const hScale = (bounds[1][0] - bounds[0][0]) / projection.scale();
        const vScale = (bounds[1][1] - bounds[0][1]) / projection.scale();
        return Math.min(this.view.width / hScale, this.view.height / vScale) * 0.9;
    }

    private createMeshData(mesh: any, isMobile: boolean) {
        // Create mesh features with different resolution levels based on the original earth.js pattern
        const o = mesh.objects;
        return {
            coastLo: topojson.feature(mesh, isMobile ? o.coastline_tiny : o.coastline_110m),
            coastHi: topojson.feature(mesh, isMobile ? o.coastline_110m : o.coastline_50m),
            lakesLo: topojson.feature(mesh, isMobile ? o.lakes_tiny : o.lakes_110m),
            lakesHi: topojson.feature(mesh, isMobile ? o.lakes_110m : o.lakes_50m)
        };
    }

    public render(mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, mesh: any) {
        const path = d3.geoPath(this.projection);

        // Clear previous render
        mapSvg.selectAll('*').remove();
        foregroundSvg.selectAll('*').remove();

        const defs = mapSvg.append('defs');
        defs.append('path')
            .attr('id', 'sphere')
            .datum({ type: 'Sphere' } as any)
            .attr('d', path);

        mapSvg.append('use')
            .attr('xlink:href', '#sphere')
            .attr('class', 'background-sphere');

        mapSvg.append('path')
            .attr('class', 'graticule')
            .datum(d3.geoGraticule())
            .attr('d', path);

        // Create mesh features with appropriate resolution based on device type
        const isMobile = µ.isMobile();
        const meshData = this.createMeshData(mesh, isMobile);

        mapSvg.append('path')
            .attr('class', 'coastline')
            .datum(meshData.coastHi)
            .attr('d', path);

        mapSvg.append('path')
            .attr('class', 'lakes')
            .datum(meshData.lakesHi)
            .attr('d', path);

        foregroundSvg.append('use')
            .attr('xlink:href', '#sphere')
            .attr('class', 'foreground-sphere');

        // Set up drag interaction
        this.setupDragInteraction(mapSvg, foregroundSvg);
    }

    private setupDragInteraction(mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
        const drag = d3.drag<SVGSVGElement, unknown>()
            .on('start', (event) => {
                this.isDragging = false;
                this.startMouse = [event.x, event.y];
                if (this.projection.rotate) {
                    this.startRotation = this.projection.rotate() as [number, number, number];
                }
            })
            .on('drag', (event) => {
                if (!this.startMouse || !this.startRotation) return;

                const currentMouse: [number, number] = [event.x, event.y];
                const distance = µ.distance(currentMouse, this.startMouse);

                if (!this.isDragging && distance < MIN_MOVE) {
                    return; // Don't start dragging until we've moved enough
                }

                this.isDragging = true;

                // Calculate rotation based on mouse movement
                const dx = currentMouse[0] - this.startMouse[0];
                const dy = currentMouse[1] - this.startMouse[1];

                // Convert pixel movement to rotation angles
                const sensitivity = 0.25;
                const rotateX = -dy * sensitivity;
                const rotateY = dx * sensitivity;

                // Apply rotation to the projection
                if (this.projection.rotate) {
                    const newRotation: [number, number, number] = [
                        this.startRotation[0] + rotateY,
                        µ.clamp(this.startRotation[1] + rotateX, -90, 90),
                        this.startRotation[2]
                    ];
                    this.projection.rotate(newRotation);
                }

                // Re-render the globe
                this.redraw(mapSvg, foregroundSvg);
            })
            .on('end', () => {
                this.isDragging = false;
                this.startMouse = null;
                this.startRotation = null;
            });

        // Apply drag to both SVG elements
        mapSvg.call(drag);
        foregroundSvg.call(drag);
    }

    private redraw(mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
        const path = d3.geoPath(this.projection);
        
        // Update all paths with their bound data
        mapSvg.selectAll('path').attr('d', path as any);
        foregroundSvg.selectAll('path').attr('d', path as any);
        
        // Update the sphere definition in defs
        mapSvg.select('defs').select('path#sphere').attr('d', path as any);
    }

    public setTime(time: Date) {
        // Placeholder for future implementation
        console.log('Setting time to:', time);
    }

    public destroy() {
        // Placeholder for future implementation
        console.log('Destroying globe renderer');
    }
}
