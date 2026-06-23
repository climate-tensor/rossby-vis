/**
 * @fileoverview
 * Unit and integration tests for the product data loader: the
 * productId/layer -> backend vars -> buildGrid rawData contract that connects
 * World B to real backend data.
 *
 * The integration tests use real responses captured from a live `rossby` server
 * serving the ERA5 fixture `2m_temperature_1982_5.625deg.nc` (ascending
 * latitude, 0-360 longitude, Kelvin values), stored under `__fixtures__/`.
 */

import { readFileSync } from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveProductRequest, loadProductGrid } from './product-data-loader';
import { metadataState, metadataService } from '../metadata-service';
import type { MetadataDataLayer, MetadataUIState, NetCDFMetadata } from '../types';

const EMPTY_STATE: MetadataUIState = {
    loaded: false,
    loading: false,
    error: null,
    metadata: null,
    modeInfo: null,
    categorizedVariables: null,
    dimensionAnalysis: null,
    timeNavigation: null,
    availableLayers: [],
    selectedLevel: null
};

function readFixture<T>(name: string): T {
    return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf-8'));
}

const REAL_META = readFixture<NetCDFMetadata>('rossby-metadata.json');
const REAL_DATA = readFixture<{ data: Record<string, number[]> }>('rossby-data-t2m.json');

function setState(partial: Partial<MetadataUIState>): void {
    metadataState.set({ ...EMPTY_STATE, loaded: true, ...partial });
}

/** A synthetic descending-latitude, -180..180 metadata document. */
function syntheticMeta(width: number, height: number): NetCDFMetadata {
    const longitude = Array.from({ length: width }, (_, i) => -180 + (360 / width) * i);
    const latitude = Array.from({ length: height }, (_, j) => 90 - (180 / (height - 1)) * j); // descending
    return {
        variables: { u10: { dimensions: [], dtype: 'f4', shape: [] } as any },
        coordinates: { longitude, latitude },
        dimensions: { longitude: { size: width }, latitude: { size: height } } as any
    };
}

function windLayer(): MetadataDataLayer {
    return {
        id: 'u10',
        variable: 'u10',
        name: 'Wind 10m',
        description: '10 metre wind components',
        source: 'ERA5',
        unit: 'm/s',
        role: 'overlay',
        category: 'atmospheric',
        isVector: true,
        vectorPair: { u: 'u10', v: 'v10', level: '10' },
        metadata: { dimensions: [], dtype: 'f4', shape: [] }
    };
}

beforeEach(() => {
    metadataState.set({ ...EMPTY_STATE });
    vi.restoreAllMocks();
});

afterEach(() => {
    metadataState.set({ ...EMPTY_STATE });
});

describe('resolveProductRequest', () => {
    it('resolves wnd10m to u10/v10 via the alias map when no metadata is loaded', () => {
        const req = resolveProductRequest('wnd10m');
        expect(req).not.toBeNull();
        expect(req!.product.type).toBe('vector');
        expect(req!.variables).toEqual(['u10', 'v10']);
        expect(req!.vectorPair).toEqual({ u: 'u10', v: 'v10', level: undefined });
    });

    it('resolves a metadata wind layer (by backend id u10) to its detected vector pair', () => {
        setState({ availableLayers: [windLayer()] });
        const req = resolveProductRequest('u10');
        expect(req).not.toBeNull();
        expect(req!.product.type).toBe('vector');
        expect(req!.variables).toEqual(['u10', 'v10']);
        expect(req!.vectorPair).toEqual({ u: 'u10', v: 'v10', level: '10' });
    });

    it('resolves t2m to a scalar request', () => {
        const req = resolveProductRequest('t2m');
        expect(req).not.toBeNull();
        expect(req!.product.type).toBe('scalar');
        expect(req!.variables).toEqual(['t2m']);
        expect(req!.scalarKey).toBe('t2m');
    });

    it('resolves sst to a scalar request', () => {
        const req = resolveProductRequest('sst');
        expect(req).not.toBeNull();
        expect(req!.product.type).toBe('scalar');
        expect(req!.scalarKey).toBe('sst');
    });

    it('resolves pressure-level wind to a level request', () => {
        const req = resolveProductRequest('wind-850');
        expect(req).not.toBeNull();
        expect(req!.variables).toEqual(['u', 'v']);
        expect(req!.level).toBe('850');
    });

    it('returns null for an unknown id', () => {
        expect(resolveProductRequest('not-a-real-product')).toBeNull();
    });
});

