import { writable, readable, derived } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import type { DataLayer, Probe, PhysicalMode, Projection } from './types';


// =================================================================
// 1. Data Catalog - Readable Stores
// =================================================================

export const availableBaseLayers: Readable<DataLayer[]> = readable([
    { id: 'earth_land_topo', name: 'Land & Topography', description: 'Shows continental landmass and topography.', source: 'Natural Earth', unit: '' },
    { id: 'earth_night', name: 'Earth at Night', description: 'Shows city lights from space.', source: 'NASA', unit: '' },
]);

export const availableOverlayLayers: Readable<DataLayer[]> = readable([
    { id: 'ocean_currents', name: 'Ocean Currents', description: 'Global ocean surface currents.', source: 'OSCAR', unit: 'm/s' },
    { id: 'wind_surface', name: 'Surface Wind', description: 'Global surface wind patterns.', source: 'GFS', unit: 'km/h' },
]);


// =================================================================
// 2. User Selections - Writable Stores
// =================================================================

export const projection: Writable<Projection> = writable('ortho');
export const activeBaseLayerId: Writable<string> = writable('earth_land_topo');
export const activeOverlayLayerId: Writable<string | null> = writable('ocean_currents');
export const simulationTime: Writable<Date> = writable(new Date());
export const isPlaying: Writable<boolean> = writable(true);
export const verticalLevel: Writable<number> = writable(500);


// =================================================================
// 3. 派生的结果 (The Result) & App State
// =================================================================

export const physicalMode: Writable<PhysicalMode> = writable('sfc');

export const dimensionality: Writable<'2D' | '3D'> = writable('2D');

export const activeBaseLayer = derived(
    [availableBaseLayers, activeBaseLayerId],
    ([$layers, $id]) => $layers.find(layer => layer.id === $id) || null
);

export const activeOverlayLayer = derived(
    [availableOverlayLayers, activeOverlayLayerId],
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