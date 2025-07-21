<script lang="ts">
/**
 * @fileoverview
 * Earth Rendering Pipeline Coordinator - Phase 2.1 Implementation
 * 
 * This component serves as the "brain" for all rendering, managing SVG and Canvas elements,
 * instantiating and driving multiple Agents, and coordinating the entire rendering pipeline.
 */

import { onMount, onDestroy } from 'svelte';
import { 
    projection, 
    activeBaseLayerId, 
    activeOverlayLayerId, 
    isLoading 
} from '../lib/stores';
import { Agent } from '../lib/control/agent';
import { createGlobe, type Globe, type Viewport, type ProjectionType } from '../lib/globes';
import { createProduct, type Grid } from '../lib/products';
import { createSvgRenderer } from '../lib/renderers/svg-renderer';
import { createFieldInterpolator, type Field, type InterpolationConfig } from '../lib/renderers/field-interpolator';
import { createParticleAnimator, windSpeedColorScale, type ParticleAnimator } from '../lib/renderers/particle-animator';

// Component state
let svgElement: SVGElement;
let dataCanvas: HTMLCanvasElement;
let animationCanvas: HTMLCanvasElement;
let containerElement: HTMLDivElement;

// Core objects
let globe: Globe | null = null;
let viewport: Viewport = {
    width: 800,
    height: 600,
    scale: 250,
    translate: [400, 300]
};

// Agents for async pipeline control (Phase 1.2 integration)
let gridAgent: Agent<Grid, { productId: string }>;
let fieldAgent: Agent<Field, { globe: Globe; grid: Grid }>;

// Reactive state tracking
let currentProjection: ProjectionType = 'orthographic';
let currentBaseProduct: string | null = null;
let currentOverlayProduct: string | null = null;
let isMounted = false;

// Renderer instances
let svgRenderer: ReturnType<typeof createSvgRenderer> | null = null;
let particleAnimator: ParticleAnimator | null = null;

/**
 * Initialize the rendering pipeline
 */
function initializePipeline() {
    // Create globe instance
    globe = createGlobe($projection, viewport);
    if (!globe) {
        console.error('Failed to create globe');
        return;
    }

    // Initialize SVG renderer
    if (svgElement) {
        svgRenderer = createSvgRenderer(globe, svgElement);
        
        // Setup interaction performance optimization
        const manipulator = globe.manipulator();
        manipulator.on('moveStart', () => {
            svgRenderer?.setLowResolution(true);
        });
        manipulator.on('moveEnd', () => {
            svgRenderer?.setLowResolution(false);
        });
    }

    // Initialize particle animator (Phase 3.1)
    if (animationCanvas) {
        particleAnimator = createParticleAnimator(animationCanvas, {
            particleCount: 2000,
            colorScale: windSpeedColorScale,
            speedMultiplier: 0.8,
            fadeOpacity: 0.96
        });
    }

    // Setup canvas interaction handlers
    setupCanvasInteraction();
    
    // Initial render
    renderGeography().catch(console.error);
}

/**
 * Setup canvas interaction for globe manipulation
 */
