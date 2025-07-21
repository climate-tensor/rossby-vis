/**
 * Metadata-driven service for Rossby frontend
 * Re-implements functionality from public/libs/earth/1.0.0/metadata-ui.js
 * Adapted for Svelte stores and TypeScript
 */

import { writable, derived, get } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import type {
    NetCDFMetadata,
    VariableMetadata,
    VectorPair,
    ModeDetectionResult,
    CategorizedVariables,
    DimensionAnalysis,
    TimeNavigationInfo,
    MetadataDataLayer,
    MetadataUIState,
    DataRequestConfig,
    DataResponse,
    PhysicalMode
} from './types';

// =================================================================
// Core State Store
// =================================================================

export const metadataState: Writable<MetadataUIState> = writable({
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
});

// =================================================================
// Mode Detection Functions (from metadata-ui.js)
// =================================================================

function detectWindPairs(variables: string[]): VectorPair[] {
    const pairs: VectorPair[] = [];
    const windPatterns = [
        { u: /^u(\d+)$/, v: /^v(\d+)$/ },        // u10/v10, u100/v100
        { u: /^u(\d+)hPa$/, v: /^v(\d+)hPa$/ },  // u850hPa/v850hPa
        { u: /^uas$/, v: /^vas$/ },              // Surface wind (CMIP naming)
        { u: /^ua$/, v: /^va$/ },                // Generic atmospheric wind
        { u: /^u_wind$/, v: /^v_wind$/ }         // Alternative naming
    ];

    windPatterns.forEach(pattern => {
        variables.forEach(uVar => {
            if (pattern.u.test(uVar)) {
                const vVar = uVar.replace(/^u/, 'v');
                
                if (variables.indexOf(vVar) !== -1) {
                    const match = uVar.match(pattern.u);
                    const level = match && match[1] ? match[1] : '';
                    
                    if (!pairs.some(p => p.u === uVar && p.v === vVar)) {
                        pairs.push({ u: uVar, v: vVar, level });
                    }
                }
            }
        });
    });

    return pairs;
}

function detectOceanPairs(variables: string[]): VectorPair[] {
    const pairs: VectorPair[] = [];
    const oceanPatterns = [
        { u: /^ust$/, v: /^vst$/ },              // Ocean surface currents
        { u: /^u_current$/, v: /^v_current$/ },  // Generic current naming
        { u: /^uo$/, v: /^vo$/ }                 // CMIP ocean velocity naming
    ];

    oceanPatterns.forEach(pattern => {
        const uVars = variables.filter(v => pattern.u.test(v));
        
        uVars.forEach(uVar => {
            const correspondingV = uVar.replace(/^u/, 'v');
            
            if (variables.indexOf(correspondingV) !== -1) {
                if (!pairs.some(p => p.u === uVar && p.v === correspondingV)) {
                    pairs.push({ u: uVar, v: correspondingV });
                }
            }
        });
    });

    return pairs;
}

function isWindComponent(varName: string, windPairs: VectorPair[]): boolean {
    return windPairs.some(pair => pair.u === varName || pair.v === varName);
}

function isOceanComponent(varName: string, oceanPairs: VectorPair[]): boolean {
    return oceanPairs.some(pair => pair.u === varName || pair.v === varName);
}

export function detectMode(metadata: NetCDFMetadata): ModeDetectionResult {
    const variables = Object.keys(metadata.variables || {});

    // Wind mode detection - look for u/v component pairs
    const windPairs = detectWindPairs(variables);
    if (windPairs.length > 0) {
        return {
            mode: 'atm',
            primaryVectorPair: windPairs[0],
            allWindPairs: windPairs,
            availableVariables: variables.filter(v => !isWindComponent(v, windPairs))
        };
    }

    // Ocean mode detection - look for ust/vst pairs
    const oceanPairs = detectOceanPairs(variables);
    if (oceanPairs.length > 0) {
        return {
            mode: 'ocn',
            primaryVectorPair: oceanPairs[0],
            allOceanPairs: oceanPairs,
            availableVariables: variables.filter(v => !isOceanComponent(v, oceanPairs))
        };
    }

    // Surface mode - no vector pairs detected
    return {
        mode: 'sfc',
        availableVariables: variables
    };
}

// =================================================================
// Variable Categorization Functions
// =================================================================

