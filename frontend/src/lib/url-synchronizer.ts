/**
 * @fileoverview
 * URL Synchronization Module - implementing the Configuration model from micro.js
 * 
 * This module provides bidirectional synchronization between Svelte stores and 
 * the browser's URL hash, ensuring that application state is shareable and 
 * bookmarkable while maintaining browser navigation functionality.
 */

import type { Writable } from 'svelte/store';
import type { PhysicalMode, Projection } from './types';

/**
 * Application state that can be serialized to/from URL hash
 */
export interface UrlState {
    dsrc?: string;       // Data source identifier  
    base?: string;       // Base layer variable
    ov?: string;         // Overlay layer variable (null becomes 'none')
    ts?: string;         // ISO 8601 timestamp
    lvl?: string;        // Height/depth level  
    lon?: number;        // Viewport longitude center
    lat?: number;        // Viewport latitude center
    zm?: number;         // Zoom level
    proj?: Projection;   // Map projection
    cmap?: string;       // Colormap scheme
    mode?: PhysicalMode; // Physical mode (auto-detected but can be overridden)
}

/**
 * Default values for URL parameters
 */
const DEFAULT_STATE: Required<UrlState> = {
    dsrc: 'era5-pl',
    base: 't2m', 
    ov: 'wnd10m',
    ts: new Date().toISOString(),
    lvl: '500',
    lon: 0,
    lat: 0, 
    zm: 1,
    proj: 'orthographic',
    cmap: 'viridis',
    mode: 'sfc'
};

/**
 * Parse URL hash into application state object
 * Reproduces the `parse` logic from micro.js Configuration
 */
export function parseUrlHash(): UrlState {
    const hash = window.location.hash;
    
    // Remove the '#' prefix if present
    const searchParams = hash.startsWith('#') ? hash.slice(1) : hash;
    
    // Handle both '#key=value&key2=value2' and '#/view?key=value&key2=value2' formats
    const queryStart = searchParams.includes('?') ? searchParams.indexOf('?') + 1 : 0;
    const queryString = searchParams.slice(queryStart);
    
    if (!queryString) {
        return {};
    }
    
    const params = new URLSearchParams(queryString);
    const state: UrlState = {};
    
    // Parse each parameter with type conversion
    if (params.has('dsrc')) state.dsrc = params.get('dsrc')!;
    if (params.has('base')) state.base = params.get('base')!;
    if (params.has('ov')) {
        const ov = params.get('ov')!;
        state.ov = ov === 'none' ? undefined : ov;
    }
    if (params.has('ts')) state.ts = params.get('ts')!;
    if (params.has('lvl')) state.lvl = params.get('lvl')!;
    if (params.has('lon')) state.lon = parseFloat(params.get('lon')!);
    if (params.has('lat')) state.lat = parseFloat(params.get('lat')!);
    if (params.has('zm')) state.zm = parseFloat(params.get('zm')!);
    if (params.has('proj')) state.proj = params.get('proj')! as Projection;
    if (params.has('cmap')) state.cmap = params.get('cmap')!;
    if (params.has('mode')) state.mode = params.get('mode')! as PhysicalMode;
    
    return state;
}

/**
 * Convert application state to URL hash string
 * Reproduces the `toHash` logic from micro.js Configuration
 */
export function stateToUrlHash(state: UrlState): string {
    const params = new URLSearchParams();
    
    // Only include non-default values to keep URLs clean
    if (state.dsrc && state.dsrc !== DEFAULT_STATE.dsrc) {
        params.set('dsrc', state.dsrc);
    }
    if (state.base && state.base !== DEFAULT_STATE.base) {
        params.set('base', state.base);
    }
    if (state.ov !== undefined) {
        params.set('ov', state.ov || 'none');
    }
    if (state.ts && state.ts !== DEFAULT_STATE.ts) {
        params.set('ts', state.ts);
    }
    if (state.lvl && state.lvl !== DEFAULT_STATE.lvl) {
        params.set('lvl', state.lvl);
    }
    if (state.lon !== undefined && state.lon !== DEFAULT_STATE.lon) {
        params.set('lon', state.lon.toString());
    }
    if (state.lat !== undefined && state.lat !== DEFAULT_STATE.lat) {
        params.set('lat', state.lat.toString());
    }
    if (state.zm !== undefined && state.zm !== DEFAULT_STATE.zm) {
        params.set('zm', state.zm.toString());
    }
    if (state.proj && state.proj !== DEFAULT_STATE.proj) {
        params.set('proj', state.proj);
    }
    if (state.cmap && state.cmap !== DEFAULT_STATE.cmap) {
        params.set('cmap', state.cmap);
    }
    if (state.mode && state.mode !== DEFAULT_STATE.mode) {
        params.set('mode', state.mode);
    }
    
    const queryString = params.toString();
    return queryString ? `#/view?${queryString}` : '#';
}

/**
 * Initialize URL synchronization for application stores
 * This establishes the bidirectional binding between stores and URL
 */
export function initializeUrlSync(stores: {
    projection: Writable<Projection>;
    activeBaseLayerId: Writable<string>;
    activeOverlayLayerId: Writable<string | null>;
    // We'll add more stores as needed
}) {
    let isUpdatingFromUrl = false;
    
    /**
     * Update stores from current URL hash
     */
    function updateStoresFromUrl() {
        if (isUpdatingFromUrl) return;
        
        isUpdatingFromUrl = true;
        const state = parseUrlHash();
        
        // Update stores with parsed values, falling back to defaults
        if (state.proj) stores.projection.set(state.proj);
        if (state.base) stores.activeBaseLayerId.set(state.base);
        if (state.ov !== undefined) stores.activeOverlayLayerId.set(state.ov || null);
        
        isUpdatingFromUrl = false;
    }
    
    /**
     * Update URL hash from current store values
     */
    function updateUrlFromStores() {
        if (isUpdatingFromUrl) return;
        
        // We'll implement this when we have store subscriptions set up
        // For now, this is a placeholder
    }
    
    // Listen for browser navigation events (back/forward buttons)
    window.addEventListener('hashchange', updateStoresFromUrl);
    
    // Initialize stores from current URL on first load
    updateStoresFromUrl();
    
    // Return cleanup function
    return () => {
        window.removeEventListener('hashchange', updateStoresFromUrl);
    };
}

/**
 * Update URL hash with new state (used by store subscribers)
 */
export function updateUrlHash(newState: Partial<UrlState>) {
    const currentState = parseUrlHash();
    const mergedState = { ...currentState, ...newState };
    const newHash = stateToUrlHash(mergedState);
    
    // Use pushState to update URL without triggering hashchange event
    if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash || '#');
    }
}
