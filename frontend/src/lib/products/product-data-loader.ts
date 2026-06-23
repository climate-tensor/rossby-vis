/**
 * @fileoverview
 * Product Data Loader - Phase 3.2 Integration
 *
 * Bridges the World B rendering pipeline (products / globes / renderers) to real
 * data served by the Rust proxy (`/proxy/data`). It establishes a single,
 * tested contract:
 *
 *     layer/product id  ->  backend variables  ->  Product.buildGrid() rawData  ->  Grid
 *
 * The resolver prefers metadata-driven truth (detected vector pairs and real
 * NetCDF variable names from `metadata-service`) and only falls back to a small
 * semantic alias map when no metadata is available (e.g. local dev without a
 * live Rossby backend).
 */

import { get } from 'svelte/store';
import type { NetCDFMetadata, VectorPair } from '../types';
import { metadataState, metadataService } from '../metadata-service';
import { createProduct, productService, type Product, type Grid } from './index';
import { GridFactory } from './grid';
import { getColorScaleDescriptor } from '../color-scales';

/**
 * Create a product only when it is actually registered, avoiding the noisy
 * "Unknown product ID" warning that `createProduct` emits for ids that are
 * expected to miss (e.g. backend variable names like `u10` that resolve to a
 * canonical product via a different code path).
 */
function createKnownProduct(id: string): Product | null {
    return productService.hasProduct(id) ? createProduct(id) : null;
}

/**
 * A fully resolved data request: which World B product to build the grid with,
 * and which backend variables (and optional level) to fetch.
 */
export interface ResolvedRequest {
    /** The World B product used to interpret and build the grid. */
    product: Product;
    /** Backend variable names to request from `/proxy/data`. */
    variables: string[];
    /** For vector products, the detected u/v variable pair. */
    vectorPair?: VectorPair;
    /** For scalar products, the primary backend variable name. */
    scalarKey?: string;
    /** Vertical level to request, when applicable. */
    level?: string;
}

/**
 * Static semantic alias map from World B product ids to backend variables.
 *
 * This is used ONLY when metadata has not been loaded (offline/dev). When
 * metadata is available, variables are taken from the detected vector pairs and
 * real NetCDF variable names instead, so this map is not a source of truth in
 * production.
 */
const PRODUCT_ALIASES: Record<
    string,
    { kind: 'vector'; u: string; v: string; level?: string } | { kind: 'scalar'; scalar: string; level?: string }
> = {
    wnd10m: { kind: 'vector', u: 'u10', v: 'v10' },
    'wind-surface': { kind: 'vector', u: 'u10', v: 'v10' },
    'wind-850': { kind: 'vector', u: 'u', v: 'v', level: '850' },
    'wind-500': { kind: 'vector', u: 'u', v: 'v', level: '500' },
    'wind-250': { kind: 'vector', u: 'u', v: 'v', level: '250' },
    t2m: { kind: 'scalar', scalar: 't2m' },
    d2m: { kind: 'scalar', scalar: 'd2m' },
    sst: { kind: 'scalar', scalar: 'sst' },
    'temp-850': { kind: 'scalar', scalar: 't', level: '850' },
    'temp-500': { kind: 'scalar', scalar: 't', level: '500' },
    'temp-250': { kind: 'scalar', scalar: 't', level: '250' }
};

/**
 * Pick the canonical World B vector product id for a detected vector pair.
 * Surface/10m winds map to `wnd10m`; pressure-level winds map to `wind-<level>`.
 */
function vectorProductIdForPair(pair: VectorPair): string {
    const level = pair.level;
    if (!level || level === '10' || level === '') {
        return 'wnd10m';
    }
    if (level === '100') {
        // No dedicated 100m product; reuse the 10m wind product for visualization.
        return 'wnd10m';
    }
    return `wind-${level}`;
}