export function categorizeVariables(
    variables: Record<string, VariableMetadata>, 
    mode: PhysicalMode, 
    modeInfo: ModeDetectionResult
): CategorizedVariables {
    const categorized: CategorizedVariables = {
        atmospheric: [],
        oceanic: [],
        surface: [],
        excluded: [],
        vectorComponents: []
    };

    // Pattern-based categorization
    const patterns = {
        atmospheric: /^(t2m|temp|temperature|d2m|dewpoint|humidity|rh|relative.*humidity|sp|surface.*pressure|msl|mean.*sea.*level|tisr|radiation|solar|tcw|total.*cloud.*water|cloud)$/i,
        oceanic: /^(sst|sea.*surface.*temp|salinity|sal|ssh|sea.*surface.*height|mld|mixed.*layer.*depth)$/i,
        surface: /^(sd|snow.*depth|tp|total.*precip|precipitation|rain|sf|surface.*flux|lhf|latent.*heat|shf|sensible.*heat)$/i
    };

    Object.keys(variables).forEach(varName => {
        // Skip coordinate variables
        if (['latitude', 'longitude', 'time', 'level', 'plev', 'height'].includes(varName.toLowerCase())) {
            categorized.excluded.push(varName);
            return;
        }

        // Filter out vector components based on mode
        if (mode === 'atm' && modeInfo.allWindPairs && isWindComponent(varName, modeInfo.allWindPairs)) {
            categorized.vectorComponents.push(varName);
            return;
        }
        if (mode === 'ocn' && modeInfo.allOceanPairs && isOceanComponent(varName, modeInfo.allOceanPairs)) {
            categorized.vectorComponents.push(varName);
            return;
        }

        // Categorize remaining variables
        if (patterns.atmospheric.test(varName)) {
            categorized.atmospheric.push(varName);
        } else if (patterns.oceanic.test(varName)) {
            categorized.oceanic.push(varName);
        } else if (patterns.surface.test(varName)) {
            categorized.surface.push(varName);
        } else {
            // Default to atmospheric for unknown variables
            categorized.atmospheric.push(varName);
        }
    });

    return categorized;
}

// =================================================================
// Dimension Analysis Functions
// =================================================================

export function analyzeDimensions(metadata: NetCDFMetadata): DimensionAnalysis {
    const variables = metadata.variables || {};
    const analysis: DimensionAnalysis = {
        is3D: false,
        availableLevels: [],
        levelDimension: null,
        variablesWith3D: [],
        levelType: 'unknown'
    };

    // Check each variable for dimensional structure
    Object.entries(variables).forEach(([varName, varInfo]) => {
        const dimensions = varInfo.dimensions || [];

        // Look for level/height dimensions
        const levelDims = dimensions.filter(dim => {
            const dimLower = dim.toLowerCase();
            return ['level', 'plev', 'height', 'isobaric', 'lev', 'z'].includes(dimLower);
        });

        if (levelDims.length > 0) {
            analysis.is3D = true;
            analysis.levelDimension = levelDims[0];
            analysis.variablesWith3D.push(varName);
        }
    });

    // Extract available levels from coordinates
    if (analysis.is3D && analysis.levelDimension) {
        const levelCoords = metadata.coordinates?.[analysis.levelDimension];
        if (levelCoords && Array.isArray(levelCoords)) {
            analysis.availableLevels = levelCoords.map(level => level.toString());
            analysis.levelType = determineLevelType(levelCoords);
        }
    }

    return analysis;
}

function determineLevelType(levelCoords: any[]): DimensionAnalysis['levelType'] {
    if (!levelCoords || levelCoords.length === 0) return 'unknown';

    const numericLevels = levelCoords.map(l => Number(l)).filter(n => !isNaN(n));
    if (numericLevels.length === 0) return 'unknown';

    const minLevel = Math.min(...numericLevels);
    const maxLevel = Math.max(...numericLevels);

    // Pressure levels - check for typical pressure ranges
    if ((minLevel >= 100 && maxLevel <= 101325) || (minLevel >= 1 && maxLevel <= 1013)) {
        return minLevel > 1000 ? 'pressure_pa' : 'pressure_hpa';
    }

    // Large pressure values in Pa
    if (minLevel > 10000 && maxLevel > 10000) {
        return 'pressure_pa';
    }

    // Height levels (meters)
    if (minLevel >= 0 && maxLevel < 50000 && minLevel < maxLevel) {
        return 'height_meters';
    }

    // Model levels (dimensionless)
    if (minLevel >= 0 && maxLevel <= 1) {
        return 'model_levels';
    }

    // Default to pressure if values are in typical atmospheric pressure range
    if (minLevel > 50 && maxLevel > 50) {
        return minLevel > 1500 ? 'pressure_pa' : 'pressure_hpa';
    }

    return 'unknown';
}

// =================================================================
// Time Navigation Functions
// =================================================================

