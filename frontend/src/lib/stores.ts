import { writable, readable, derived } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import type { DataLayer, Probe, PhysicalMode, Projection } from './types';
import { parseUrlHash, updateUrlHash } from './url-synchronizer';

// Import the metadata layers from the metadata service
import { 
    availableMetadataLayers, 
    currentMode as metadataMode,
    timeNavigation,
    selectedLevel,
    dimensionAnalysis,
    isMetadataLoading,
    metadataService 
} from './metadata-service';

// Static fallback layers for when metadata is not available
const staticDataLayers: DataLayer[] = [
    // --- Base Layers ---
    { id: 't2m', name: '2m Temperature', description: 'Temperature at 2 meters above ground.', source: 'ERA5', unit: '°C', mode: ['sfc', 'atm'], role: 'base' },
    { id: 'sst', name: 'Sea Surface Temp', description: 'Sea surface temperature.', source: 'ERA5', unit: '°C', mode: ['ocn'], role: 'base' },
    { id: 'tcc', name: 'Total Cloud Cover', description: 'Total cloud cover.', source: 'ERA5', unit: '%', mode: ['sfc', 'atm'], role: 'base' },
    { id: 'tp', name: 'Total Precipitation', description: 'Total precipitation.', source: 'ERA5', unit: 'mm', mode: ['sfc', 'atm'], role: 'base' },

    // --- Overlay Layers ---
    { id: 'wnd10m', name: '10m Wind', description: 'Wind at 10 meters above ground.', source: 'ERA5', unit: 'km/h', mode: ['sfc', 'atm'], role: 'overlay' },
    { id: 'msl', name: 'Mean Sea Level Pressure', description: 'Mean sea level pressure.', source: 'ERA5', unit: 'hPa', mode: ['sfc', 'atm'], role: 'overlay' },
    { id: 'z', name: 'Geopotential Height', description: 'Geopotential height.', source: 'ERA5', unit: 'm', mode: ['atm'], role: 'overlay', levels: [
            { label: '1000 hPa', value: 1000 },
            { label: '850 hPa', value: 850 },
            { label: '500 hPa', value: 500 },
        ]
    },
];

// Convert metadata layers to DataLayer format
function convertMetadataLayer(metaLayer: any): DataLayer {
    // Map metadata categories to mode arrays
    const modeMap: Record<string, PhysicalMode[]> = {
        'atmospheric': ['atm', 'sfc'],
        'oceanic': ['ocn'],
        'surface': ['sfc', 'atm']
    };

    return {
        id: metaLayer.id,
        name: metaLayer.name,
        description: metaLayer.description,
        source: metaLayer.source,
        unit: metaLayer.unit,
        mode: modeMap[metaLayer.category] || ['sfc'],
        role: metaLayer.role
    };
}

// Dynamic data layers that combine static and metadata-driven layers
export const dataLayers: Readable<DataLayer[]> = derived(
    [availableMetadataLayers],
    ([$metadataLayers]) => {
        if ($metadataLayers.length > 0) {
            // Use metadata-driven layers when available
            return $metadataLayers.map(convertMetadataLayer);
        } else {
            // Fallback to static layers
            return staticDataLayers;
        }
    }
);


// =================================================================
// 2. User Selections - Writable Stores
// =================================================================

export const projection: Writable<Projection> = writable('orthographic');
export const activeBaseLayerId: Writable<string> = writable('t2m');
export const activeOverlayLayerId: Writable<string | null> = writable('wnd10m');
export const isPlaying: Writable<boolean> = writable(true);

// Connect to metadata service stores - these are derived from metadata
export const physicalMode: Readable<PhysicalMode> = derived(
    [metadataMode],
    ([$mode]) => $mode || 'sfc'
);

export const simulationTime: Readable<Date> = derived(
    [timeNavigation],
    ([$timeNav]) => $timeNav ? new Date($timeNav.current) : new Date()
);

export const verticalLevel: Readable<number> = derived(
    [selectedLevel],
    ([$level]) => {
        if ($level === null) return 500;
        const parsed = parseFloat($level);
        return isNaN(parsed) ? 500 : parsed;
    }
);


// =================================================================
// 3. 派生的结果 (The Result) & App State
// =================================================================

export const dimensionality: Readable<'2D' | '3D'> = derived(
    [dimensionAnalysis],
    ([$dimAnalysis]) => $dimAnalysis?.is3D ? '3D' : '2D'
);

export const availableBaseLayers = derived(
    [dataLayers, physicalMode],
    ([$layers, $mode]) => $layers.filter(layer => layer.role === 'base' && (layer.mode === 'all' || layer.mode.includes($mode)))
);

export const availableOverlayLayers = derived(
    [dataLayers, physicalMode],
    ([$layers, $mode]) => $layers.filter(layer => layer.role === 'overlay' && (layer.mode === 'all' || layer.mode.includes($mode)))
);

export const activeBaseLayer = derived(
    [dataLayers, activeBaseLayerId],
    ([$layers, $id]) => $layers.find(layer => layer.id === $id) || null
);

export const activeOverlayLayer = derived(
    [dataLayers, activeOverlayLayerId],
    ([$layers, $id]) => $layers.find(layer => layer.id === $id) || null
);

export const probe: Writable<Probe> = writable({
    visible: false,
    lat: 0,
    lon: 0,
    dataValue: null,
    x: 0,
    y: 0,
});

export const isLoading: Writable<boolean> = writable(false);

// =================================================================
// 4. URL Synchronization - Phase 1.1 Implementation
// =================================================================

/**
 * Initialize URL synchronization for all relevant stores
 * This implements the bidirectional binding between stores and URL hash
 * as specified in the migration plan Phase 1.1
 */
export function initializeUrlSync() {
    let isUpdatingFromUrl = false;
    
    /**
     * Update stores from current URL hash
     */
    function updateStoresFromUrl() {
        if (isUpdatingFromUrl) return;
        
        isUpdatingFromUrl = true;
        const urlState = parseUrlHash();
        
        // Update stores with parsed values, maintaining type safety
        if (urlState.proj) {
            projection.set(urlState.proj);
        }
        if (urlState.base) {
            activeBaseLayerId.set(urlState.base);
        }
        if (urlState.ov !== undefined) {
            activeOverlayLayerId.set(urlState.ov || null);
        }
        
        isUpdatingFromUrl = false;
    }
    
    /**
     * Update URL hash when stores change
     */
    function setupStoreSubscriptions() {
        // Subscribe to projection changes
        projection.subscribe(($projection) => {
            if (!isUpdatingFromUrl) {
                updateUrlHash({ proj: $projection });
            }
        });
        
        // Subscribe to base layer changes
        activeBaseLayerId.subscribe(($baseId) => {
            if (!isUpdatingFromUrl) {
                updateUrlHash({ base: $baseId });
            }
        });
        
        // Subscribe to overlay layer changes
        activeOverlayLayerId.subscribe(($overlayId) => {
            if (!isUpdatingFromUrl) {
                updateUrlHash({ ov: $overlayId || undefined });
            }
        });
    }
    
    // Listen for browser navigation events (back/forward buttons)
    const handleHashChange = () => updateStoresFromUrl();
    window.addEventListener('hashchange', handleHashChange);
    
    // Initialize stores from current URL on first load
    updateStoresFromUrl();
    
    // Setup store-to-URL synchronization
    setupStoreSubscriptions();
    
    // Return cleanup function
    return () => {
        window.removeEventListener('hashchange', handleHashChange);
    };
}
