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
        { u: /^u$/, v: /^v$/ },                  // Pressure-level wind
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

type LayerCategory = 'atmospheric' | 'oceanic' | 'surface';
type LayerRole = 'base' | 'overlay';

interface Era5LayerRule {
    name: string;
    desc: string;
    category: LayerCategory;
    role: LayerRole;
}

const ERA5_LAYER_RULES: Record<string, Era5LayerRule> = {
    t2m: { name: '2m Temperature', desc: '2 metre temperature', category: 'atmospheric', role: 'base' },
    d2m: { name: '2m Dewpoint Temperature', desc: '2 metre dewpoint temperature', category: 'atmospheric', role: 'base' },
    sst: { name: 'Sea Surface Temperature', desc: 'Sea surface temperature', category: 'oceanic', role: 'base' },
    q: { name: 'Specific Humidity', desc: 'Specific humidity', category: 'atmospheric', role: 'base' },
    r: { name: 'Relative Humidity', desc: 'Relative humidity', category: 'atmospheric', role: 'base' },
    tcwv: { name: 'Total Column Water Vapour', desc: 'Total column vertically-integrated water vapour', category: 'atmospheric', role: 'base' },
    sp: { name: 'Surface Pressure', desc: 'Surface air pressure', category: 'atmospheric', role: 'base' },
    msl: { name: 'Mean Sea Level Pressure', desc: 'Mean sea level pressure', category: 'atmospheric', role: 'overlay' },
    tcc: { name: 'Total Cloud Cover', desc: 'Total cloud cover', category: 'atmospheric', role: 'base' },
    hcc: { name: 'High Cloud Cover', desc: 'High cloud cover', category: 'atmospheric', role: 'base' },
    mcc: { name: 'Medium Cloud Cover', desc: 'Medium cloud cover', category: 'atmospheric', role: 'base' },
    lcc: { name: 'Low Cloud Cover', desc: 'Low cloud cover', category: 'atmospheric', role: 'base' },
    siconc: { name: 'Sea Ice Concentration', desc: 'Sea ice area fraction', category: 'oceanic', role: 'base' },
    sd: { name: 'Snow Depth', desc: 'Snow depth water equivalent', category: 'surface', role: 'base' },
    tp: { name: 'Total Precipitation', desc: 'Total precipitation', category: 'surface', role: 'base' },
    cp: { name: 'Convective Precipitation', desc: 'Convective precipitation', category: 'surface', role: 'base' },
    lsp: { name: 'Large-Scale Precipitation', desc: 'Large-scale precipitation', category: 'surface', role: 'base' },
    sro: { name: 'Surface Runoff', desc: 'Surface runoff', category: 'surface', role: 'base' },
    ssro: { name: 'Sub-Surface Runoff', desc: 'Sub-surface runoff', category: 'surface', role: 'base' },
    swvl1: { name: 'Soil Water Layer 1', desc: 'Volumetric soil water layer 1', category: 'surface', role: 'base' },
    swvl2: { name: 'Soil Water Layer 2', desc: 'Volumetric soil water layer 2', category: 'surface', role: 'base' },
    swvl3: { name: 'Soil Water Layer 3', desc: 'Volumetric soil water layer 3', category: 'surface', role: 'base' },
    swvl4: { name: 'Soil Water Layer 4', desc: 'Volumetric soil water layer 4', category: 'surface', role: 'base' },
    pev: { name: 'Potential Evaporation', desc: 'Potential evaporation', category: 'surface', role: 'base' },
    swh: { name: 'Significant Wave Height', desc: 'Significant height of combined wind waves and swell', category: 'oceanic', role: 'base' },
    tisr: { name: 'TOA Solar Radiation', desc: 'TOA incident solar radiation', category: 'atmospheric', role: 'base' },
    ssrd: { name: 'Surface Solar Radiation Downwards', desc: 'Surface short-wave solar radiation downwards', category: 'surface', role: 'base' },
    fdir: { name: 'Direct Solar Radiation', desc: 'Total sky direct solar radiation at surface', category: 'surface', role: 'base' },
    ttr: { name: 'Top Thermal Radiation', desc: 'Top net long-wave thermal radiation', category: 'atmospheric', role: 'base' },
    z: { name: 'Geopotential Height', desc: 'Geopotential height', category: 'atmospheric', role: 'overlay' },
    blh: { name: 'Boundary Layer Height', desc: 'Boundary layer height', category: 'atmospheric', role: 'overlay' },
    cbh: { name: 'Cloud Base Height', desc: 'Cloud base height', category: 'atmospheric', role: 'overlay' },
    i10fg: { name: '10m Wind Gust', desc: 'Instantaneous 10 metre wind gust', category: 'atmospheric', role: 'overlay' }
};

const COORDINATE_VARIABLES = new Set(['latitude', 'longitude', 'lat', 'lon', 'time', 'level', 'plev', 'height']);

function variableAttributes(varMeta: VariableMetadata | undefined): Record<string, any> {
    return ((varMeta as any)?.attributes ?? {}) as Record<string, any>;
}

