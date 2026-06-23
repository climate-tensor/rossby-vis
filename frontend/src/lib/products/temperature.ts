/**
 * @fileoverview
 * Temperature Product Implementation - Phase 1.3 Implementation
 * 
 * This module implements temperature data products (scalar fields),
 * reproducing the temperature factory pattern from the original products.js
 */

import type { Product, ScalarGrid, ColorScale } from './types';
import { GridFactory } from './grid';

/**
 * Base temperature product implementation
 */
class TemperatureProduct implements Product {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly source: string;
    readonly units: string;
    readonly type = 'scalar' as const;
    readonly role = 'base' as const;
    readonly scale: ColorScale;

    constructor(config: {
        id: string;
        name: string;
        description: string;
        source: string;
        units: string;
        scale: ColorScale;
    }) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.source = config.source;
        this.units = config.units;
        this.scale = config.scale;
    }

    async buildGrid(rawData: any): Promise<ScalarGrid> {
        if (!this.isValidData(rawData)) {
            throw new Error(`Invalid data format for temperature product ${this.id}`);
        }

        // Extract metadata and data arrays
        const { metadata, data } = rawData;
        const { shape, bounds } = metadata;
        
        // Extract temperature data - prefer this product's own id, then fall
        // back to common naming conventions.
        const tempData =
            data[this.id] || data.t2m || data.temperature || data.t || data.temp || data.d2m || data.dewpoint || [];

        if (tempData.length === 0) {
            throw new Error('Missing temperature data in dataset');
        }

        // Convert from Kelvin to Celsius if needed
        const convertedData = this.convertTemperatureUnits(tempData, metadata);

        // Extract grid dimensions and bounds
        const hasTimeDimension = shape.length > 2;
        const latIndex = hasTimeDimension ? 1 : 0;
        const lonIndex = hasTimeDimension ? 2 : 1;
        const dimensions = {
            width: shape[lonIndex],   // longitude dimension
            height: shape[latIndex]   // latitude dimension
        };

        // Use ?? so legitimate zero bounds (e.g. west = 0 for 0-360 grids) are
        // preserved rather than replaced by defaults.
        const gridBounds = {
            north: bounds.north ?? 90,
            south: bounds.south ?? -90,
            east: bounds.east ?? 180,
            west: bounds.west ?? -180
        };

        return GridFactory.createScalarGrid(convertedData, gridBounds, dimensions);
    }

    /**
     * Convert temperature units if necessary
     */
    private convertTemperatureUnits(data: number[], metadata: any): number[] {
        const units = (metadata.units || metadata.variable_units || '').toLowerCase().trim();

        // Explicit Kelvin units -> Celsius.
        if (units === 'k' || units === 'kelvin' || units.includes('kelvin')) {
            return data.map((temp) => temp - 273.15);
        }

        // Explicit Fahrenheit units -> Celsius.
        if (units === 'f' || units === 'fahrenheit' || units.includes('fahrenheit')) {
            return data.map((temp) => (temp - 32) * 5 / 9);
        }

        // Explicit Celsius (or already Celsius): leave as-is.
        if (units === 'c' || units === '°c' || units.includes('celsius')) {
            return [...data];
        }

        // Unknown units: infer Kelvin by magnitude. Earth temperatures in Kelvin
        // are ~180-340; in Celsius they are ~-90..60. A finite sample well above
        // the plausible Celsius range is almost certainly Kelvin.
        const sample = data.find((v) => Number.isFinite(v));
        if (sample !== undefined && sample > 100) {
            return data.map((temp) => temp - 273.15);
        }

        return [...data];
    }

    isValidData(rawData: any): boolean {
        if (!rawData || typeof rawData !== 'object') {
            return false;
        }

        const { metadata, data } = rawData;
        
        // Check metadata structure
        if (!metadata || !metadata.shape || !Array.isArray(metadata.shape)) {
            return false;
        }

        // Check data structure - should have temperature field
        if (!data || typeof data !== 'object') {
            return false;
        }

        const hasTemperature = !!(
            data[this.id] || data.t2m || data.temperature || data.t || data.temp || data.d2m || data.dewpoint
        );
        return hasTemperature;
    }
}

/**
 * 2-meter temperature product factory
 */
export function createTemperature2mProduct(): Product {
    return new TemperatureProduct({
        id: 't2m',
        name: '2m Temperature',
        description: 'Temperature at 2 meters above ground level',
        source: 'ERA5',
        units: '°C',
        scale: {
            min: -50,
            max: 50,
            palette: 'temperature',
            steps: 20
        }
    });
}

/**
 * Sea surface temperature product factory
 */
export function createSeaSurfaceTemperatureProduct(): Product {
    return new TemperatureProduct({
        id: 'sst',
        name: 'Sea Surface Temperature',
        description: 'Temperature of the sea surface',
        source: 'ERA5',
        units: '°C',
        scale: {
            min: -2,
            max: 35,
            palette: 'ocean_temperature',
            steps: 15
        }
    });
}

/**
 * Upper-level temperature product factory
 */
export function createUpperTemperatureProduct(level: number): Product {
    return new TemperatureProduct({
        id: `temp-${level}`,
        name: `${level}hPa Temperature`,
        description: `Temperature at ${level} hPa pressure level`,
        source: 'ERA5',
        units: '°C',
        scale: {
            min: -80,
            max: 40,
            palette: 'temperature',
            steps: 24
        }
    });
}

/**
 * 2-meter dewpoint temperature product factory
 */
export function createDewpoint2mProduct(): Product {
    return new TemperatureProduct({
        id: 'd2m',
        name: '2m Dewpoint Temperature',
        description: 'Dewpoint temperature at 2 meters above ground level',
        source: 'ERA5',
        units: '°C',
        scale: {
            min: -40,
            max: 30,
            palette: 'humidity',
            steps: 14
        }
    });
}
