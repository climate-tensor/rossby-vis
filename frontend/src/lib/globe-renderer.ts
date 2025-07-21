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
    private _projection: d3.GeoProjection;
    private view: { width: number; height: number };
    private isDragging = false;
    private startMouse: [number, number] | null = null;
    private startRotation: [number, number, number] | null = null;

    constructor(projectionName: Projection, view: { width: number; height: number }) {
        this.view = view;
        this._projection = this.createProjection(projectionName);
    }

    public get projection(): d3.GeoProjection {
        return this._projection;
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

    public render(
        mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
        foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
        overlayCanvas: d3.Selection<HTMLCanvasElement, unknown, null, undefined>,
        mesh: any
    ) {
        const path = d3.geoPath(this._projection);

        // Clear previous render
        mapSvg.selectAll('*').remove();
        foregroundSvg.selectAll('*').remove();
        overlayCanvas.node()!.getContext('2d')!.clearRect(0, 0, this.view.width, this.view.height);

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
        this.setupDragInteraction(mapSvg, foregroundSvg, overlayCanvas);
    }

    private setupDragInteraction(
        mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
        foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        overlayCanvas: d3.Selection<HTMLCanvasElement, unknown, null, undefined>
    ) {
        const drag = d3.drag<Element, unknown>()
            .on('start', (event) => {
                this.isDragging = false;
                this.startMouse = [event.x, event.y];
                if (this._projection.rotate) {
                    this.startRotation = this._projection.rotate() as [number, number, number];
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
                if (this._projection.rotate) {
                    const newRotation: [number, number, number] = [
                        this.startRotation[0] + rotateY,
                        µ.clamp(this.startRotation[1] + rotateX, -90, 90),
                        this.startRotation[2]
                    ];
                    this._projection.rotate(newRotation);
                }

                // Re-render the globe
                this.redraw(mapSvg, foregroundSvg, overlayCanvas);
            })
            .on('end', () => {
                this.isDragging = false;
                this.startMouse = null;
                this.startRotation = null;
            });

        // Apply drag to all interactive elements
        mapSvg.call(drag as any);
        foregroundSvg.call(drag as any);
        overlayCanvas.call(drag as any);
    }

    private redraw(
        mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
        foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        overlayCanvas: d3.Selection<HTMLCanvasElement, unknown, null, undefined>
    ) {
        const path = d3.geoPath(this._projection);
        
        // Update all paths with their bound data
        mapSvg.selectAll('path').attr('d', path as any);
        foregroundSvg.selectAll('path').attr('d', path as any);
        
        // Update the sphere definition in defs
        mapSvg.select('defs').select('path#sphere').attr('d', path as any);

        // Redraw the overlay canvas if there is data
        // This part needs to be connected to the data store
    }

    public renderScalarData(
        overlayCanvas: d3.Selection<HTMLCanvasElement, unknown, null, undefined>,
        scalarData: {
            data: number[][];
            bounds: { north: number; south: number; east: number; west: number };
            width: number;
            height: number;
        },
        colorScale: d3.ScaleSequential<string>
    ) {
        const canvas = overlayCanvas.node()!;
        const context = canvas.getContext('2d');
        if (!context) return;

        const { data, bounds, width: dataWidth, height: dataHeight } = scalarData;
        const { north, south, east, west } = bounds;

        // Clear the canvas
        context.clearRect(0, 0, this.view.width, this.view.height);
        
        // Create an image buffer for the entire view
        const imageData = context.createImageData(this.view.width, this.view.height);
        const pixels = imageData.data;

        // Create a mask to track which pixels are visible on the globe
        const path = d3.geoPath(this._projection).context(null);
        const spherePath = path({ type: 'Sphere' });
        
        // Function to check if a point is inside the sphere
        const isInsideSphere = (x: number, y: number): boolean => {
            // Simple check: for orthographic projection, check if point is within the circular bounds
            const cx = this.view.width / 2;
            const cy = this.view.height / 2;
            const scale = this._projection.scale();
            const radius = scale; // For orthographic, the radius equals the scale
            
            const dx = x - cx;
            const dy = y - cy;
            return (dx * dx + dy * dy) <= (radius * radius);
        };

        // Create interpolation helpers
        const lonStep = (east - west) / (dataWidth - 1);
        const latStep = (north - south) / (dataHeight - 1);

        // Helper to bilinearly interpolate data value at given lon/lat
        const interpolateValue = (lon: number, lat: number): number | null => {
            // Convert lon/lat to data grid coordinates
            const i = (lon - west) / lonStep;
            const j = (north - lat) / latStep;
            
            const fi = Math.floor(i), ci = Math.min(fi + 1, dataWidth - 1);
            const fj = Math.floor(j), cj = Math.min(fj + 1, dataHeight - 1);
            
            if (fi < 0 || fi >= dataWidth || fj < 0 || fj >= dataHeight) {
                return null;
            }
            
            const g00 = data[fj][fi];
            const g10 = data[fj][ci];
            const g01 = data[cj][fi];
            const g11 = data[cj][ci];
            
            if (g00 === null || g10 === null || g01 === null || g11 === null ||
                isNaN(g00) || isNaN(g10) || isNaN(g01) || isNaN(g11)) {
                return null;
            }
            
            // Bilinear interpolation
            const rx = i - fi;
            const ry = j - fj;
            return g00 * (1 - rx) * (1 - ry) +
                   g10 * rx * (1 - ry) +
                   g01 * (1 - rx) * ry +
                   g11 * rx * ry;
        };

        // Process each pixel in the view
        for (let y = 0; y < this.view.height; y++) {
            for (let x = 0; x < this.view.width; x++) {
                const idx = (y * this.view.width + x) * 4;
                
                // Default to transparent
                pixels[idx + 3] = 0;
                
                // Check if pixel is inside the sphere
                if (!isInsideSphere(x, y)) continue;
                
                // Invert the projection to get lon/lat
                const coord = this._projection.invert && this._projection.invert([x, y]);
                if (!coord || coord[0] === null || coord[1] === null || isNaN(coord[0]) || isNaN(coord[1])) {
                    continue;
                }
                
                const [lon, lat] = coord;
                
                // Interpolate the data value at this location
                const value = interpolateValue(lon, lat);
                if (value === null) continue;
                
                // Get the color for this value
                const color = d3.color(colorScale(value));
                if (color) {
                    const rgb = color.rgb();
                    pixels[idx] = rgb.r;
                    pixels[idx + 1] = rgb.g;
                    pixels[idx + 2] = rgb.b;
                    pixels[idx + 3] = 160; // Alpha channel (0.63 opacity)
                }
            }
        }
        
        // Draw the image data to the canvas
        context.putImageData(imageData, 0, 0);
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
