<script lang="ts">
    import { onMount } from 'svelte';
    import { simulationTime } from '$lib/stores';
    import {createGlobeRenderer, type GlobeInstance} from '$lib/globe-renderer'; // 类型定义，很好

    let globe: GlobeInstance | undefined;

    // 使用 Svelte 5 的 $effect 来代替旧的 $: 语法
    // 这个 effect 会在 globe 或 $simulationTime 变化时自动运行
    $effect(() => {
        if (globe && $simulationTime) {
            globe.setTime($simulationTime);
        }
    });

    // Svelte Action 是处理这种场景的绝佳模式
    async function initializeGlobe(node: HTMLCanvasElement) {
        try {
            // 直接 await 动态导入，让代码更扁平化
            const module = await import('$lib/globe-renderer');

            if (typeof module.createGlobeRenderer !== 'function') {
                throw new Error("模块 '$lib/globe-renderer' 没有一个有效的默认导出 (default export)。它应该导出一个 class。");
            }

            globe = module.createGlobeRenderer(node);
            globe.render();

        } catch (error) {
            console.error("初始化地球渲染器失败:", error);
        }

        return {
            destroy() {
                // 当组件销毁时，清理资源
                globe?.destroy();
            }
        };
    }
</script>

<div id="display">
    <svg id="map" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
    <!-- 将 Action 应用到我们希望渲染地球的 canvas 上 -->
    <canvas id="base" class="fill-screen" use:initializeGlobe></canvas>
    <canvas id="overlay" class="fill-screen"></canvas>
    <svg id="foreground" class="fill-screen" xmlns="http://www.w3.org/2000/svg"></svg>
</div>