describe('loadProductGrid (synthetic geometry)', () => {
    it('builds a vector grid for wnd10m from a backend response', async () => {
        setState({ metadata: syntheticMeta(4, 3) });
        const u = new Array(12).fill(5);
        const v = new Array(12).fill(-3);
        vi.spyOn(metadataService, 'loadData').mockResolvedValue({ data: { u10: u, v10: v } } as any);

        const grid = await loadProductGrid('wnd10m');
        expect(grid.type).toBe('vector');
        expect(grid.dimensions).toEqual({ width: 4, height: 3 });
        expect(grid.bounds.north).toBe(90);
        expect(grid.bounds.south).toBe(-90);
        expect(grid.interpolate(0, 0)).toEqual([5, -3]);
    });

    it('requests exactly the resolved variables', async () => {
        setState({ metadata: syntheticMeta(4, 3) });
        const spy = vi
            .spyOn(metadataService, 'loadData')
            .mockResolvedValue({ data: { u10: new Array(12).fill(1), v10: new Array(12).fill(1) } } as any);

        await loadProductGrid('wnd10m');
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ variables: ['u10', 'v10'], format: 'json' }));
    });

    it('throws (no silent mock fallback) when the backend is unreachable', async () => {
        setState({ metadata: syntheticMeta(4, 3) });
        vi.spyOn(metadataService, 'loadData').mockRejectedValue(new Error('network down'));
        await expect(loadProductGrid('wnd10m')).rejects.toThrow('network down');
    });

    it('throws for an unresolvable id before fetching', async () => {
        const spy = vi.spyOn(metadataService, 'loadData');
        await expect(loadProductGrid('not-a-real-product')).rejects.toThrow(/Cannot resolve/);
        expect(spy).not.toHaveBeenCalled();
    });

    it('throws when metadata geometry is unavailable', async () => {
        // No metadata set -> cannot determine geometry.
        vi.spyOn(metadataService, 'loadData').mockResolvedValue({ data: { t2m: new Array(12).fill(280) } } as any);
        await expect(loadProductGrid('t2m')).rejects.toThrow(/metadata not loaded|geometry/i);
    });
});

describe('loadProductGrid (real rossby ERA5 fixture)', () => {
    beforeEach(() => {
        setState({ metadata: REAL_META });
        vi.spyOn(metadataService, 'loadData').mockResolvedValue(REAL_DATA as any);
    });

    it('derives correct geometry from /metadata (ascending lat, 0-360 lon)', async () => {
        const grid = await loadProductGrid('t2m');
        expect(grid.type).toBe('scalar');
        expect(grid.dimensions).toEqual({ width: 64, height: 32 });
        // Latitude ascends -87.1875..87.1875 -> bounds normalized north>south.
        expect(grid.bounds.north).toBeCloseTo(87.1875, 3);
        expect(grid.bounds.south).toBeCloseTo(-87.1875, 3);
        expect(grid.bounds.west).toBeCloseTo(0, 3);
        expect(grid.bounds.east).toBeCloseTo(354.375, 3);
    });

    it('flips ascending latitude so row 0 is the northernmost data', async () => {
        const grid = await loadProductGrid('t2m');
        const width = 64;
        const height = 32;
        const raw = REAL_DATA.data.t2m;
        // Scalar grids now carry RAW data values (no unit conversion); coloring
        // applies the per-variable scale on raw Kelvin, matching earth.js.
        // Source latitude is ascending (row 0 = southernmost). After flipping,
        // the northernmost grid row must equal the original last data row.
        const expectedNorth = raw[(height - 1) * width + 0]; // lat = +87.1875
        // Use the second-southernmost grid latitude (lat[1] = -81.5625), an
        // interior row, to avoid the bilinear edge artifact at the exact south
        // boundary where the next row does not exist.
        const expectedSecondSouth = raw[1 * width + 0];
        expect(grid.interpolate(0, 87.1875)).toBeCloseTo(expectedNorth, 3);
        expect(grid.interpolate(0, -81.5625)).toBeCloseTo(expectedSecondSouth, 3);
    });

    it('interpolates physically plausible values across the globe', async () => {
        const grid = await loadProductGrid('t2m');
        // Scalar grids carry raw values; ERA5 2m temperature is in Kelvin, so
        // plausible surface temperatures fall roughly in 180..340 K.
        for (const [lon, lat] of [
            [0, 0],
            [180, 0],
            [350, 45],
            [10, -45]
        ] as [number, number][]) {
            const v = grid.interpolate(lon, lat) as number;
            expect(v).not.toBeNull();
            expect(v).toBeGreaterThan(180);
            expect(v).toBeLessThan(340);
        }
    });
});