function variableUnits(varMeta: VariableMetadata | undefined): string {
    return varMeta?.units ?? variableAttributes(varMeta).units ?? '';
}

function variableLongName(varName: string, varMeta: VariableMetadata | undefined): string {
    return varMeta?.long_name ?? variableAttributes(varMeta).long_name ?? varName;
}

function fallbackCategory(varName: string, longName: string): LayerCategory {
    const text = `${varName} ${longName}`.toLowerCase();
    if (text.includes('sea') || text.includes('ocean') || text.includes('wave') || text.includes('ice')) {
        return 'oceanic';
    }
    if (
        text.includes('snow') ||
        text.includes('soil') ||
        text.includes('runoff') ||
        text.includes('precip') ||
        text.includes('evaporation') ||
        text.includes('surface')
    ) {
        return 'surface';
    }
    return 'atmospheric';
}

function fallbackRole(varName: string, longName: string): LayerRole {
    const text = `${varName} ${longName}`.toLowerCase();
    if (
        text.includes('wind') ||
        text.includes('gust') ||
        text.includes('geopotential') ||
        text.includes('height') ||
        text.includes('pressure')
    ) {
        return 'overlay';
    }
    return 'base';
}

export function generateMetadataLayers(
    metadata: NetCDFMetadata,
    categorizedVars: CategorizedVariables,
    mode: PhysicalMode
): MetadataDataLayer[] {
    void categorizedVars;
    void mode;

    const layers: MetadataDataLayer[] = [];
    const variables = metadata.variables || {};
    const globalSource = metadata.global_attributes?.source || 'ERA5/ECMWF';
    const addedVariables = new Set<string>();

    // Helper function to create a layer from a variable
    const createLayer = (
        varName: string,
        displayName: string,
        description: string,
        category: LayerCategory,
        role: LayerRole,
        isVector: boolean = false,
        vectorPair?: VectorPair
    ): MetadataDataLayer => {
        const varMeta = variables[varName];
        const units = variableUnits(varMeta);

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
            isVector,
            vectorPair
        };
    };

    const addLayer = (
        varName: string,
        rule: Era5LayerRule,
        isVector: boolean = false,
        vectorPair?: VectorPair
    ): void => {
        if (!variables[varName] || addedVariables.has(varName)) {
            return;
        }
        layers.push(createLayer(varName, rule.name, rule.desc, rule.category, rule.role, isVector, vectorPair));
        addedVariables.add(varName);
    };

    const variableNames = Object.keys(variables);
    const vectorPairs = [...detectWindPairs(variableNames), ...detectOceanPairs(variableNames)];
    const vectorComponents = new Set(vectorPairs.flatMap((pair) => [pair.u, pair.v]));

    Object.entries(ERA5_LAYER_RULES)
        .filter(([, rule]) => rule.role === 'base')
        .forEach(([varName, rule]) => addLayer(varName, rule));

    vectorPairs.forEach((pair) => {
        const levelLabel = pair.level ? `${pair.level}m` : '';
        const isOcean = pair.u.startsWith('uo') || pair.u.includes('current') || pair.u === 'ust';
        const rule: Era5LayerRule = {
            name: isOcean ? 'Ocean Current' : `Wind ${levelLabel}`.trim(),
            desc: `${pair.u}/${pair.v} vector components`,
            category: isOcean ? 'oceanic' : 'atmospheric',
            role: 'overlay'
        };
        addLayer(pair.u, rule, true, pair);
    });

    Object.entries(ERA5_LAYER_RULES)
        .filter(([, rule]) => rule.role === 'overlay')
        .forEach(([varName, rule]) => addLayer(varName, rule));

    variableNames.forEach(varName => {
        if (COORDINATE_VARIABLES.has(varName.toLowerCase())) {
            return;
        }
        if (addedVariables.has(varName) || vectorComponents.has(varName)) {
            return;
        }

        const varMeta = variables[varName];
        const longName = variableLongName(varName, varMeta);
        const rule: Era5LayerRule = {
            name: longName,
            desc: `${longName} from NetCDF data`,
            category: fallbackCategory(varName, longName),
            role: fallbackRole(varName, longName)
        };
        addLayer(varName, rule);
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

    /**
     * Switch the active physical mode (atmosphere / ocean / surface) and
     * recompute the variable categorization and available data layers for the
     * new mode. No-op until metadata has been loaded.
     *
     * @param mode The physical mode to activate.
     */
    setMode(mode: PhysicalMode): void {
        metadataState.update(state => {
            if (!state.metadata || !state.modeInfo) {
                return state;
            }

            const newModeInfo: ModeDetectionResult = { ...state.modeInfo, mode };
            const categorizedVariables = categorizeVariables(
                state.metadata.variables,
                mode,
                newModeInfo
            );
            const availableLayers = generateMetadataLayers(
                state.metadata,
                categorizedVariables,
                mode
            );

            return {
                ...state,
                modeInfo: newModeInfo,
                categorizedVariables,
                availableLayers
            };
        });

        console.log('MetadataService: Mode set to', mode);
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