/**
 * Resolve a selected layer/product id into a concrete data request.
 *
 * Resolution order (most authoritative first):
 *   1. Metadata layer match (by id or backend variable name).
 *   2. Direct World B product registry match.
 *   3. Static semantic alias map (offline/dev fallback).
 *
 * @param layerId The active base/overlay id from the stores.
 * @returns A resolved request, or `null` if the id cannot be mapped to a product.
 */
export function resolveProductRequest(layerId: string): ResolvedRequest | null {
    if (!layerId) {
        return null;
    }

    const state = get(metadataState);
    const layers = state.availableLayers || [];
    const metaLayer = layers.find((l) => l.id === layerId || l.variable === layerId);

    // 1. Metadata-driven resolution (authoritative when a live backend is present).
    if (metaLayer) {
        if (metaLayer.isVector && metaLayer.vectorPair) {
            const pair = metaLayer.vectorPair;
            const product = createKnownProduct(layerId) ?? createProduct(vectorProductIdForPair(pair));
            if (!product) {
                return null;
            }
            return {
                product,
                variables: [pair.u, pair.v],
                vectorPair: pair,
                level: pair.level && pair.level !== '10' ? pair.level : undefined
            };
        }

        // Scalar metadata layer.
        const product =
            createKnownProduct(layerId) ??
            createKnownProduct(metaLayer.variable) ??
            createProduct('t2m');
        if (!product) {
            return null;
        }
        return {
            product,
            variables: [metaLayer.variable],
            scalarKey: metaLayer.variable
        };
    }

    // 2. + 3. No metadata layer: rely on the product registry plus the alias map.
    const product = createProduct(layerId);
    if (!product) {
        return null;
    }

    const alias = PRODUCT_ALIASES[layerId];
    if (alias) {
        if (alias.kind === 'vector') {
            return {
                product,
                variables: [alias.u, alias.v],
                vectorPair: { u: alias.u, v: alias.v, level: alias.level },
                level: alias.level
            };
        }
        return {
            product,
            variables: [alias.scalar],
            scalarKey: alias.scalar,
            level: alias.level
        };
    }

    // Last resort: treat the id itself as the backend variable name.
    if (product.type === 'vector') {
        return null; // Cannot guess a u/v pair from a single unknown id.
    }
    return { product, variables: [layerId], scalarKey: layerId };
}

/** Raw data shape consumed by `Product.buildGrid()`. */
interface RawProductData {
    metadata: {
        shape: number[];
        bounds: { north: number; south: number; east: number; west: number };
        units: string;
    };
    data: Record<string, number[]>;
}

/** Grid geometry derived from the NetCDF `/metadata` document. */
interface GridGeometry {
    width: number;
    height: number;
    north: number;
    south: number;
    east: number;
    west: number;
    /** True when latitude coordinates ascend (south -> north). */
    latAscending: boolean;
}

/**
 * Extract grid geometry from the full NetCDF metadata. Coordinate arrays and
 * dimension sizes live in the `/metadata` document (loaded by metadata-service),
 * NOT in the per-query `/data` response, so geometry must come from here.
 */
function extractGeometry(meta: NetCDFMetadata): GridGeometry {
    const coords = meta.coordinates ?? {};
    const lat: number[] = coords.latitude ?? coords.lat ?? [];
    const lon: number[] = coords.longitude ?? coords.lon ?? [];

    const dims = (meta.dimensions ?? {}) as Record<string, { size?: number }>;
    const width = dims.longitude?.size ?? dims.lon?.size ?? lon.length;
    const height = dims.latitude?.size ?? dims.lat?.size ?? lat.length;

    if (!width || !height || lat.length === 0 || lon.length === 0) {
        throw new Error('Cannot determine grid geometry from metadata');
    }

    const latAscending = lat[0] < lat[lat.length - 1];
    const north = Math.max(lat[0], lat[lat.length - 1]);
    const south = Math.min(lat[0], lat[lat.length - 1]);
    const west = lon[0];
    const east = lon[lon.length - 1];

    return { width, height, north, south, east, west, latAscending };
}

