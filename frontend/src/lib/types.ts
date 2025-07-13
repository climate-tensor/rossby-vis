/**
 * 描述一个数据层（基础层或叠加层）
 */
export interface DataLayer {
    id: string;
    name: string;
    description: string;
    source: string;
    unit: string;
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
export type Projection = 'ortho' | 'merc' | 'equirectangular';
