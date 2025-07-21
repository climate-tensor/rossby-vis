/**
 * @fileoverview
 * Product Registry and Factory - Phase 1.3 Implementation
 * 
 * This module implements the main product registry, reproducing the
 * FACTORIES pattern from the original products.js with type safety.
 */

import type { Product, ProductFactory, ProductRegistry } from './types';
import { 
    createWind10mProduct, 
    createSurfaceWindProduct, 
    createUpperWindProduct 
} from './wind';
import { 
    createTemperature2mProduct, 
    createSeaSurfaceTemperatureProduct, 
    createUpperTemperatureProduct,
    createDewpoint2mProduct 
} from './temperature';

/**
 * Product factory registry
 * Reproduces the FACTORIES pattern from the original products.js
 */
export const PRODUCT_FACTORIES: ProductRegistry = {
    // Wind products
    'wnd10m': createWind10mProduct,
    'wind-surface': createSurfaceWindProduct,
    'wind-850': () => createUpperWindProduct(850),
    'wind-500': () => createUpperWindProduct(500),
    'wind-250': () => createUpperWindProduct(250),
    
    // Temperature products
    't2m': createTemperature2mProduct,
    'd2m': createDewpoint2mProduct,
    'sst': createSeaSurfaceTemperatureProduct,
    'temp-850': () => createUpperTemperatureProduct(850),
    'temp-500': () => createUpperTemperatureProduct(500),
    'temp-250': () => createUpperTemperatureProduct(250),
};

/**
 * Product factory service
 * Provides the main interface for creating and managing products
 */
export class ProductService {
    private static instance: ProductService;
    private productCache = new Map<string, Product>();

    private constructor() {}

    /**
     * Get singleton instance
     */
    static getInstance(): ProductService {
        if (!ProductService.instance) {
            ProductService.instance = new ProductService();
        }
        return ProductService.instance;
    }

    /**
     * Create a product by ID
     * Reproduces the product creation logic from the original products.js
     */
    createProduct(productId: string): Product | null {
        // Check cache first
        if (this.productCache.has(productId)) {
            return this.productCache.get(productId)!;
        }

        // Get factory from registry
        const factory = PRODUCT_FACTORIES[productId];
        if (!factory) {
            console.warn(`Unknown product ID: ${productId}`);
            return null;
        }

        try {
            // Create product using factory
            const product = factory();
            
            // Cache the product
            this.productCache.set(productId, product);
            
            return product;
        } catch (error) {
            console.error(`Failed to create product ${productId}:`, error);
            return null;
        }
    }

    /**
     * Get all available product IDs
     */
    getAvailableProductIds(): string[] {
        return Object.keys(PRODUCT_FACTORIES);
    }

    /**
     * Get all available products
     */
    getAvailableProducts(): Product[] {
        return this.getAvailableProductIds()
            .map(id => this.createProduct(id))
            .filter((product): product is Product => product !== null);
    }

    /**
     * Get products by role (base or overlay)
     */
    getProductsByRole(role: 'base' | 'overlay'): Product[] {
        return this.getAvailableProducts()
            .filter(product => product.role === role);
    }

    /**
     * Get products by type (vector or scalar)
     */
    getProductsByType(type: 'vector' | 'scalar'): Product[] {
        return this.getAvailableProducts()
            .filter(product => product.type === type);
    }

    /**
     * Clear product cache
     */
    clearCache(): void {
        this.productCache.clear();
    }

    /**
     * Check if a product exists
     */
    hasProduct(productId: string): boolean {
        return productId in PRODUCT_FACTORIES;
    }
}

/**
 * Default product service instance
 */
export const productService = ProductService.getInstance();

/**
 * Convenience function to create a product
 * Maintains compatibility with the original factory pattern
 */
export function createProduct(productId: string): Product | null {
    return productService.createProduct(productId);
}

/**
 * Export all types and implementations for external use
 */
export * from './types';
export * from './grid';
export * from './wind';
export * from './temperature';
