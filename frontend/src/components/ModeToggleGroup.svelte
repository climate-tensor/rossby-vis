<script lang="ts">
    import ToggleButton from './ToggleButton.svelte';
    import { currentMode, availableModes, metadataService } from '$lib/metadata-service';
    import type { PhysicalMode } from '$lib/types';

    // Import icons
    import IconAtmosphere from '~icons/mdi/weather-windy';
    import IconOcean from '~icons/mdi/waves';
    import IconSurface from '~icons/mdi/web';

    const allModes = [
        { value: 'atm' as PhysicalMode, label: 'Atmosphere', icon: IconAtmosphere },
        { value: 'ocn' as PhysicalMode, label: 'Ocean', icon: IconOcean },
        { value: 'sfc' as PhysicalMode, label: 'Surface', icon: IconSurface }
    ];

    // Filter modes to show only available ones
    $: visibleModes = allModes.filter(mode => $availableModes.includes(mode.value));

    // Use metadata-driven mode instead of bindable prop
    function handleModeChange(newMode: PhysicalMode) {
        metadataService.setMode(newMode);
    }
</script>

<div class="mode-toggle-group" role="radiogroup" aria-label="System Mode">
    {#each visibleModes as mode (mode.value)}
        <ToggleButton
                icon={mode.icon}
                label={mode.label}
                active={$currentMode === mode.value}
                disabled={!$availableModes.includes(mode.value)}
                onclick={() => handleModeChange(mode.value)}
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
