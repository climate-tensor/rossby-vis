import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { Projection } from './types';

// Constants from original Earth.js
const OVERLAY_ALPHA = Math.floor(0.4 * 255);
const INTENSITY_SCALE_STEP = 10;
const MAX_PARTICLE_AGE = 100;
const PARTICLE_LINE_WIDTH = 1.0;
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const FRAME_RATE = 40;
const MAX_TASK_TIME = 100;
const MIN_SLEEP_TIME = 25;
const MIN_MOVE = 4;

const NULL_WIND_VECTOR = [NaN, NaN, null] as [number, number, number | null];
const HOLE_VECTOR = [NaN, NaN, null] as [number, number, number | null];
const TRANSPARENT_BLACK = [0, 0, 0, 0];

// Utility functions borrowed from Earth.js
const µ = {
    isMobile: () => /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent),
    clamp: (x: number, low: number, high: number) => Math.max(low, Math.min(x, high)),
    distance: (a: [number, number], b: [number, number]) => Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)),
    isValue: (x: any): boolean => x !== null && x !== undefined && !isNaN(x),
    random: (min: number, max: number) => Math.random() * (max - min) + min,
    clearCanvas: (canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    spread: (t: number, a: number, b: number) => a + t * (b - a),
    windIntensityColorScale: (step: number, maxIntensity: number) => {
        const result: string[] & { indexFor: (magnitude: number) => number } = [] as any;
        for (let i = 0; i <= maxIntensity; i += step) {
            // Simple color scale from blue to red
            const t = i / maxIntensity;
            const r = Math.floor(t * 255);
            const g = Math.floor((1 - Math.abs(t - 0.5) * 2) * 255);
            const b = Math.floor((1 - t) * 255);
            result.push(`rgb(${r},${g},${b})`);
        }
        result.indexFor = (magnitude: number) => Math.min(result.length - 1, Math.floor(magnitude / step));
        return result;
    },
    distortion: (projection: d3.GeoProjection, λ: number, φ: number, x: number, y: number) => {
        // Simplified distortion calculation
        const hε = 0.5;
        const pε = 0.5;
        const k = projection.scale();
        return [k, 0, 0, k]; // Simplified - actual implementation would calculate proper distortion
    }
};

interface Particle {
    x: number;
    y: number;
    xt?: number;
    yt?: number;
    age: number;
}

interface Field {
    (x: number, y: number): [number, number, number | null];
    isDefined: (x: number, y: number) => boolean;
    isInsideBoundary: (x: number, y: number) => boolean;
    randomize: (particle: Particle) => Particle;
    release: () => void;
    overlay: ImageData;
}

interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
    xMax: number;
    yMax: number;
}

interface GridData {
    interpolate: (λ: number, φ: number) => [number, number, number | null] | null;
    scale: {
        gradient: (value: number, alpha: number) => [number, number, number, number];
        bounds: [number, number];
    };
    particles: {
        velocityScale: number;
        maxIntensity: number;
    };
}

interface MeshData {
    coastLo: any;
    coastHi: any;
    lakesLo: any;
    lakesHi: any;
}

export class EnhancedGlobeRenderer {
    private projection: d3.GeoProjection;
    private view: { width: number; height: number };
    private isDragging = false;
    private startMouse: [number, number] | null = null;
    private startRotation: [number, number, number] | null = null;
    private animationId: number | null = null;
    private isAnimating = false;
    private currentField: Field | null = null;
    private particles: Particle[] = [];
    
    // Canvas contexts
    private animationCanvas: HTMLCanvasElement | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;
    private animationCtx: CanvasRenderingContext2D | null = null;
    private overlayCtx: CanvasRenderingContext2D | null = null;

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

    private createMeshData(mesh: any, isMobile: boolean): MeshData {
        const o = mesh.objects;
        return {
            coastLo: topojson.feature(mesh, isMobile ? o.coastline_tiny : o.coastline_110m),
            coastHi: topojson.feature(mesh, isMobile ? o.coastline_110m : o.coastline_50m),
            lakesLo: topojson.feature(mesh, isMobile ? o.lakes_tiny : o.lakes_110m),
            lakesHi: topojson.feature(mesh, isMobile ? o.lakes_110m : o.lakes_50m)
        };
    }

    private createMask(): { imageData: ImageData; isVisible: (x: number, y: number) => boolean; set: (x: number, y: number, rgba: [number, number, number, number]) => any } {
        const width = this.view.width;
        const height = this.view.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        
        // Create mask based on projection
        const path = d3.geoPath(this.projection, context as any);
        context.beginPath();
        path({ type: 'Sphere' });
        context.fillStyle = 'rgba(255, 0, 0, 1)';
        context.fill();

        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;

        return {
            imageData,
            isVisible: (x: number, y: number) => {
                const i = (y * width + x) * 4;
                return data[i + 3] > 0;
            },
            set: (x: number, y: number, rgba: [number, number, number, number]) => {
                const i = (y * width + x) * 4;
                data[i] = rgba[0];
                data[i + 1] = rgba[1];
                data[i + 2] = rgba[2];
                data[i + 3] = rgba[3];
                return this;
            }
        };
    }