export function setupTimeNavigation(metadata: NetCDFMetadata): TimeNavigationInfo | null {
    const timeCoords = metadata.coordinates?.time;
    
    if (!timeCoords || !Array.isArray(timeCoords) || timeCoords.length === 0) {
        console.warn('MetadataService: No time coordinates found in metadata');
        return null;
    }

    return {
        all: timeCoords,
        start: timeCoords[0],
        end: timeCoords[timeCoords.length - 1],
        current: timeCoords[0],
        currentIndex: 0,
        count: timeCoords.length
    };
}

// =================================================================
// Data Layer Generation Functions
// =================================================================

export function generateMetadataLayers(
    metadata: NetCDFMetadata,
    categorizedVars: CategorizedVariables,
    mode: PhysicalMode
): MetadataDataLayer[] {
    const layers: MetadataDataLayer[] = [];
    const variables = metadata.variables || {};
    const globalSource = metadata.global_attributes?.source || 'ERA5/ECMWF';

    // Helper function to create a layer from a variable
    const createLayer = (
        varName: string,
        displayName: string,
        description: string,
        category: 'atmospheric' | 'oceanic' | 'surface',
        role: 'base' | 'overlay',
        isVector: boolean = false
    ): MetadataDataLayer => {
        const varMeta = variables[varName];
        const units = varMeta?.units || '';

        return {
            id: varName,
            variable: varName,
            name: displayName,
            description: description,
            source: globalSource,
            unit: units,
            role,
            category,
            metadata: varMeta,
            isVector
        };
    };

    // Define specific base layers as requested: 'sd', 'sp', 'd2m', 't2m', 'tisr'
    const baseLayers = [
        { var: 'sd', name: 'Snow Depth', desc: 'Snow depth water equivalent', category: 'surface' as const },
        { var: 'sp', name: 'Surface Pressure', desc: 'Surface air pressure', category: 'atmospheric' as const },
        { var: 'd2m', name: '2m Dewpoint Temperature', desc: '2 metre dewpoint temperature', category: 'atmospheric' as const },
        { var: 't2m', name: '2m Temperature', desc: '2 metre temperature', category: 'atmospheric' as const },
        { var: 'tisr', name: 'Solar Radiation', desc: 'TOA incident solar radiation', category: 'atmospheric' as const }
    ];

    // Add base layers if they exist in the metadata
    baseLayers.forEach(layer => {
        if (variables[layer.var]) {
            layers.push(createLayer(layer.var, layer.name, layer.desc, layer.category, 'base'));
        }
    });

    // Define overlay layers: Wind components and other available variables
    // First, add Wind overlay for 10m wind if u10/v10 exist
    if (variables['u10'] && variables['v10']) {
        layers.push(createLayer('u10', 'Wind 10m', '10 metre wind components', 'atmospheric', 'overlay', true));
    }

    // Add Wind overlay for 100m wind if u100/v100 exist
    if (variables['u100'] && variables['v100']) {
        layers.push(createLayer('u100', 'Wind 100m', '100 metre wind components', 'atmospheric', 'overlay', true));
    }

    // Add SST if available
    if (variables['sst']) {
        layers.push(createLayer('sst', 'Sea Surface Temperature', 'Sea surface temperature', 'oceanic', 'overlay'));
    }

    // Add any other non-coordinate, non-wind-component variables as overlays
    Object.keys(variables).forEach(varName => {
        // Skip coordinate variables
        if (['latitude', 'longitude', 'time', 'level', 'plev', 'height'].includes(varName.toLowerCase())) {
            return;
        }

        // Skip if already added as base or overlay
        if (layers.some(layer => layer.variable === varName)) {
            return;
        }

        // Skip wind components (we handle them as vector pairs above)
        if (['u10', 'v10', 'u100', 'v100'].includes(varName)) {
            return;
        }

        // Add remaining variables as overlays
        const varMeta = variables[varName];
        const longName = varMeta?.long_name || varName;
        let category: 'atmospheric' | 'oceanic' | 'surface' = 'atmospheric';
        
        // Simple categorization for remaining variables
        if (varName.includes('sst') || varName.includes('ocean')) {
            category = 'oceanic';
        } else if (varName.includes('precip') || varName.includes('snow') || varName.includes('surface')) {
            category = 'surface';
        }

        layers.push(createLayer(varName, longName, `${longName} from NetCDF data`, category, 'overlay'));
    });

    return layers;
}

// =================================================================
// Main Metadata Service API
// =================================================================

