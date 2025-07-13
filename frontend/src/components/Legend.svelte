<script lang="ts">
    import { onMount } from 'svelte';

    type Colormap = [number, number, number][];
    type Props = {
        colormap?: Colormap;
        min?: number;
        max?: number;
        unit?: string;
    };

    let {
        colormap = [
            [48, 59, 107],
            [255, 255, 255],
            [128, 35, 21]
        ],
        min = -20,
        max = 40,
        unit = '°C'
    } = $props<Props>();

    let canvasElement: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;

    // This is the corrected block.
    // $effect will automatically track any reactive values used inside it
    // (in this case, colormap, min, max, unit, which are read by drawLegend)
    // and re-run the effect when they change.
    $effect(() => {
        if (ctx) {
            drawLegend();
        }
    });

    onMount(() => {
        ctx = canvasElement.getContext('2d');
        // The initial draw is now handled by the $effect running for the first time
    });

    function drawLegend() {
        if (!ctx) return;

        const { width, height } = canvasElement;
        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        colormap.forEach((color, i) => {
            const stop = i / (colormap.length - 1);
            gradient.addColorStop(stop, `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
        });
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height - 15);

        ctx.fillStyle = 'var(--color-text-secondary, #94a3b8)';
        ctx.font = '12px var(--font-family-mono, monospace)';
        ctx.textAlign = 'left';
        ctx.fillText(`${min.toFixed(0)}`, 0, height - 2);

        ctx.textAlign = 'center';
        ctx.fillText(unit, width / 2, height - 2);

        ctx.textAlign = 'right';
        ctx.fillText(`${max.toFixed(0)}`, width, height - 2);
    }
</script>

<canvas bind:this={canvasElement} width="200" height="30"></canvas>