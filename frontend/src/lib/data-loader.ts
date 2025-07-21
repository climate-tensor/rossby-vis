/**
 * Data loader for fetching and processing wind and scalar data from the Rossby proxy
 */

import type { MetadataService } from './metadata-service';

export interface GridData {
    header: {
        nx: number;
        ny: number;
        lo1: number;
        la1: number;
        lo2: number;
        la2: number;
        dx: number;
        dy: number;
    };
    data: number[];
    interpolate: (lon: number, lat: number) => number | number[] | null;
}

export interface WindData {
    u: number[][];
    v: number[][];
    bounds: { north: number; south: number; east: number; west: number };
    width: number;
    height: number;
}

export class DataLoader {
    private metadataService: MetadataService;
    private cachedGrids: Map<string, GridData> = new Map();

    constructor(metadataService: MetadataService) {
        this.metadataService = metadataService;
    }

    async loadWindData(time?: string): Promise<WindData | null> {
        const currentTime = time || this.metadataService.getCurrentTime();
        if (!currentTime) {
            console.error('No time coordinate available');
            return null;
        }

        try {
            const url = `/proxy/data?vars=u10,v10&time=${currentTime}&format=json`;
            console.log('Loading wind data from:', url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Wind data loaded:', result);

            if (!result.data || !result.data.u10 || !result.data.v10) {
                throw new Error('Invalid wind data format');
            }

            // Convert to WindData format for particle renderer
            const metadata = result.metadata || {};
            const dims = metadata.dimensions || {};
            const coords = metadata.coordinates || {};
            
            const nx = dims.longitude?.size || 1440;
            const ny = dims.latitude?.size || 721;
            
            const lonArray = coords.longitude || [];
            const latArray = coords.latitude || [];
            
            const bounds = {
                west: lonArray.length > 0 ? lonArray[0] : -180,
                east: lonArray.length > 1 ? lonArray[lonArray.length - 1] : 180,
                north: latArray.length > 0 ? latArray[0] : 90,
                south: latArray.length > 1 ? latArray[latArray.length - 1] : -90
            };

            // Reshape flat arrays into 2D arrays
            const u: number[][] = [];
            const v: number[][] = [];
            
            for (let j = 0; j < ny; j++) {
                u[j] = [];
                v[j] = [];
                for (let i = 0; i < nx; i++) {
                    const idx = j * nx + i;
                    u[j][i] = result.data.u10[idx] || 0;
                    v[j][i] = result.data.v10[idx] || 0;
                }
            }

            return {
                u,
                v,
                bounds,
                width: nx,
                height: ny
            };
        } catch (error) {
            console.error('Failed to load wind data:', error);
            return null;
        }
    }

    async loadScalarData(variable: string, time?: string, level?: string): Promise<any | null> {
        const currentTime = time || this.metadataService.getCurrentTime();
        if (!currentTime) {
            console.error('No time coordinate available');
            return null;
        }

        // Check cache
        const cacheKey = `${variable}-${currentTime}-${level || 'surface'}`;
        if (this.cachedGrids.has(cacheKey)) {
            return this.cachedGrids.get(cacheKey)!;
        }

        try {
            let url = `/proxy/data?vars=${variable}&time=${currentTime}`;
            if (level && level !== 'surface') {
                url += `&level=${level}`;
            }
            url += '&format=json';
            
            console.log('Loading scalar data from:', url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Scalar data loaded for', variable, ':', result);

            if (!result.data || !result.data[variable]) {
                throw new Error(`Invalid data format for variable: ${variable}`);
            }

            // Build grid structure
            const metadata = result.metadata || {};
            const dims = metadata.dimensions || {};
            const coords = metadata.coordinates || {};
            
            const nx = dims.longitude?.size || 1440;
            const ny = dims.latitude?.size || 721;
            
            const lonArray = coords.longitude || [];
            const latArray = coords.latitude || [];
            
            const lo1 = lonArray.length > 0 ? lonArray[0] : 0;
            const lo2 = lonArray.length > 1 ? lonArray[lonArray.length - 1] : 359.75;
            const la1 = latArray.length > 0 ? latArray[0] : 90;
            const la2 = latArray.length > 1 ? latArray[latArray.length - 1] : -90;
            
            const dx = nx > 1 ? (lo2 - lo1) / (nx - 1) : 0.25;
            const dy = ny > 1 ? Math.abs(la1 - la2) / (ny - 1) : 0.25;

            const data = result.data[variable];
            const reshapedData: number[][] = [];
            for (let j = 0; j < ny; j++) {
                reshapedData[j] = [];
                for (let i = 0; i < nx; i++) {
                    reshapedData[j][i] = data[j * nx + i];
                }
            }

            const scalarData = {
                data: reshapedData,
                bounds: {
                    north: la1,
                    south: la2,
                    east: lo2,
                    west: lo1
                },
                width: nx,
                height: ny
            };

            // Cache the result
            this.cachedGrids.set(cacheKey, scalarData as any);

            return scalarData;
        } catch (error) {
            console.error(`Failed to load scalar data for ${variable}:`, error);
            return null;
        }
    }

    private buildGrid(params: { header: any; data: number[] }): GridData {
        const { header, data } = params;
        const { nx, ny, lo1, la1, dx, dy } = header;

        // Build 2D grid for interpolation
        const grid: (number | null)[][] = [];
        let p = 0;
        const isContinuous = Math.floor(nx * dx) >= 360;

        for (let j = 0; j < ny; j++) {
            const row: (number | null)[] = [];
            for (let i = 0; i < nx; i++, p++) {
                row[i] = data[p];
            }
            if (isContinuous) {
                // For wrapped grids, duplicate first column as last column
                row.push(row[0]);
            }
            grid[j] = row;
        }

        // Bilinear interpolation function
        const interpolate = (lon: number, lat: number): number | null => {
            // Normalize longitude to [0, 360)
            const λ = ((lon % 360) + 360) % 360;
            const φ = lat;

            const i = (λ - lo1) / dx;
            const j = (la1 - φ) / dy;

            const fi = Math.floor(i), ci = fi + 1;
            const fj = Math.floor(j), cj = fj + 1;

            const row = grid[fj];
            if (row) {
                const g00 = row[fi];
                const g10 = row[ci];
                if (this.isValue(g00) && this.isValue(g10)) {
                    const nextRow = grid[cj];
                    if (nextRow) {
                        const g01 = nextRow[fi];
                        const g11 = nextRow[ci];
                        if (this.isValue(g01) && this.isValue(g11)) {
                            // Bilinear interpolation
                            const x = i - fi;
                            const y = j - fj;
                            const rx = 1 - x;
                            const ry = 1 - y;
                            return g00! * rx * ry + g10! * x * ry + g01! * rx * y + g11! * x * y;
                        }
                    }
                }
            }
            return null;
        };

        return {
            header,
            data,
            interpolate
        };
    }

    private isValue(x: any): boolean {
        return x !== null && x !== undefined && !isNaN(x);
    }

    clearCache() {
        this.cachedGrids.clear();
    }
}