function setupCanvasInteraction() {
    if (!animationCanvas || !globe) return;
    
    const manipulator = globe.manipulator();
    let isActive = false;

    const handleMouseDown = (event: MouseEvent) => {
        isActive = true;
        const rect = animationCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        manipulator.start(x, y);
    };

    const handleMouseMove = (event: MouseEvent) => {
        if (!isActive) return;
        const rect = animationCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        manipulator.move(x, y);
        
        // Trigger complete re-render during interaction (both geography and data)
        renderGeography().catch(console.error);
        
        // Re-render data overlay if we have an active field
        if (currentBaseProduct && globe) {
            // Restart field processing with new globe orientation
            restartRendering();
        }
    };

    const handleMouseUp = () => {
        if (isActive) {
            isActive = false;
            manipulator.end();
        }
    };

    // Mouse events
    animationCanvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Cleanup function
    return () => {
        animationCanvas.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
}

/**
 * Render geographic elements (SVG layer)
 */
async function renderGeography() {
    if (svgRenderer && globe) {
        await svgRenderer.render({
            showCoastlines: true,
            showGraticule: true,
            resolution: 'medium'
        });
    }
}

/**
 * Load data product and trigger complete rendering pipeline
 * Phase 3.2: Complete pipeline integration
 */
async function loadDataProduct(productId: string): Promise<void> {
    if (!productId || !globe) return;
    
    isLoading.set(true);
    
    try {
        // Step 1: Load data using gridAgent (Phase 1.2 Agent pattern)
        console.log('Loading data product:', productId);
        const grid = await gridAgent.submit({ productId });
        console.log('Data product loaded successfully');
        
        // Step 2: Process field using fieldAgent (Phase 2.3 & 3.1 integration)
        console.log('Starting field interpolation...');
        const field = await fieldAgent.submit({ globe, grid });
        console.log('Field interpolation completed, animation started. Field bounds:', field.bounds);
        
    } catch (error) {
        console.error('Failed to load and process data product:', error);
        // Stop animation on error
        particleAnimator?.stop();
    } finally {
        isLoading.set(false);
    }
}

/**
 * Stop all rendering and clear canvases
 */
function stopRendering(): void {
    particleAnimator?.stop();
    
    // Clear canvases
    if (dataCanvas) {
        const ctx = dataCanvas.getContext('2d');
        ctx?.clearRect(0, 0, dataCanvas.width, dataCanvas.height);
    }
    
    if (animationCanvas) {
        const ctx = animationCanvas.getContext('2d');
        ctx?.clearRect(0, 0, animationCanvas.width, animationCanvas.height);
    }
}

/**
 * Restart rendering pipeline with current state
 */
function restartRendering(): void {
    stopRendering();
    
    // Restart with current overlay product if available
    if (currentOverlayProduct) {
        loadDataProduct(currentOverlayProduct).catch(console.error);
    }
}

/**
 * Handle viewport resize
 */
function updateViewport() {
    if (!containerElement) return;
    
    const rect = containerElement.getBoundingClientRect();
    viewport = {
        width: rect.width,
        height: rect.height,
        scale: Math.min(rect.width, rect.height) / 3,
        translate: [rect.width / 2, rect.height / 2]
    };
    
    // Update globe viewport
    if (globe) {
        globe.updateViewport(viewport);
        renderGeography().catch(console.error);
    }
    
    // Update canvas sizes
    if (dataCanvas) {
        dataCanvas.width = viewport.width;
        dataCanvas.height = viewport.height;
    }
    if (animationCanvas) {
        animationCanvas.width = viewport.width;
        animationCanvas.height = viewport.height;
    }
}

// Reactive statements for state changes (Phase 3.2: Complete integration)
$: if (isMounted && $projection !== currentProjection) {
    currentProjection = $projection;
    console.log('Projection changed to:', currentProjection);
    
    // Stop current rendering
    stopRendering();
    
    // Recreate globe with new projection
    globe = createGlobe(currentProjection, viewport);
    if (globe && svgRenderer) {
        svgRenderer.updateGlobe(globe);
        renderGeography();
    }
    
    // Restart rendering with new projection
    restartRendering();
}

$: if (isMounted && $activeBaseLayerId !== currentBaseProduct && gridAgent) {
    currentBaseProduct = $activeBaseLayerId;
    console.log('Base layer changed to:', currentBaseProduct);
    
    if (currentBaseProduct) {
        loadDataProduct(currentBaseProduct).catch(console.error);
    } else {
        // Clear data canvas if no base layer
        if (dataCanvas) {
            const ctx = dataCanvas.getContext('2d');
            ctx?.clearRect(0, 0, dataCanvas.width, dataCanvas.height);
        }
    }
}

$: if (isMounted && $activeOverlayLayerId !== currentOverlayProduct && gridAgent) {
    currentOverlayProduct = $activeOverlayLayerId;
    console.log('Overlay layer changed to:', currentOverlayProduct);
    
    if (currentOverlayProduct) {
        loadDataProduct(currentOverlayProduct).catch(console.error);
    } else {
        // Stop animation if no overlay layer
        stopRendering();
    }
}

// Component lifecycle
onMount(() => {
    // Initialize agents (Phase 1.2 implementation)
    gridAgent = new Agent<Grid, { productId: string }>({
        task: async ({ productId }: { productId: string }) => {
            const product = createProduct(productId);
            if (!product) {
                throw new Error(`Unknown product: ${productId}`);
            }
            
            // Generate appropriate mock data based on product type
            const dataSize = 181 * 360;
            let mockDataFields: any = {};
            
            // Determine data fields based on product type
            if (product.type === 'vector') {
                // Wind products need u and v components
                mockDataFields = {
                    u: new Array(dataSize).fill(0).map(() => Math.random() * 20 - 10),
                    v: new Array(dataSize).fill(0).map(() => Math.random() * 20 - 10)
                };
            } else if (product.type === 'scalar') {
                // Temperature products need temperature field
                if (productId === 't2m') {
                    mockDataFields = {
                        t2m: new Array(dataSize).fill(0).map(() => Math.random() * 60 - 20) // -20 to 40°C
                    };
                } else if (productId === 'd2m') {
                    mockDataFields = {
                        d2m: new Array(dataSize).fill(0).map(() => Math.random() * 50 - 30) // -30 to 20°C
                    };
                } else if (productId === 'sst') {
                    mockDataFields = {
                        sst: new Array(dataSize).fill(0).map(() => Math.random() * 35 + 2) // 2 to 37°C
                    };
                } else if (productId.startsWith('temp-')) {
                    mockDataFields = {
                        t: new Array(dataSize).fill(0).map(() => Math.random() * 100 - 70) // -70 to 30°C
                    };
                } else {
                    // Generic temperature field
                    mockDataFields = {
                        temperature: new Array(dataSize).fill(0).map(() => Math.random() * 40 - 10)
                    };
                }
            }
            
            const mockData = {
                metadata: {
                    shape: [1, 181, 360],
                    bounds: { north: 90, south: -90, east: 180, west: -180 },
                    units: product.units || 'unknown'
                },
                data: mockDataFields
            };
            
            return await product.buildGrid(mockData);
        }
    });
    
    fieldAgent = new Agent<Field, { globe: Globe; grid: Grid }>({
        task: async ({ globe, grid }: { globe: Globe; grid: Grid }) => {
            // Phase 2.3 implementation: Use field interpolator
            const fieldInterpolator = createFieldInterpolator();
            
            const config: InterpolationConfig = {
                globe,
                grid,
                onProgress: (progress, message) => {
                    console.log(`Field interpolation: ${progress}% - ${message}`);
                }
            };
            
            const field = await fieldInterpolator.interpolate(config);
            
            // Render the overlay to the data canvas
            if (dataCanvas && field.overlay) {
                const ctx = dataCanvas.getContext('2d');
                if (ctx) {
                    ctx.putImageData(field.overlay, 0, 0);
                }
            }
            
            // Phase 3.1: Start particle animation with computed field
            if (particleAnimator && field.bounds.valid) {
                particleAnimator.setField(field);
                particleAnimator.start();
                console.log('Particle animation started with', particleAnimator.getParticleCount(), 'particles');
            }
            
            return field;
        }
    });
    
    // Initialize rendering pipeline
    initializePipeline();
    
    // Setup resize handling
    updateViewport();
    window.addEventListener('resize', updateViewport);
    
    // Use a self-executing async function to handle initial data loading
    (async () => {
        const initialLoadPromises = [];
        if ($activeBaseLayerId) {
            initialLoadPromises.push(loadDataProduct($activeBaseLayerId));
        }
        if ($activeOverlayLayerId) {
            initialLoadPromises.push(loadDataProduct($activeOverlayLayerId));
        }
        await Promise.all(initialLoadPromises.map(p => p.catch(e => console.error("Initial load failed:", e))));

        // Allow reactive statements to run
        isMounted = true;
    })();
    
    return () => {
        window.removeEventListener('resize', updateViewport);
        gridAgent?.cancel();
        fieldAgent?.cancel();
    };
});

onDestroy(() => {
    gridAgent?.cancel();
    fieldAgent?.cancel();
    particleAnimator?.destroy();
});
</script>

<div bind:this={containerElement} class="earth-container">
    <!-- Canvas layer for data visualization (bottom layer) -->
    <canvas 
        bind:this={dataCanvas}
        class="earth-data-canvas"
        width={viewport.width}
        height={viewport.height}
    ></canvas>
    
    <!-- Canvas layer for particle animation (middle layer) -->
    <canvas 
        bind:this={animationCanvas}
        class="earth-animation-canvas"
        width={viewport.width}
        height={viewport.height}
    ></canvas>
    
    <!-- SVG layer for geographic elements (top layer) -->
    <svg 
        bind:this={svgElement}
        class="earth-svg"
        width={viewport.width}
        height={viewport.height}
    ></svg>
</div>

<style>
.earth-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.earth-data-canvas {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1; /* Bottom layer - data overlay */
    pointer-events: none;
}

.earth-animation-canvas {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2; /* Middle layer - particle animation */
    pointer-events: auto; /* Receives mouse events for globe interaction */
}

.earth-svg {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3; /* Top layer - coastlines and graticule */
    pointer-events: none;
}

:global(.earth-svg .coastlines) {
    fill: none;
    stroke: #666;
    stroke-width: 0.5px;
}

:global(.earth-svg .graticule) {
    fill: none;
    stroke: #ccc;
    stroke-width: 0.25px;
}
</style>