/**
 * Flip a row-major [height x width] array vertically so that row 0 corresponds
 * to the northernmost latitude. Required when the source latitude is ascending,
 * because both the worker and grid.ts assume north-first row order.
 */
function flipLatitudeRows(values: number[], width: number, height: number): number[] {
    const flipped = new Array<number>(values.length);
    for (let row = 0; row < height; row++) {
        const src = (height - 1 - row) * width;
        const dst = row * width;
        for (let col = 0; col < width; col++) {
            flipped[dst + col] = values[src + col];
        }
    }
    return flipped;
}

/**
 * Source units for a variable, read from the NetCDF variable metadata (Rossby
 * nests attributes under `attributes`). Needed so temperature products convert
 * from the data's real units (e.g. Kelvin) rather than the product's display
 * units.
 */
function sourceUnits(meta: NetCDFMetadata, variable: string): string {
    const varMeta: any = meta.variables?.[variable];
    return varMeta?.units ?? varMeta?.attributes?.units ?? '';
}

/**
 * Normalize a `/proxy/data` response into the rawData shape expected by
 * `Product.buildGrid()`, using grid geometry from the full NetCDF metadata.
 * Ascending-latitude data is flipped to north-first row order; data is keyed so
 * that both vector and scalar products can consume it without name guessing.
 */
function normalizeResponse(
    response: any,
    request: ResolvedRequest,
    meta: NetCDFMetadata
): RawProductData {
    const geo = extractGeometry(meta);
    const { width, height, north, south, east, west, latAscending } = geo;

    const orient = (values: number[]): number[] =>
        latAscending ? flipLatitudeRows(values, width, height) : values;

    let data: Record<string, number[]>;
    let units: string;
    if (request.vectorPair) {
        const u = response.data?.[request.vectorPair.u];
        const v = response.data?.[request.vectorPair.v];
        if (!u || !v) {
            throw new Error(
                `Missing vector components ${request.vectorPair.u}/${request.vectorPair.v} in data response`
            );
        }
        data = { u: orient(u), v: orient(v) };
        units = sourceUnits(meta, request.vectorPair.u);
    } else {
        const key = request.scalarKey!;
        const values = response.data?.[key];
        if (!values) {
            throw new Error(`Missing scalar variable ${key} in data response`);
        }
        const oriented = orient(values);
        // Provide several aliases so scalar products with different naming
        // conventions (id-based, generic, or backend-name based) all resolve.
        data = { [key]: oriented, [request.product.id]: oriented, temperature: oriented };
        units = sourceUnits(meta, key);
    }

    return {
        metadata: {
            shape: [1, height, width],
            bounds: { north, south, east, west },
            units
        },
        data
    };
}

/**
 * Whether deterministic mock data may be substituted when the backend is
 * unreachable. Enabled only in dev builds with an explicit opt-in flag so that
 * data-contract bugs never masquerade as successful renders in production.
 */
function mockFallbackEnabled(): boolean {
    return Boolean(
        import.meta.env?.DEV && import.meta.env?.VITE_ALLOW_MOCK_DATA === 'true'
    );
}

/**
 * Build a deterministic mock rawData payload for offline development. Values are
 * smooth analytic fields (not random) so renders are reproducible.
 */
function buildMockRawData(request: ResolvedRequest): RawProductData {
    const width = 360;
    const height = 181;
    const bounds = { north: 90, south: -90, east: 180, west: -180 };

    const field = (fn: (lon: number, lat: number) => number): number[] => {
        const out = new Array(width * height);
        for (let j = 0; j < height; j++) {
            const lat = 90 - j;
            for (let i = 0; i < width; i++) {
                const lon = -180 + i;
                out[j * width + i] = fn(lon, lat);
            }
        }
        return out;
    };

    let data: Record<string, number[]>;
    if (request.vectorPair) {
        data = {
            u: field((lon, lat) => 10 * Math.sin((lat * Math.PI) / 90) + 5 * Math.cos((lon * Math.PI) / 180)),
            v: field((lon) => 8 * Math.sin((lon * Math.PI) / 90))
        };
    } else {
        const key = request.scalarKey ?? request.product.id;
        const values = field((lon, lat) => 30 - 0.5 * Math.abs(lat) + 5 * Math.cos((lon * Math.PI) / 180));
        data = { [key]: values, [request.product.id]: values, temperature: values };
    }

    return {
        metadata: { shape: [1, height, width], bounds, units: request.product.units || '' },
        data
    };
}

