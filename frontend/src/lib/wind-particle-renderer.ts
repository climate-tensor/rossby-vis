import * as d3 from 'd3';

interface WindData {
    u: number[][];
    v: number[][];
    bounds: { north: number; south: number; east: number; west: number; };
    width: number;
    height: number;
}

interface Particle {
    x: number;
    y: number;
    xt: number;
    yt: number;
    age: number;
    maxAge: number;
}

function windIntensityColorScale(step: number, maxWind: number): string[] & { indexFor: (m: number) => number } {
    const result: any = [];
    for (let j = 85; j <= 255; j += step) {
        result.push(`rgba(${j}, ${j}, ${j}, 1.0)`);
    }
    result.indexFor = (m: number) => {
        return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
    };
    return result;
}

function distort(projection: d3.GeoProjection, λ: number, φ: number, x: number, y: number, scale: number, wind: [number, number]): [number, number] {
    const u = wind[0] * scale;
    const v = wind[1] * scale;
    const h = 0.0000360; // Small delta for finite difference
    const hλ = λ < 0 ? h : -h;
    const hφ = φ < 0 ? h : -h;

    const pλ = projection([λ + hλ, φ]);
    const pφ = projection([λ, φ + hφ]);

    if (!pλ || !pφ) {
        return [u, v];
    }

    const k = Math.cos(φ / 360 * Math.PI * 2);
    const d = [
        (pλ[0] - x) / hλ / k,
        (pλ[1] - y) / hλ / k,
        (pφ[0] - x) / hφ,
        (pφ[1] - y) / hφ
    ];

    return [
        d[0] * u + d[2] * v,
        d[1] * u + d[3] * v
    ];
}

export class WindParticleRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private projection: d3.GeoProjection;
    private particles: Particle[] = [];
    private windData: WindData | null = null;
    private animationId: number | null = null;
    private particleCount: number;
    private colorStyles: string[] & { indexFor: (m: number) => number };
    private buckets: Particle[][];
    private velocityScale: number;

    private readonly PARTICLE_MULTIPLIER = 7;
    private readonly PARTICLE_REDUCTION = 0.75;
    private readonly MAX_PARTICLE_AGE = 100;
    private readonly PARTICLE_LINE_WIDTH = 1.0;
    private readonly FADE_FILL_STYLE = "rgba(0, 0, 0, 0.97)";

    constructor(canvas: HTMLCanvasElement, projection: d3.GeoProjection) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.projection = projection;

        const bounds = this.canvas.getBoundingClientRect();
        this.particleCount = Math.round(bounds.width * this.PARTICLE_MULTIPLIER);
        if (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent)) {
            this.particleCount *= this.PARTICLE_REDUCTION;
        }
        this.velocityScale = bounds.height * (1/60000);

        this.colorStyles = windIntensityColorScale(10, 17);
        this.buckets = this.colorStyles.map(() => []);

        this.initializeParticles();
    }

    private initializeParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(this.createRandomParticle());
        }
    }

    private createRandomParticle(): Particle {
        const bounds = this.canvas.getBoundingClientRect();
        let p: Partial<Particle> = {};
        let safetyNet = 0;
        do {
            p.x = Math.round(_.random(bounds.x, bounds.x + bounds.width));
            p.y = Math.round(_.random(bounds.y, bounds.y + bounds.height));
        } while (this.isPointOffGlobe(p.x!, p.y!) && safetyNet++ < 30);
        p.age = Math.floor(Math.random() * this.MAX_PARTICLE_AGE);
        p.maxAge = this.MAX_PARTICLE_AGE;
        return p as Particle;
    }

    private isPointOffGlobe(x: number, y: number): boolean {
        const invert = this.projection.invert;
        if (!invert) return true;
        const coord = invert([x, y]);
        return coord === null || coord[0] === null || coord[1] === null || isNaN(coord[0]) || isNaN(coord[1]);
    }

    public setWindData(windData: WindData) {
        this.windData = windData;
    }

    private getWindAtPoint(lon: number, lat: number): [number, number, number] | null {
        if (!this.windData) return null;

        const { u, v, bounds, width, height } = this.windData;
        const x = Math.floor(((lon - bounds.west) / (bounds.east - bounds.west)) * (width - 1));
        const y = Math.floor(((bounds.north - lat) / (bounds.north - bounds.south)) * (height - 1));

        if (x >= 0 && x < width && y >= 0 && y < height) {
            const uVal = u[y][x];
            const vVal = v[y][x];
            if (uVal !== null && vVal !== null) {
                return [uVal, vVal, Math.sqrt(uVal * uVal + vVal * vVal)];
            }
        }
        return null;
    }

    private evolve() {
        this.buckets.forEach(bucket => bucket.length = 0);
        this.particles.forEach(particle => {
            if (particle.age > this.MAX_PARTICLE_AGE) {
                Object.assign(particle, this.createRandomParticle(), { age: 0 });
            }
            const coord = this.projection.invert && this.projection.invert([particle.x, particle.y]);
            if (!coord) {
                particle.age = this.MAX_PARTICLE_AGE;
                return;
            }
            const [lon, lat] = coord;
            if (isNaN(lon) || isNaN(lat)) {
                particle.age = this.MAX_PARTICLE_AGE;
                return;
            }
            const wind = this.getWindAtPoint(lon, lat);
            if (wind === null) {
                particle.age = this.MAX_PARTICLE_AGE;
                return;
            }
            const [u, v, m] = wind;
            const [dx, dy] = distort(this.projection, lon, lat, particle.x, particle.y, this.velocityScale, [u, v]);
            const xt = particle.x + dx;
            const yt = particle.y + dy;

            if (this.isPointOffGlobe(xt, yt)) {
                particle.age = this.MAX_PARTICLE_AGE;
            } else {
                particle.xt = xt;
                particle.yt = yt;
                this.buckets[this.colorStyles.indexFor(m)].push(particle);
            }
            particle.age += 1;
        });
    }

    private draw() {
        // Create fading effect
        const prev = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = "destination-in";
        this.ctx.fillStyle = this.FADE_FILL_STYLE;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = prev;

        // Draw particles
        this.buckets.forEach((bucket, i) => {
            if (bucket.length > 0) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = this.colorStyles[i];
                bucket.forEach(particle => {
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(particle.xt, particle.yt);
                    particle.x = particle.xt;
                    particle.y = particle.yt;
                });
                this.ctx.stroke();
            }
        });
    }

    private animate = () => {
        this.evolve();
        this.draw();
        this.animationId = requestAnimationFrame(this.animate);
    };

    public start() {
        if (!this.animationId) {
            this.ctx.lineWidth = this.PARTICLE_LINE_WIDTH;
            this.ctx.fillStyle = this.FADE_FILL_STYLE;
            this.animate();
        }
    }

    public stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    public clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    public updateProjection(projection: d3.GeoProjection) {
        this.projection = projection;
        this.initializeParticles();
    }

    public destroy() {
        this.stop();
        this.clear();
    }
}

const _ = {
    random: (min: number, max?: number) => {
        if (max === undefined) {
            max = min;
            min = 0;
        }
        return min + Math.random() * (max - min);
    }
};
