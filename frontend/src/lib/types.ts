/**
 * 描述一个数据层（基础层或叠加层）
 */
export interface DataLayer {
    id: string;
    name: string;
    description: string;
    source: string;
    unit: string;
    mode: PhysicalMode[] | 'all'; // The physical modes this layer is available in
    role: 'base' | 'overlay';     // Whether this layer is a base or overlay
    levels?: { label: string, value: number }[]; // Optional vertical levels
}

/**
 * 描述数据探针 (Probe) 的状态
 */
export interface Probe {
    visible: boolean;
    lat: number;
    lon: number;
    dataValue: string | null;
    x: number;
    y: number;
}

/**
 * 数据集的物理模式 (由后端根据数据维度自动检测)
 */
export type PhysicalMode = 'atm' | 'ocn' | 'sfc';

/**
 * 用户可选择的数据维度
 */
export type Dimensionality = '2D' | '3D';

/**
 * 用户可选择的地图投影方式
 */
export type Projection = 'orthographic' | 'mercator' | 'equirectangular';

// =================================================================
// Metadata-driven Types (从 metadata-ui.js 迁移而来)
// =================================================================

/**
 * NetCDF metadata structure from Rossby server
 */
export interface NetCDFMetadata {
    variables: Record<string, VariableMetadata>;
    coordinates: Record<string, any[]>;
    dimensions: Record<string, DimensionInfo>;
    global_attributes?: Record<string, any>;
    shape?: number[];
}

/**
 * Variable metadata from NetCDF
 */
export interface VariableMetadata {
    dimensions: string[];
    dtype: string;
    units?: string;
    long_name?: string;
    standard_name?: string;
    shape: number[];
}

/**
 * Dimension information
 */
export interface DimensionInfo {
    size: number;
    unlimited?: boolean;
}

/**
 * Detected wind/ocean vector pairs
 */
export interface VectorPair {
    u: string;
    v: string;
    level?: string;
}

/**
 * Mode detection result
 */
export interface ModeDetectionResult {
    mode: PhysicalMode;
    primaryVectorPair?: VectorPair;
    allWindPairs?: VectorPair[];
    allOceanPairs?: VectorPair[];
    availableVariables: string[];
}

/**
 * Variable categorization result
 */
export interface CategorizedVariables {
    atmospheric: string[];
    oceanic: string[];
    surface: string[];
    excluded: string[];
    vectorComponents: string[];
}

/**
 * 3D dimension analysis result
 */
export interface DimensionAnalysis {
    is3D: boolean;
    availableLevels: string[];
    levelDimension: string | null;
    variablesWith3D: string[];
    levelType: 'pressure_hpa' | 'pressure_pa' | 'height_meters' | 'model_levels' | 'unknown';
}

/**
 * Time navigation information
 */
export interface TimeNavigationInfo {
    all: any[];
    start: any;
    end: any;
    current: any;
    currentIndex: number;
    count: number;
}

/**
 * Metadata-driven data layer (extends base DataLayer)
 */
export interface MetadataDataLayer extends Omit<DataLayer, 'mode'> {
    variable: string;
    metadata: VariableMetadata;
    category: 'atmospheric' | 'oceanic' | 'surface';
    isVector: boolean;
    vectorPair?: VectorPair;
}

/**
 * UI state for metadata-driven interface
 */
export interface MetadataUIState {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    metadata: NetCDFMetadata | null;
    modeInfo: ModeDetectionResult | null;
    categorizedVariables: CategorizedVariables | null;
    dimensionAnalysis: DimensionAnalysis | null;
    timeNavigation: TimeNavigationInfo | null;
    availableLayers: MetadataDataLayer[];
    selectedLevel: string | null;
}

/**
 * Configuration for data requests to Rossby server
 */
export interface DataRequestConfig {
    variables: string[];
    time?: any;
    level?: string;
    format: 'json' | 'netcdf';
}

/**
 * Response from Rossby server data endpoint
 */
export interface DataResponse {
    data: Record<string, number[]>;
    metadata: NetCDFMetadata;
    error?: string;
}
