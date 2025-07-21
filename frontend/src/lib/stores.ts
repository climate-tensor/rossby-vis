import { writable, readable, derived } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import type { DataLayer, Probe, PhysicalMode, Projection } from './types';


// =================================================================
// 1. Data Catalog - Readable Stores
// =================================================================

export const dataLayers: Readable<DataLayer[]> = readable([
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
]);


// =================================================================
// 2. User Selections - Writable Stores
// =================================================================

export const projection: Writable<Projection> = writable('orthographic');
export const activeBaseLayerId: Writable<string> = writable('t2m');
export const activeOverlayLayerId: Writable<string | null> = writable('wnd10m');
export const simulationTime: Writable<Date> = writable(new Date());
export const isPlaying: Writable<boolean> = writable(true);
export const verticalLevel: Writable<number> = writable(500);


// =================================================================
// 3. 派生的结果 (The Result) & App State
// =================================================================

export const physicalMode: Writable<PhysicalMode> = writable('atm');

export const dimensionality: Writable<'2D' | '3D'> = writable('2D');

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
