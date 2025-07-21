/**
 * @fileoverview
 * Particle Animator - Phase 3.1 Implementation
 * 
 * This module faithfully reproduces the animate function from the original earth.js,
 * implementing efficient particle animation with bucketing optimization and fade effects.
 */

import type { Field } from './field-interpolator';
import { windSpeedColorScale as originalWindColorScale } from '../color-scales';

/**
 * Individual particle state
 */
interface Particle {
    /** Current screen x coordinate */
    x: number;
    /** Current screen y coordinate */
    y: number;
    /** Previous screen x coordinate */
    prevX: number;
    /** Previous screen y coordinate */
    prevY: number;
    /** Age of particle (frames alive) */
    age: number;
    /** Maximum age before respawn */
    maxAge: number;
    /** Current velocity magnitude (for color) */
    speed: number;
}

/**
 * Particle bucket for batched rendering
 * Reproduces the bucketing optimization from original earth.js
 */
interface ParticleBucket {
    /** Color style for this bucket */
    color: string;
    /** Particles in this bucket */
    particles: Particle[];
}

/**
 * Animation configuration
 */
export interface ParticleAnimationConfig {
    /** Number of particles to animate */
    particleCount?: number;
    /** Particle lifetime in frames */
    particleLifetime?: number;
    /** Particle speed multiplier */
    speedMultiplier?: number;
    /** Fade opacity for trails */
    fadeOpacity?: number;
    /** Color palette function */
    colorScale?: (speed: number) => string;
    /** Animation speed (requestAnimationFrame multiplier) */
    animationSpeed?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<ParticleAnimationConfig> = {
    particleCount: 2000,
    particleLifetime: 100,
    speedMultiplier: 1.0,
    fadeOpacity: 0.95,
    colorScale: (speed: number) => {
        // Default wind speed color scale
        const intensity = Math.min(speed / 10, 1);
        const r = Math.floor(intensity * 255);
        const g = Math.floor(intensity * 255);
        const b = Math.floor((1 - intensity) * 255);
        return `rgb(${r},${g},${b})`;
    },
    animationSpeed: 1.0
};

/**
 * High-performance particle animator
 * Reproduces the animation system from the original earth.js
 */
export class ParticleAnimator {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private field: Field | null = null;
    private config: Required<ParticleAnimationConfig>;
    
    private particles: Particle[] = [];
    private buckets: Map<string, ParticleBucket> = new Map();
    private animationId: number | null = null;
    private isRunning = false;
    
    // Performance tracking
    private frameCount = 0;
    private lastFpsUpdate = 0;
    private fps = 0;

    constructor(canvas: HTMLCanvasElement, config: ParticleAnimationConfig = {}) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d')!;
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        this.initializeParticles();
        this.setupCanvas();
    }

    /**
     * Initialize particle array with random positions
     */
    private initializeParticles(): void {
        this.particles = [];
        
        for (let i = 0; i < this.config.particleCount; i++) {
            this.particles.push(this.createRandomParticle());
        }
    }

    /**
     * Create a new particle at random position
     */
    private createRandomParticle(): Particle {
        const x = Math.random() * this.canvas.width;
        const y = Math.random() * this.canvas.height;
        return {
            x,
            y,
            prevX: x,
            prevY: y,
            age: Math.floor(Math.random() * this.config.particleLifetime),
            maxAge: this.config.particleLifetime + Math.floor(Math.random() * 20), // Some variation
            speed: 0
        };
    }

