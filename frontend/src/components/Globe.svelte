<script lang="ts">
    import { onMount } from 'svelte';
    import * as d3 from 'd3';
    import { simulationTime, projection } from '$lib/stores';
    import { GlobeRenderer } from '$lib/globe-renderer';

    let globe: GlobeRenderer | undefined;
    let mapSvg: SVGSVGElement;
    let foregroundSvg: SVGSVGElement;
    let mesh: any = null;

    // Handle projection changes reactively
    $: if (globe && mesh && $projection) {
        // Recreate globe renderer when projection changes
        const view = { width: window.innerWidth, height: window.innerHeight };
        globe.destroy();
        globe = new GlobeRenderer($projection, view);
        
        const mapSelection = d3.select(mapSvg);
        const foregroundSelection = d3.select(foregroundSvg);
        globe.render(mapSelection, foregroundSelection, mesh);
    }

    onMount(async () => {
        try {
            const view = { width: window.innerWidth, height: window.innerHeight };
            
            // Choose appropriate topology resolution based on device type
            const isMobile = /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
            const topoFile = isMobile ? '/data/earth-topo-mobile.json' : '/data/earth-topo.json';
            
            console.log('Loading topology for', isMobile ? 'mobile' : 'desktop', 'device:', topoFile);
            
            const response = await fetch(topoFile);
            if (!response.ok) {
                throw new Error(`Failed to load topology data: ${response.statusText}`);
            }
            mesh = await response.json();
            console.log('Loaded mesh:', mesh);
            
            // Initial globe creation
            globe = new GlobeRenderer($projection, view);
            const mapSelection = d3.select(mapSvg);
            const foregroundSelection = d3.select(foregroundSvg);
            globe.render(mapSelection, foregroundSelection, mesh);

        } catch (error) {
            console.error("Failed to initialize globe renderer:", error);
        }

        return () => {
            // Cleanup when component is destroyed
            globe?.destroy();
        };
    });
</script>

<div id="display">
    <svg bind:this={mapSvg} id="map" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
    <canvas id="animation" class="fill-screen"></canvas>
    <canvas id="overlay" class="fill-screen"></canvas>
    <svg bind:this={foregroundSvg} id="foreground" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
