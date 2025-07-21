# Migration Plan: From Legacy JS to Svelte-based Rendering

The goal is to migrate the rendering logic from the legacy JavaScript implementation to the new Svelte/TypeScript frontend. This plan focuses on modularity, performance, and alignment with the new UI design, while respecting the core, battle-tested algorithms of the original system.

---

## Phase 1: Establish Core Rendering Infrastructure

This phase lays the foundation by creating the main Svelte component and porting the essential geographic and data-handling logic into modern TypeScript modules.

1.  **Create the Central `Globe.svelte` Component:**
    *   **Action:** This component will be the heart of the visualization, replacing the collection of `div` and `canvas` elements in `public/index.html`.
    *   **Details:** It will manage multiple canvas layers: one for the base map (coastlines, gridlines), one for the data "base" layer (color fill), and one for the "overlay" layer (particle animations).

2.  **Develop a Modern Globe Rendering Module (`globe-renderer.ts`):**
    *   **Action:** Create a new module `frontend/src/lib/globe-renderer.ts` to handle the geographic aspects, replacing the functionality of `globes.js`.
    *   **Details:**
        *   It will use D3.js (already a dependency) to manage map projections (`orthographic`, `equirectangular`, etc.).
        *   It will contain functions to render TopoJSON data to a canvas, drawing the Earth's landmass and gridlines.
        *   It will manage user interactions (drag, zoom), updating the projection state reactively.

3.  **Port the Data Processing Logic (`data-loader.ts`):**
    *   **Action:** Create `frontend/src/lib/data-loader.ts` to be the modern equivalent of `products.js`.
    *   **Details:**
        *   This service will fetch data from the backend API.
        *   Crucially, it will port the `buildGrid` function and the **bilinear interpolation** algorithm (`bilinearInterpolateVector`) from the original `products.js`. This preserves the core data-sampling logic. The output will be a standardized `Grid` object with an `interpolate(lon, lat)` method.

---

## Phase 2: Implement Visualization Layers

This phase focuses on rendering the actual data on top of the base map, following the "Base + Overlay" model from the new UI design.

1.  **Implement the Color Fill Renderer (Base Layer):**
    *   **Action:** Develop a dedicated module, `color-fill-renderer.ts`, to handle the rendering of variables like temperature or pressure.
    *   **Details:**
        *   This module will implement the core logic of `interpolateField` from the original `earth.js`.
        *   It will iterate over the visible pixels of the globe, use the `interpolate` method from the loaded data grid to get a value, map that value to a color using a colormap, and draw it to an offscreen canvas.
        *   This pre-rendered canvas image will then be displayed by the `Globe.svelte` component, ensuring the main thread remains unblocked during animation.

2.  **Implement the Particle Animation Renderer (Overlay Layer):**
    *   **Action:** Create `wind-particle-renderer.ts` to manage the particle animation, replacing the `animate` logic from `earth.js`.
    *   **Details:**
        *   It will use a pre-computed vector field (generated similarly to the color fill layer) for high performance.
        *   The animation loop will simply look up the vector at each particle's position and update its coordinates, without performing expensive re-interpolation on every frame.
        *   It will implement the **projection distortion correction** algorithm from `micro.js` to ensure wind vectors are visually accurate across all map projections. This is a critical step for scientific correctness.

---

## Phase 3: Integration, State Management, and Finalization

This phase ties everything together within the Svelte application.

1.  **Integrate Renderers into `Globe.svelte`:**
    *   **Action:** The `Globe.svelte` component will import and orchestrate the various renderer modules.
    *   **Details:** It will react to changes in Svelte stores (`stores.ts`). When the user selects a new variable, changes the time, or adjusts the pressure level, `Globe.svelte` will trigger the data loader and pass the new data grids to the appropriate renderers.

2.  **Ensure Reactive State Management:**
    *   **Action:** All user-configurable state (variables, time, level, projection, colormap) will be managed in `frontend/src/lib/stores.ts`.
    *   **Details:** The rendering modules will be driven by Svelte's reactivity. Changes in the stores will automatically propagate to the `Globe.svelte` component, which will then efficiently update the visualization.