    /**
     * Setup canvas rendering properties
     */
    private setupCanvas(): void {
        this.context.lineCap = 'round';
        this.context.lineWidth = 1;
        
        // Ensure canvas starts completely transparent
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Set the field data for animation
     */
    public setField(field: Field | null): void {
        this.field = field;
    }

    /**
     * Start particle animation
     */
    public start(): void {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastFpsUpdate = performance.now();
        this.frameCount = 0;
        this.animate();
    }

    /**
     * Stop particle animation
     */
    public stop(): void {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Main animation loop
     * Reproduces the animate function from original earth.js
     */
    private animate = (): void => {
        if (!this.isRunning) return;

        // Performance tracking
        this.updatePerformanceMetrics();

        // Apply fade effect (reproduces fadeFillStyle from original)
        this.applyFadeEffect();

        if (this.field && this.field.bounds.valid) {
            // Phase 1: Evolve particles using pre-computed field
            this.evolveParticles();
            
            // Phase 2: Draw particles using bucketing optimization
            this.drawParticles();
        }

        // Schedule next frame
        this.animationId = requestAnimationFrame(this.animate);
    };

    /**
     * Apply fade effect to create particle trails
     * Reproduces the fadeFillStyle technique from original earth.js
     * Uses proper transparency to avoid background accumulation
     */
    private applyFadeEffect(): void {
        const prev = this.context.globalCompositeOperation;
        this.context.globalCompositeOperation = 'destination-in';
        // Use white with alpha to maintain transparency outside particles
        this.context.fillStyle = `rgba(255, 255, 255, ${this.config.fadeOpacity})`;
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.globalCompositeOperation = prev;
    }

    /**
     * Evolve all particles using the pre-computed vector field
     * This reproduces the evolve function from original earth.js
     */
    private evolveParticles(): void {
        if (!this.field) return;

        const { vectors, bounds } = this.field;
        const { width, height } = bounds;

        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            
            // Age the particle
            particle.age++;
            
            // Respawn if too old or out of bounds
            if (particle.age > particle.maxAge || 
                particle.x < 0 || particle.x >= width ||
                particle.y < 0 || particle.y >= height) {
                this.particles[i] = this.createRandomParticle();
                continue;
            }

            // Get vector at particle position
            const x = Math.floor(particle.x);
            const y = Math.floor(particle.y);
            const vectorIndex = (y * width + x) * 2;
            
            if (vectorIndex >= 0 && vectorIndex < vectors.length - 1) {
                const u = vectors[vectorIndex];
                const v = vectors[vectorIndex + 1];
                
                // Calculate speed for color mapping
                particle.speed = Math.sqrt(u * u + v * v);
                
                // Store previous position
                particle.prevX = particle.x;
                particle.prevY = particle.y;

                // Update position using vector field
                particle.x += u * this.config.speedMultiplier;
                particle.y += v * this.config.speedMultiplier;
            }
        }
    }

    /**
     * Draw all particles using bucketing optimization
     * Reproduces the bucketing strategy from original earth.js
     */
    private drawParticles(): void {
        // Clear buckets
        this.buckets.clear();
        
        // Sort particles into buckets by color (speed)
        for (const particle of this.particles) {
            if (particle.age <= 0) continue; // Skip newborn particles
            
            const color = this.config.colorScale(particle.speed);
            
            if (!this.buckets.has(color)) {
                this.buckets.set(color, {
                    color,
                    particles: []
                });
            }
            
            this.buckets.get(color)!.particles.push(particle);
        }
        
        // Draw each bucket in batch to minimize context state changes
        for (const bucket of this.buckets.values()) {
            this.drawBucket(bucket);
        }
    }

    /**
     * Draw all particles in a single bucket with one color
     * Minimizes Canvas state changes for optimal performance
     */
    private drawBucket(bucket: ParticleBucket): void {
        if (bucket.particles.length === 0) return;
        
        this.context.strokeStyle = bucket.color;
        this.context.beginPath();
        
        for (const particle of bucket.particles) {
            // Draw particle as a line segment from previous to current position
            this.context.moveTo(particle.prevX, particle.prevY);
            this.context.lineTo(particle.x, particle.y);
        }
        
        this.context.stroke();
    }

    /**
     * Update performance metrics
     */
    private updatePerformanceMetrics(): void {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    /**
     * Get current FPS
     */
    public getFPS(): number {
        return this.fps;
    }

    /**
     * Update animation configuration
     */
    public updateConfig(config: Partial<ParticleAnimationConfig>): void {
        this.config = { ...this.config, ...config };
        
        // Reinitialize particles if count changed
        if (config.particleCount && config.particleCount !== this.particles.length) {
            this.initializeParticles();
        }
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Get current particle count
     */
    public getParticleCount(): number {
        return this.particles.length;
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.stop();
        this.particles = [];
        this.buckets.clear();
    }
}

/**
 * Create a particle animator instance
 * Factory function maintaining compatibility with original pattern
 */
export function createParticleAnimator(
    canvas: HTMLCanvasElement, 
    config?: ParticleAnimationConfig
): ParticleAnimator {
    return new ParticleAnimator(canvas, config);
}

/**
 * Wind speed color scale (reproduces the color mapping from original)
 */
export function windSpeedColorScale(speed: number): string {
    // Convert m/s to color using a realistic wind speed scale
    const normalized = Math.min(speed / 20, 1); // 0-20 m/s range
    
    if (normalized < 0.1) return 'rgba(255,255,255,0.4)'; // Calm
    if (normalized < 0.3) return 'rgb(128,255,128)'; // Light
    if (normalized < 0.5) return 'rgb(255,255,128)'; // Moderate
    if (normalized < 0.7) return 'rgb(255,128,128)'; // Strong
    return 'rgb(255,64,64)'; // Very strong
}
