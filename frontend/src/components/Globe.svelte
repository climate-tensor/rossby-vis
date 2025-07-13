<script lang="ts">
    import { onMount } from 'svelte';
    import { simulationTime } from '$lib/stores'; // 导入 store
    import type { GlobeInstance } from '$lib/globe-renderer'; // 假设的渲染器类型

    let canvasElement: HTMLCanvasElement;
    let globe: GlobeInstance;

    // 这就是 Svelte Action
    function initializeGlobe(node: HTMLCanvasElement) {
        // 这是你的 `earth.js` 和 `globes.js` 的重写版本
        const globeRenderer = import('$lib/globe-renderer');

        globeRenderer.then(({ Globe }) => {
            // 将 canvas 节点交给新的渲染逻辑
            globe = new Globe(node);
            globe.render();
        });

        return {
            destroy() {
                // 当组件销毁时，清理资源
                globe?.destroy();
            }
        };
    }

    // 响应式地将 store 的变化传递给渲染器
    $: if (globe && $simulationTime) {
        globe.setTime($simulationTime);
    }
</script>

<div id="display">
    <svg id="map" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
    <canvas id="base" class="fill-screen" use:initializeGlobe></canvas>
    <canvas id="overlay" class="fill-screen"></canvas>
    <svg id="foreground" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
