<script lang="ts">
    import { onMount } from 'svelte';
    import * as d3 from 'd3';
    import { projection, activeBaseLayerId, activeOverlayLayerId } from '../lib/stores';
    import { GlobeRenderer } from '../lib/globe-renderer';
    import { WindParticleRenderer } from '../lib/wind-particle-renderer';
    import { DataLoader } from '../lib/data-loader';
    import { metadataService } from '../lib/metadata-service';

    let globe: GlobeRenderer | undefined;
    let windRenderer: WindParticleRenderer | undefined;
    let mapSvg: SVGSVGElement;
    let foregroundSvg: SVGSVGElement;
    let vectorCanvas: HTMLCanvasElement;  // For vector overlays (wind particles, ocean currents)
    let mesh: any = null;
    let currentProjection: string = 'orthographic';
    let windData: any = null;
    let baseLayerData: any = null;
    let dataLoader: DataLoader | null = null;
    let scalarCanvas: HTMLCanvasElement;  // For scalar base layers (temperature, pressure)

    // Function to load wind data
    const loadAndSetWindData = async () => {
        try {
            // Initialize metadata service and data loader if not already done
            if (!dataLoader) {
                await metadataService.loadMetadata();
                dataLoader = new DataLoader(metadataService);
            }
            
            // Load real wind data from the backend
            const realWindData = await dataLoader.loadWindData();
            
            if (realWindData) {
                windData = realWindData;
                console.log('Loaded real wind data:', realWindData);
            } else {
                // Fallback to sample data if real data fails
                console.warn('Failed to load real wind data, using sample data');
                windData = createSampleWindData();
            }
            
            if (windRenderer && windData) {
                windRenderer.setWindData(windData);
                windRenderer.start();
                console.log('Wind particle animation started');
            }
        } catch (error) {
            console.error('Failed to load wind data:', error);
            // Fallback to sample data on error
            windData = createSampleWindData();
            if (windRenderer && windData) {
                windRenderer.setWindData(windData);
                windRenderer.start();
                console.log('Wind particle animation started with sample data');
            }
        }
    };

    // Function to load base layer data
    const loadBaseLayerData = async (layerId: string) => {
        if (!layerId) {
            console.log('🌍 Globe: No base layer ID provided');
            return;
        }

        // Initialize dataLoader if not already done
        if (!dataLoader) {
            try {
                await metadataService.loadMetadata();
                dataLoader = new DataLoader(metadataService);
            } catch (error) {
                console.error('🌍 Globe: Failed to initialize DataLoader:', error);
                return;
            }
        }

        try {
            console.log(`🌍 Globe: Loading base layer data for: ${layerId}`);
            const scalarData = await dataLoader.loadScalarData(layerId);
            
            if (scalarData) {
                baseLayerData = scalarData;
                console.log(`✅ Globe: Successfully loaded base layer data for ${layerId}:`, scalarData);
                // TODO: Integrate with globe renderer to display base layer
            } else {
                console.warn(`❌ Globe: Failed to load base layer data for ${layerId}`);
            }
        } catch (error) {
            console.error(`💥 Globe: Error loading base layer data for ${layerId}:`, error);
        }
    };

    // Function to load scalar data for overlays (temperature, pressure, etc.)
    const loadScalarOverlay = async (variable: string, time?: string, level?: string) => {
        if (!dataLoader) {
            console.warn('DataLoader not initialized');
            return null;
        }

        try {
            console.log(`Loading scalar data for variable: ${variable}`);
            const scalarData = await dataLoader.loadScalarData(variable, time, level);
            
            if (scalarData) {
                console.log(`Successfully loaded ${variable} data:`, scalarData);
                return scalarData;
            } else {
                console.warn(`Failed to load ${variable} data`);
                return null;
            }
        } catch (error) {
            console.error(`Error loading ${variable} data:`, error);
            return null;
        }
    };

    // Handle projection changes reactively
    $: if (globe && mesh && $projection && $projection !== currentProjection) {
        currentProjection = $projection;
        // Recreate globe renderer when projection changes
        const view = { width: 900, height: 600 }; // Fixed size instead of window
        globe.destroy();
        globe = new GlobeRenderer($projection, view);
        
        const mapSelection = d3.select(mapSvg);
        const foregroundSelection = d3.select(foregroundSvg);
        const scalarSelection = d3.select(scalarCanvas);
        globe.render(mapSelection, foregroundSelection, scalarSelection, mesh);
    }

    onMount(() => {
        const initializeGlobe = async () => {
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
                const scalarSelection = d3.select(scalarCanvas);
                globe.render(mapSelection, foregroundSelection, scalarSelection, mesh);

                // Initialize wind particle renderer
                if (vectorCanvas && globe) {
                    windRenderer = new WindParticleRenderer(vectorCanvas, globe.projection);
                    await loadAndSetWindData();
                }

            } catch (error) {
                console.error("Failed to initialize globe renderer:", error);
            }
        };

        // Expose functions globally for debugging/testing
        (window as any).loadScalarOverlay = loadScalarOverlay;
        (window as any).loadBaseLayerData = loadBaseLayerData;

        initializeGlobe();

        // Return cleanup function
        return () => {
            globe?.destroy();
            windRenderer?.destroy();
        };
    });

    // Create sample wind data for demonstration
    function createSampleWindData() {
        const width = 360;
        const height = 180;
        const u: number[][] = [];
        const v: number[][] = [];

        for (let y = 0; y < height; y++) {
            u[y] = [];
            v[y] = [];
            for (let x = 0; x < width; x++) {
                const lon = x - 180;
                const lat = 90 - y;
                
                // Create a simple wind pattern - westerlies and trade winds
                const latRad = (lat * Math.PI) / 180;
                const lonRad = (lon * Math.PI) / 180;
                
                // Simulate jet stream around 30-60 degrees
                let uWind = 0;
                let vWind = 0;
                
                if (Math.abs(lat) > 30 && Math.abs(lat) < 60) {
                    // Westerlies - strong east-west flow
                    uWind = 15 + 10 * Math.cos(latRad * 2);
                    vWind = 2 * Math.sin(lonRad * 2);
                } else if (Math.abs(lat) < 30) {
                    // Trade winds - easterlies
                    uWind = -8 + 3 * Math.sin(lonRad);
                    vWind = 1 * Math.cos(lonRad);
                }
                
                // Add some turbulence
                uWind += (Math.random() - 0.5) * 2;
                vWind += (Math.random() - 0.5) * 2;
                
                u[y][x] = uWind;
                v[y][x] = vWind;
            }
        }

        return {
            u,
            v,
            bounds: {
                north: 90,
                south: -90,
                east: 180,
                west: -180
            },
            width,
            height
        };
    }

    // Update wind renderer when projection changes
    $: if (windRenderer && globe && $projection !== currentProjection) {
        windRenderer.updateProjection(globe.projection);
    }

    // Load base layer data when activeBaseLayerId changes
    $: if ($activeBaseLayerId && dataLoader) {
        console.log(`🔄 Globe: Active base layer changed to: ${$activeBaseLayerId}`);
        loadBaseLayerData($activeBaseLayerId);
    }

    // Load and render base layer data when it changes
    $: if (baseLayerData && globe) {
        console.log('🎨 Globe: Rendering base layer data:', baseLayerData);
        const flatData = baseLayerData.data.flat().filter((d: any) => d !== null) as number[];
        const colorScale = d3.scaleSequential(d3.interpolateViridis)
            .domain(d3.extent(flatData) as [number, number]);
        
        globe.renderScalarData(d3.select(scalarCanvas), baseLayerData, colorScale);
    }

    // Load overlay data when activeOverlayLayerId changes (currently just wind)
    $: if ($activeOverlayLayerId && dataLoader) {
        console.log(`🔄 Globe: Active overlay layer changed to: ${$activeOverlayLayerId}`);
        // For now, we only support wind overlay, but this could be extended
        if ($activeOverlayLayerId === 'wnd10m') {
            loadAndSetWindData();
        }
    }
</script>

<div id="display">
    <svg bind:this={mapSvg} id="map" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
    <canvas bind:this={scalarCanvas} id="scalar-layer" class="fill-screen"></canvas>
    <canvas bind:this={vectorCanvas} id="vector-layer" class="fill-screen"></canvas>
    <svg bind:this={foregroundSvg} id="foreground" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
