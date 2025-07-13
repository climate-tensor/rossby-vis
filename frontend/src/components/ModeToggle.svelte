<script lang="ts">
    import Icon from './Icon.svelte';

    // Directly import the icon components. This is statically analyzable.
    import IconAtmosphere from '~icons/mdi/weather-windy';
    import IconOcean from '~icons/mdi/waves';
    import IconSurface from '~icons/mdi/web'; // Using the recommended icon

    const modes = [
        { value: 'atm', label: 'Atmosphere', icon: IconAtmosphere },
        { value: 'ocn', label: 'Ocean', icon: IconOcean },
        { value: 'sfc', label: 'Surface', icon: IconSurface }
    ];

    let { value = $bindable('atm') } = $props();
</script>

<div class="mode-toggle-group" role="radiogroup" aria-label="System Mode">
    {#each modes as mode (mode.value)}
        <button
                class="toggle-button"
                class:active={value === mode.value}
                aria-label={mode.label}
                aria-checked={value === mode.value}
                role="radio"
                onclick={() => (value = mode.value)}
        >
            <Icon size="1.5em">
                <svelte:component this={mode.icon} />
            </Icon>
        </button>
    {/each}
</div>

<style>
    .mode-toggle-group {
        display: inline-flex;
        border-radius: 0.5rem;
        overflow: hidden;
        border: 1px solid var(--color-surface-1, #1e293b);
    }
    /* ...etc */
</style>