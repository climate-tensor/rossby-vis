<script lang="ts">
    import ToggleButton from './ToggleButton.svelte';

    // Import icons
    import IconAtmosphere from '~icons/mdi/weather-windy';
    import IconOcean from '~icons/mdi/waves';
    import IconSurface from '~icons/mdi/web';

    const modes = [
        { value: 'atm', label: 'Atmosphere', icon: IconAtmosphere },
        { value: 'ocn', label: 'Ocean', icon: IconOcean },
        { value: 'sfc', label: 'Surface', icon: IconSurface }
    ];

    // This component now has a bindable 'value' prop
    let { value = $bindable('atm') } = $props();
</script>

<div class="mode-toggle-group" role="radiogroup" aria-label="System Mode">
    {#each modes as mode (mode.value)}
        <ToggleButton
                icon={mode.icon}
                label={mode.label}
                active={value === mode.value}
                onclick={() => (value = mode.value)}
        />
    {/each}
</div>

<style>
    .mode-toggle-group {
        display: inline-flex;
        border-radius: 0.5rem;
        overflow: hidden;
        border: 1px solid #374151; /* Updated for better visibility */
    }

    /* We can adjust margins directly here if needed for group items */
    :global(.mode-toggle-group .toggle-button) {
        margin: 0;
        border-radius: 0;
    }
</style>