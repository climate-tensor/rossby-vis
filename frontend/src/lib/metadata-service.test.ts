import { describe, expect, it } from 'vitest';
import { generateMetadataLayers } from './metadata-service';
import type { CategorizedVariables, NetCDFMetadata } from './types';

const EMPTY_CATEGORIES: CategorizedVariables = {
    atmospheric: [],
    oceanic: [],
    surface: [],
    excluded: [],
    vectorComponents: []
};

function metadataWithVariables(variableNames: string[]): NetCDFMetadata {
    const variables = Object.fromEntries(
        variableNames.map((name) => [
            name,
            {
                attributes: {
                    long_name: name,
                    units: '1'
                },
                dimensions: ['time', 'latitude', 'longitude'],
                dtype: 'Basic(Short)',
                name,
                shape: [24, 721, 1440]
            } as any
        ])
    );

    return {
        coordinates: {},
        dimensions: {},
        variables
    };
}

function rolesFor(variableNames: string[]): Record<string, 'base' | 'overlay'> {
    return Object.fromEntries(
        generateMetadataLayers(metadataWithVariables(variableNames), EMPTY_CATEGORIES, 'sfc').map((layer) => [
            layer.variable,
            layer.role
        ])
    );
}

describe('generateMetadataLayers ERA5 rules', () => {
    it('places 1979 surface-analysis scalar fields into base layers', () => {
        const roles = rolesFor([
            'hcc',
            'swvl3',
            'fdir',
            'ttr',
            'sd',
            'swvl2',
            'swh',
            'tcc',
            'sro',
            'mcc',
            'swvl4',
            'lcc',
            'pev',
            'ssro',
            'swvl1',
            'siconc',
            'tcwv',
            'ssrd'
        ]);

        expect(Object.values(roles).every((role) => role === 'base')).toBe(true);
    });

    it('places diagnostic scalar fields into overlay layers', () => {
        expect(rolesFor(['msl', 'blh', 'cbh', 'i10fg'])).toEqual({
            msl: 'overlay',
            blh: 'overlay',
            cbh: 'overlay',
            i10fg: 'overlay'
        });
    });

    it('groups u/v wind components as one overlay layer and hides v components', () => {
        const layers = generateMetadataLayers(metadataWithVariables(['u10', 'v10', 'u100', 'v100']), EMPTY_CATEGORIES, 'sfc');

        expect(layers.map((layer) => [layer.variable, layer.role, layer.isVector])).toEqual([
            ['u10', 'overlay', true],
            ['u100', 'overlay', true]
        ]);
    });
});