export class MetadataService {
    async loadMetadata(): Promise<void> {
        metadataState.update(state => ({ ...state, loading: true, error: null }));

        try {
            const response = await fetch('/proxy/metadata');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const metadata: NetCDFMetadata = await response.json();

            // Process metadata
            const modeInfo = detectMode(metadata);
            const categorizedVariables = categorizeVariables(metadata.variables, modeInfo.mode, modeInfo);
            const dimensionAnalysis = analyzeDimensions(metadata);
            const timeNavigation = setupTimeNavigation(metadata);
            const availableLayers = generateMetadataLayers(metadata, categorizedVariables, modeInfo.mode);

            // Update state
            metadataState.update(state => ({
                ...state,
                loaded: true,
                loading: false,
                error: null,
                metadata,
                modeInfo,
                categorizedVariables,
                dimensionAnalysis,
                timeNavigation,
                availableLayers
            }));

            console.log('MetadataService: Successfully loaded metadata:', {
                mode: modeInfo.mode,
                variables: Object.keys(metadata.variables).length,
                is3D: dimensionAnalysis.is3D,
                timePoints: timeNavigation?.count || 0
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('MetadataService: Failed to load metadata:', error);
            
            metadataState.update(state => ({
                ...state,
                loading: false,
                error: errorMessage
            }));
            
            throw error;
        }
    }

    getCurrentTime(): string | null {
        const state = get(metadataState);
        if (state.timeNavigation) {
            return state.timeNavigation.current.toString();
        }
        return null;
    }

    async loadData(config: DataRequestConfig): Promise<DataResponse> {
        const { variables, time, level, format = 'json' } = config;
        
        let url = `/proxy/data?vars=${variables.join(',')}&format=${format}`;
        if (time !== undefined) url += `&time=${time}`;
        if (level) url += `&level=${level}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    navigateTime(step: number): void {
        metadataState.update(state => {
            if (!state.timeNavigation) return state;

            const newIndex = Math.max(
                0,
                Math.min(state.timeNavigation.all.length - 1, state.timeNavigation.currentIndex + step)
            );

            if (newIndex !== state.timeNavigation.currentIndex) {
                const newTimeNavigation = {
                    ...state.timeNavigation,
                    currentIndex: newIndex,
                    current: state.timeNavigation.all[newIndex]
                };

                console.log('MetadataService: Navigated to time', newTimeNavigation.current, '(index', newIndex, ')');

                return {
                    ...state,
                    timeNavigation: newTimeNavigation
                };
            }

            return state;
        });
    }

    selectLevel(level: string): void {
        metadataState.update(state => ({
            ...state,
            selectedLevel: level
        }));
        
        console.log('MetadataService: Selected level:', level);
    }
}

// =================================================================
// Singleton Instance & Derived Stores
// =================================================================

export const metadataService = new MetadataService();

// Derived stores for easy access to specific parts of the state
export const metadata: Readable<NetCDFMetadata | null> = derived(
    metadataState,
    $state => $state.metadata
);

export const currentMode: Readable<PhysicalMode | null> = derived(
    metadataState,
    $state => $state.modeInfo?.mode || null
);

export const availableMetadataLayers: Readable<MetadataDataLayer[]> = derived(
    metadataState,
    $state => $state.availableLayers
);

export const timeNavigation: Readable<TimeNavigationInfo | null> = derived(
    metadataState,
    $state => $state.timeNavigation
);

export const selectedLevel: Readable<string | null> = derived(
    metadataState,
    $state => $state.selectedLevel
);

export const dimensionAnalysis: Readable<DimensionAnalysis | null> = derived(
    metadataState,
    $state => $state.dimensionAnalysis
);

export const isMetadataLoading: Readable<boolean> = derived(
    metadataState,
    $state => $state.loading
);

export const metadataError: Readable<string | null> = derived(
    metadataState,
    $state => $state.error
);

export const availableModes: Readable<PhysicalMode[]> = derived(
    metadataState,
    $state => {
        if (!$state.modeInfo) return ['sfc'] as PhysicalMode[]; // Default to surface mode only
        
        const modes: PhysicalMode[] = ['sfc' as PhysicalMode]; // Surface mode is always available
        
        // Atmosphere mode is available if wind pairs were detected
        if ($state.modeInfo.allWindPairs && $state.modeInfo.allWindPairs.length > 0) {
            modes.push('atm' as PhysicalMode);
        }
        
        // Ocean mode is available if ocean pairs were detected  
        if ($state.modeInfo.allOceanPairs && $state.modeInfo.allOceanPairs.length > 0) {
            modes.push('ocn' as PhysicalMode);
        }
        
        return modes;
    }
);
