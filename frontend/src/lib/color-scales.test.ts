/**
 * @fileoverview
 * Unit tests for the per-variable color scale logic ported from the original
 * earth.js (`getVariableQuantity` + `getVariableScale`). These guard the fix
 * that stopped non-temperature scalars (e.g. surface pressure) from being
 * colored with the temperature scale, which rendered them featureless.
 */

import { describe, it, expect } from 'vitest';
import {
    getVariableQuantity,
    getColorScaleDescriptor,
    buildGradientFromDescriptor
} from './color-scales';

describe('getVariableQuantity', () => {
    it('classifies known variables by physical category', () => {
        expect(getVariableQuantity('t2m')).toBe('Temperature');
        expect(getVariableQuantity('t')).toBe('Temperature');
        expect(getVariableQuantity('sst')).toBe('Temperature');
        expect(getVariableQuantity('sp')).toBe('Pressure');
        expect(getVariableQuantity('msl')).toBe('Pressure');
        expect(getVariableQuantity('u10')).toBe('Wind');
        expect(getVariableQuantity('v')).toBe('Wind');
        expect(getVariableQuantity('d2m')).toBe('Humidity');
        expect(getVariableQuantity('z500')).toBe('Geopotential Height');
        expect(getVariableQuantity('sd')).toBe('Precipitation');
        expect(getVariableQuantity('tisr')).toBe('Radiation');
    });

    it('is case-insensitive and falls back to General', () => {
        expect(getVariableQuantity('SP')).toBe('Pressure');
        expect(getVariableQuantity('something_unknown')).toBe('General');
    });
});

describe('getColorScaleDescriptor', () => {
    it('gives pressure its own raw-Pascal segmented scale (not temperature)', () => {
        const desc = getColorScaleDescriptor('sp');
        expect(desc.kind).toBe('segmented');
        if (desc.kind === 'segmented') {
            // Bounds must span realistic surface pressures in Pascals.
            const values = desc.segments.map((s) => s[0]);
            expect(Math.min(...values)).toBe(90000);
            expect(Math.max(...values)).toBe(105000);
        }
    });

    it('uses the extended sinebow scale for wind, bounded at 100 m/s', () => {
        const desc = getColorScaleDescriptor('u10');
        expect(desc).toEqual({ kind: 'extendedSinebow', max: 100 });
    });

    it('uses a Kelvin segmented scale for temperature', () => {
        const desc = getColorScaleDescriptor('t2m');
        expect(desc.kind).toBe('segmented');
        if (desc.kind === 'segmented') {
            const values = desc.segments.map((s) => s[0]);
            expect(Math.min(...values)).toBe(240);
            expect(Math.max(...values)).toBe(320);
        }
    });
});

describe('buildGradientFromDescriptor', () => {
    it('maps surface pressure values to distinct colors (real structure)', () => {
        const gradient = buildGradientFromDescriptor(getColorScaleDescriptor('sp'));
        // Two realistic but different pressures should map to different colors,
        // proving the field is no longer a single featureless block.
        const low = gradient(98000, 255);
        const high = gradient(102000, 255);
        expect(low.slice(0, 3)).not.toEqual(high.slice(0, 3));
    });

    it('clamps and colors temperature in Kelvin', () => {
        const gradient = buildGradientFromDescriptor(getColorScaleDescriptor('t2m'));
        const cold = gradient(245, 255);
        const warm = gradient(305, 255);
        expect(cold.slice(0, 3)).not.toEqual(warm.slice(0, 3));
        // Alpha is passed through unchanged.
        expect(cold[3]).toBe(255);
    });
});
