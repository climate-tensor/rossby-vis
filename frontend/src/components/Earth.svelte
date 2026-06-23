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
import { type Grid } from '../lib/products';
import { loadProductGrid } from '../lib/products/product-data-loader';
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

// Agents for async pipeline control (Phase 1.2 integration).
// Base (scalar colour overlay) and overlay (vector wind particles) use separate
// agents so that submitting one does not cancel the other's in-flight task.
let baseGridAgent: Agent<Grid, { productId: string }>;
let baseFieldAgent: Agent<Field, { globe: Globe; grid: Grid }>;
let overlayGridAgent: Agent<Grid, { productId: string }>;
let overlayFieldAgent: Agent<Field, { globe: Globe; grid: Grid }>;

// Cached grids (raw data). Grid data depends only on the selected product/time,
// NOT on the globe orientation, so rotation must re-interpolate these cached
// grids rather than re-fetching from the backend.
let baseGrid: Grid | null = null;
let overlayGrid: Grid | null = null;

// Persistent field interpolators (each owns a Web Worker). Reused across
// rotations so we don't spawn a new worker on every render.
let baseInterpolator: ReturnType<typeof createFieldInterpolator> | null = null;
let overlayInterpolator: ReturnType<typeof createFieldInterpolator> | null = null;

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
        manipulator.on('move', () => {
            // Re-interpolate the cached grids against the new orientation as the
            // globe is dragged, so the data layer rotates WITH the coastlines and
            // stays visible. Throttled to the interpolator's throughput; no
            // backend re-fetch happens here.
            scheduleRerender();
        });
        manipulator.on('moveEnd', () => {
            svgRenderer?.setLowResolution(false);
            // Re-seed the wind particles so the new orientation's flow repopulates
            // cleanly instead of the old particles drifting on with inertia.
            particleAnimator?.reseed();
            // Final, full-resolution render at the resting orientation.
            scheduleRerender();
        });
    }

    // Initialize particle animator (Phase 3.1)
    if (animationCanvas) {
        particleAnimator = createParticleAnimator(animationCanvas, {
            particleCount: 3000,      // Denser flow for a finer look.
            colorScale: windSpeedColorScale,
            speedMultiplier: 0.6,     // Slower, more delicate motion.
            fadeOpacity: 0.96,
            frameRate: 40             // ~25fps, matching the original earth.js cadence.
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
        // Geography and data are redrawn together, in lockstep, by
        // scheduleRerender (triggered via the manipulator 'move' event below).
        // Drawing geography here too would let the coastlines run ahead of the
        // throttled data layer and appear detached.
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
 * Load the base layer (scalar colour overlay) and render it to the data canvas.
 * Phase 3.2: Complete pipeline integration with real backend data.
 */
async function loadBaseLayer(productId: string): Promise<void> {
    if (!productId || !globe) return;

    isLoading.set(true);
    try {
        const grid = await baseGridAgent.submit({ productId });
        baseGrid = grid; // Cache for re-interpolation on rotation.
        await baseFieldAgent.submit({ globe, grid });
    } catch (error) {
        console.error(`Failed to load base layer "${productId}":`, error);
    } finally {
        isLoading.set(false);
    }
}

/**
 * Load the overlay layer. Vector products drive the particle animation; scalar
 * overlays are drawn as a colour layer on the data canvas.
 */
async function loadOverlayLayer(productId: string): Promise<void> {
    if (!productId || !globe) return;

    isLoading.set(true);
    try {
        const grid = await overlayGridAgent.submit({ productId });
        overlayGrid = grid; // Cache for re-interpolation on rotation.
        await overlayFieldAgent.submit({ globe, grid });
    } catch (error) {
        console.error(`Failed to load overlay layer "${productId}":`, error);
        particleAnimator?.stop();
    } finally {
        isLoading.set(false);
    }
}

function logRerenderError(layer: string, error: any): void {
    if (error?.message !== 'Task was cancelled') {
        console.error(`Failed to re-render ${layer} layer:`, error);
    }
}

/**
 * Re-interpolate and redraw the currently cached grids against the globe's
 * current orientation, WITHOUT re-fetching from the backend. Used after a
 * rotation or projection change.
 */
async function rerenderData(): Promise<void> {
    if (!globe) return;

    const tasks: Promise<unknown>[] = [];
    if (baseGrid) {
        tasks.push(
            baseFieldAgent.submit({ globe, grid: baseGrid }).catch((e) => logRerenderError('base', e))
        );
    }
    if (overlayGrid) {
        tasks.push(
            overlayFieldAgent.submit({ globe, grid: overlayGrid }).catch((e) => logRerenderError('overlay', e))
        );
    }
    await Promise.all(tasks);
}

// Throttle live re-rendering to the interpolator's throughput: while a render is
// in flight, remember that another is needed and run exactly one more when it
// finishes. This keeps the data layer following the globe during a drag without
// piling up (and self-cancelling) tasks.
let rerenderInFlight = false;
let rerenderPending = false;

function scheduleRerender(): void {
    if (rerenderInFlight) {
        rerenderPending = true;
        return;
    }
    rerenderInFlight = true;
    rerenderPending = false;
    // Draw the coastlines for the SAME orientation snapshot the interpolation
    // captures, so the SVG and data layers stay in lockstep instead of the
    // coastlines running ahead of the throttled data layer.
    renderGeography().catch(console.error);
    rerenderData().finally(() => {
        rerenderInFlight = false;
        if (rerenderPending) {
            scheduleRerender();
        }
    });
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

    // If we already have the grids cached (e.g. projection change), just
    // re-interpolate them; otherwise fetch them fresh.
    if (baseGrid || overlayGrid) {
        rerenderData();
        return;
    }

    if (currentBaseProduct) {
        loadBaseLayer(currentBaseProduct).catch(console.error);
    }
    if (currentOverlayProduct) {
        loadOverlayLayer(currentOverlayProduct).catch(console.error);
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

$: if (isMounted && $activeBaseLayerId !== currentBaseProduct && baseGridAgent) {
    currentBaseProduct = $activeBaseLayerId;
    console.log('Base layer changed to:', currentBaseProduct);
    
    if (currentBaseProduct) {
        loadBaseLayer(currentBaseProduct).catch(console.error);
    } else {
        // Clear data canvas if no base layer
        baseGrid = null;
        if (dataCanvas) {
            const ctx = dataCanvas.getContext('2d');
            ctx?.clearRect(0, 0, dataCanvas.width, dataCanvas.height);
        }
    }
}

$: if (isMounted && $activeOverlayLayerId !== currentOverlayProduct && overlayGridAgent) {
    currentOverlayProduct = $activeOverlayLayerId;
    console.log('Overlay layer changed to:', currentOverlayProduct);
    
    if (currentOverlayProduct) {
        loadOverlayLayer(currentOverlayProduct).catch(console.error);
    } else {
        // Stop animation if no overlay layer
        overlayGrid = null;
        stopRendering();
    }
}

/**
 * Interpolate a grid into a field and render it. Vector grids drive the particle
 * animation; the colour overlay is drawn onto the data canvas for both kinds.
 */
async function interpolateAndRender(
    interpolator: ReturnType<typeof createFieldInterpolator>,
    { globe, grid }: { globe: Globe; grid: Grid },
    drawOverlay: boolean
): Promise<Field> {
    const config: InterpolationConfig = { globe, grid };
    const field = await interpolator.interpolate(config);

    if (drawOverlay && dataCanvas && field.overlay) {
        const ctx = dataCanvas.getContext('2d');
        ctx?.putImageData(field.overlay, 0, 0);
    }

    // Only vector fields produce a usable vector field for particle animation.
    // Clear stale trails so the wind visibly responds when the globe is rotated
    // (the field is replaced for the new orientation).
    if (grid.type === 'vector' && particleAnimator && field.bounds.valid) {
        particleAnimator.setField(field, { clearTrails: true });
        particleAnimator.start();
    }

    return field;
}

// Component lifecycle
onMount(() => {
    // Grid agents fetch and build real data via the product data loader.
    const buildGridTask = async ({ productId }: { productId: string }) => loadProductGrid(productId);

    baseGridAgent = new Agent<Grid, { productId: string }>({ task: buildGridTask });
    overlayGridAgent = new Agent<Grid, { productId: string }>({ task: buildGridTask });

    // Persistent interpolators (one Web Worker each), reused across rotations.
    baseInterpolator = createFieldInterpolator();
    overlayInterpolator = createFieldInterpolator();

    // Base field draws the scalar colour overlay onto the data canvas.
    baseFieldAgent = new Agent<Field, { globe: Globe; grid: Grid }>({
        task: (input) => interpolateAndRender(baseInterpolator!, input, true)
    });

    // Overlay field drives the particle animation (and draws colour only for
    // scalar overlays, which would otherwise leave nothing visible).
    overlayFieldAgent = new Agent<Field, { globe: Globe; grid: Grid }>({
        task: (input) => interpolateAndRender(overlayInterpolator!, input, input.grid.type === 'scalar')
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
            initialLoadPromises.push(loadBaseLayer($activeBaseLayerId));
        }
        if ($activeOverlayLayerId) {
            initialLoadPromises.push(loadOverlayLayer($activeOverlayLayerId));
        }
        await Promise.all(initialLoadPromises.map(p => p.catch(e => console.error("Initial load failed:", e))));

        // Allow reactive statements to run
        isMounted = true;
    })();
    
    return () => {
        window.removeEventListener('resize', updateViewport);
        baseGridAgent?.cancel();
        baseFieldAgent?.cancel();
        overlayGridAgent?.cancel();
        overlayFieldAgent?.cancel();
    };
});

onDestroy(() => {
    baseGridAgent?.cancel();
    baseFieldAgent?.cancel();
    overlayGridAgent?.cancel();
    overlayFieldAgent?.cancel();
    baseInterpolator?.terminate();
    overlayInterpolator?.terminate();
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
