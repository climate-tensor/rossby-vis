<script lang="ts">
    import ToggleButton from './ToggleButton.svelte'; // Assuming you have this from before

    // Import icons
    import IconGrid from '~icons/mdi/grid';
    import IconPin from '~icons/mdi/pin';

    let { grid, pin } = $props<{ grid: boolean, pin: boolean }>();
</script>

<div class="options-container">
    <ToggleButton
            icon={IconGrid}
            active={grid}
            label="Toggle grid display"
            onclick={() => (grid = !grid)}
    />

    <ToggleButton
            icon={IconPin}
            active={pin}
            label="Toggle probe display"
            onclick={() => (pin = !pin)}
    />
</div>

<style>
    .options-container {
        display: inline-flex;
        border-radius: 0.5rem;
        overflow: hidden;
    }
</style>