    private distort(λ: number, φ: number, x: number, y: number, scale: number, wind: [number, number, number | null]): [number, number, number | null] {
        const u = wind[0] * scale;
        const v = wind[1] * scale;
        const d = µ.distortion(this.projection, λ, φ, x, y);

        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;
        return wind;
    }

    private createField(gridData: GridData): Promise<Field> {
        return new Promise((resolve) => {
            const mask = this.createMask();
            const bounds: Bounds = {
                x: 0,
                y: 0,
                width: this.view.width,
                height: this.view.height,
                xMax: this.view.width,
                yMax: this.view.height
            };

            // Velocity scale for particle movement
            const velocityScale = bounds.height * gridData.particles.velocityScale;
            const columns: Array<Array<[number, number, number | null]>> = [];

            const interpolateColumn = (x: number) => {
                const column: Array<[number, number, number | null]> = [];
                for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                    if (mask.isVisible(x, y)) {
                        const coord = this.projection.invert([x, y]);
                        let color = TRANSPARENT_BLACK;
                        let wind: [number, number, number | null] = NULL_WIND_VECTOR;
                        
                        if (coord) {
                            const [λ, φ] = coord;
                            if (isFinite(λ)) {
                                const interpolated = gridData.interpolate(λ, φ);
                                if (interpolated) {
                                    wind = this.distort(λ, φ, x, y, velocityScale, interpolated);
                                    const scalar = wind[2];
                                    if (µ.isValue(scalar)) {
                                        color = gridData.scale.gradient(scalar!, OVERLAY_ALPHA);
                                    }
                                }
                            }
                        }
                        column[y + 1] = column[y] = wind || HOLE_VECTOR;
                        mask.set(x, y, color as [number, number, number, number])
                            .set(x + 1, y, color as [number, number, number, number])
                            .set(x, y + 1, color as [number, number, number, number])
                            .set(x + 1, y + 1, color as [number, number, number, number]);
                    }
                }
                columns[x + 1] = columns[x] = column;
            };

            // Interpolate field
            for (let x = bounds.x; x < bounds.xMax; x += 2) {
                interpolateColumn(x);
            }

            // Create field function
            const field = ((x: number, y: number) => {
                const column = columns[Math.round(x)];
                return column && column[Math.round(y)] || NULL_WIND_VECTOR;
            }) as Field;

            field.isDefined = (x: number, y: number) => field(x, y)[2] !== null;
            field.isInsideBoundary = (x: number, y: number) => field(x, y) !== NULL_WIND_VECTOR;
            field.release = () => { columns.length = 0; };
            field.randomize = (particle: Particle) => {
                let x: number, y: number;
                let safetyNet = 0;
                do {
                    x = Math.round(µ.random(bounds.x, bounds.xMax));
                    y = Math.round(µ.random(bounds.y, bounds.yMax));
                } while (!field.isDefined(x, y) && safetyNet++ < 30);
                particle.x = x;
                particle.y = y;
                return particle;
            };
            field.overlay = mask.imageData;

            resolve(field);
        });
    }

    private setupCanvases() {
        // Create animation canvas
        this.animationCanvas = document.createElement('canvas');
        this.animationCanvas.width = this.view.width;
        this.animationCanvas.height = this.view.height;
        this.animationCanvas.id = 'animation';
        this.animationCtx = this.animationCanvas.getContext('2d');

        // Create overlay canvas  
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.width = this.view.width;
        this.overlayCanvas.height = this.view.height;
        this.overlayCanvas.id = 'overlay';
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Add canvases to DOM
        const container = document.querySelector('#display');
        if (container && this.overlayCanvas && this.animationCanvas) {
            container.appendChild(this.overlayCanvas);
            container.appendChild(this.animationCanvas);
        }
    }

    private startAnimation(field: Field, gridData: GridData) {
        if (!this.animationCtx || !field) return;

        this.stopAnimation();
        this.currentField = field;
        this.isAnimating = true;

        const bounds: Bounds = {
            x: 0,
            y: 0,
            width: this.view.width,
            height: this.view.height,
            xMax: this.view.width,
            yMax: this.view.height
        };

        const colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, gridData.particles.maxIntensity);
        const buckets: Particle[][] = colorStyles.map(() => []);
        let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (µ.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }

        // Initialize particles
        this.particles = [];
        for (let i = 0; i < particleCount; i++) {
            this.particles.push(field.randomize({ age: Math.floor(µ.random(0, MAX_PARTICLE_AGE)), x: 0, y: 0 }));
        }

        const fadeFillStyle = "rgba(0, 0, 0, 0.97)";
        const ctx = this.animationCtx;
        ctx.lineWidth = PARTICLE_LINE_WIDTH;
        ctx.fillStyle = fadeFillStyle;

        const evolve = () => {
            buckets.forEach(bucket => bucket.length = 0);
            this.particles.forEach(particle => {
                if (particle.age > MAX_PARTICLE_AGE) {
                    field.randomize(particle);
                    particle.age = 0;
                }
                const x = particle.x;
                const y = particle.y;
                const v = field(x, y);
                const m = v[2];
                
                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE;
                } else {
                    const xt = x + v[0];
                    const yt = y + v[1];
                    if (field.isDefined(xt, yt)) {
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[colorStyles.indexFor(m)].push(particle);
                    } else {
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            });
        };

        const draw = () => {
            // Fade existing trails
            const prev = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = "destination-in";
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.globalCompositeOperation = prev;

            // Draw new trails
            buckets.forEach((bucket, i) => {
                if (bucket.length > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = colorStyles[i];
                    bucket.forEach(particle => {
                        if (particle.xt !== undefined && particle.yt !== undefined) {
                            ctx.moveTo(particle.x, particle.y);
                            ctx.lineTo(particle.xt, particle.yt);
                            particle.x = particle.xt;
                            particle.y = particle.yt;
                        }
                    });
                    ctx.stroke();
                }
            });
        };

        const frame = () => {
            if (!this.isAnimating) return;
            
            try {
                evolve();
                draw();
                this.animationId = setTimeout(frame, FRAME_RATE);
            } catch (e) {
                console.error('Animation error:', e);
                this.stopAnimation();
            }
        };

        frame();
    }

    private stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
        if (this.currentField) {
            this.currentField.release();
            this.currentField = null;
        }
        if (this.animationCanvas) {
            µ.clearCanvas(this.animationCanvas);
        }
    }

    private drawOverlay(field: Field | null) {
        if (!this.overlayCtx || !field) return;

        µ.clearCanvas(this.overlayCanvas!);
        this.overlayCtx.putImageData(field.overlay, 0, 0);
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

        // Create mesh features
        const isMobile = µ.isMobile();
        const meshData = this.createMeshData(mesh, isMobile);

        const coastline = mapSvg.append('path')
            .attr('class', 'coastline')
            .datum(meshData.coastHi)
            .attr('d', path);

        const lakes = mapSvg.append('path')
            .attr('class', 'lakes')
            .datum(meshData.lakesHi)
            .attr('d', path);

        foregroundSvg.append('use')
            .attr('xlink:href', '#sphere')
            .attr('class', 'foreground-sphere');

        // Setup canvases for animation and overlay
        this.setupCanvases();

        // Setup drag interaction with proper mesh updates
        this.setupDragInteraction(mapSvg, foregroundSvg, coastline, lakes, meshData);
    }

    private setupDragInteraction(
        mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
        foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        coastline: d3.Selection<SVGPathElement, any, SVGSVGElement, unknown>,
        lakes: d3.Selection<SVGPathElement, any, SVGSVGElement, unknown>,
        meshData: MeshData
    ) {
        const drag = d3.drag<SVGSVGElement, unknown>()
            .on('start', (event) => {
                this.isDragging = false;
                this.startMouse = [event.x, event.y];
                if (this.projection.rotate) {
                    this.startRotation = this.projection.rotate() as [number, number, number];
                }
                // Switch to low-res during drag
                coastline.datum(meshData.coastLo);
                lakes.datum(meshData.lakesLo);
            })
            .on('drag', (event) => {
                if (!this.startMouse || !this.startRotation) return;

                const currentMouse: [number, number] = [event.x, event.y];
                const distance = µ.distance(currentMouse, this.startMouse);

                if (!this.isDragging && distance < MIN_MOVE) {
                    return;
                }

                this.isDragging = true;

                const dx = currentMouse[0] - this.startMouse[0];
                const dy = currentMouse[1] - this.startMouse[1];

                const sensitivity = 0.25;
                const rotateX = -dy * sensitivity;
                const rotateY = dx * sensitivity;

                if (this.projection.rotate) {
                    const newRotation: [number, number, number] = [
                        this.startRotation[0] + rotateY,
                        µ.clamp(this.startRotation[1] + rotateX, -90, 90),
                        this.startRotation[2]
                    ];
                    this.projection.rotate(newRotation);
                }

                this.redraw(mapSvg, foregroundSvg);
            })
            .on('end', () => {
                this.isDragging = false;
                this.startMouse = null;
                this.startRotation = null;
                // Switch back to high-res after drag
                coastline.datum(meshData.coastHi);
                lakes.datum(meshData.lakesHi);
                this.redraw(mapSvg, foregroundSvg);
            });

        mapSvg.call(drag);
        foregroundSvg.call(drag);
    }

    private redraw(mapSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>, foregroundSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
        const path = d3.geoPath(this.projection);
        
        mapSvg.selectAll('path').attr('d', path as any);
        foregroundSvg.selectAll('path').attr('d', path as any);
        mapSvg.select('defs').select('path#sphere').attr('d', path as any);
    }

    public updateField(gridData: GridData) {
        this.createField(gridData).then(field => {
            this.stopAnimation();
            this.drawOverlay(field);
            this.startAnimation(field, gridData);
        });
    }

    public setTime(time: Date) {
        console.log('Setting time to:', time);
    }

    public destroy() {
        this.stopAnimation();
        if (this.animationCanvas) {
            this.animationCanvas.remove();
        }
        if (this.overlayCanvas) {
            this.overlayCanvas.remove();
        }
        console.log('Destroying enhanced globe renderer');
    }
}