/**
 * Load and build a {@link Grid} for the given layer/product id using real
 * backend data. The current time (and optional level) come from the metadata
 * service.
 *
 * @param layerId Active base/overlay id from the stores.
 * @returns A Grid ready for interpolation.
 * @throws If the id cannot be resolved, the response is invalid, or the backend
 *   is unreachable (unless the explicit dev mock fallback is enabled).
 */
export async function loadProductGrid(layerId: string): Promise<Grid> {
    const request = resolveProductRequest(layerId);
    if (!request) {
        throw new Error(`Cannot resolve a data product for "${layerId}"`);
    }

    const time = metadataService.getCurrentTime() ?? undefined;
    const fullMeta = get(metadataState).metadata;

    let raw: RawProductData;
    try {
        if (!fullMeta) {
            throw new Error('NetCDF metadata not loaded; cannot determine grid geometry');
        }
        const response = await metadataService.loadData({
            variables: request.variables,
            time,
            level: request.level,
            format: 'json'
        });
        raw = normalizeResponse(response, request, fullMeta);
    } catch (error) {
        // Only fall back to mock data for genuine backend/network failures, and
        // only when explicitly enabled for development.
        if (mockFallbackEnabled()) {
            console.warn(
                `product-data-loader: backend unavailable for "${layerId}", using mock data.`,
                error
            );
            raw = buildMockRawData(request);
        } else {
            throw error;
        }
    }

    // Scalar fields are colored on their own raw-unit range (Kelvin, Pascals,
    // ...) by the worker, exactly like the original earth.js. Build the grid
    // directly from the raw values so we never apply a product-specific unit
    // conversion (e.g. the temperature product's Kelvin->Celsius) that would
    // push the data outside its color scale's bounds. This is what made
    // pressure (`sp`, ~100000 Pa) render as a single featureless color: it fell
    // back to the temperature product and got mangled by Kelvin->Celsius.
    const grid: Grid =
        request.product.type === 'scalar'
            ? buildRawScalarGrid(raw, request)
            : await request.product.buildGrid(raw);

    grid.colorScale = getColorScaleDescriptor(
        request.vectorPair ? request.vectorPair.u : (request.scalarKey ?? layerId)
    );

    return grid;
}

/**
 * Build a scalar {@link Grid} straight from the normalized raw values, without
 * any unit conversion. Geometry comes from the response metadata. Used so every
 * scalar variable is colored on its true physical range.
 */
function buildRawScalarGrid(raw: RawProductData, request: ResolvedRequest): Grid {
    const { shape, bounds } = raw.metadata;
    const hasTimeDimension = shape.length > 2;
    const latIndex = hasTimeDimension ? 1 : 0;
    const lonIndex = hasTimeDimension ? 2 : 1;
    const dimensions = { width: shape[lonIndex], height: shape[latIndex] };
    const gridBounds = {
        north: bounds.north ?? 90,
        south: bounds.south ?? -90,
        east: bounds.east ?? 180,
        west: bounds.west ?? -180
    };

    const key = request.scalarKey ?? request.product.id;
    const values = raw.data[key] ?? raw.data[request.product.id];
    if (!values || values.length === 0) {
        throw new Error(`Missing scalar data for ${key}`);
    }

    return GridFactory.createScalarGrid(values, gridBounds, dimensions);
}
