<script lang="ts">
    import ControlRow from './ControlRow.svelte';
    import ProbeDisplay from './ProbeDisplay.svelte';
    import Status from "./Status.svelte";
    import Progress from "./Progress.svelte";
    import InfoDisplay from './InfoDisplay.svelte';
    import OptionToggles from "./OptionToggles.svelte";
    import ModeToggleGroup from "./ModeToggleGroup.svelte";
    import ProjectionToggle from './ProjectionToggle.svelte';
    import Legend from './Legend.svelte';
    
    // Import stores
    import { 
        physicalMode, 
        activeBaseLayer, 
        activeOverlayLayer,
        availableBaseLayers,
        availableOverlayLayers,
        activeBaseLayerId,
        activeOverlayLayerId,
        probe
    } from '../lib/stores.js';

    let showGrid = $state(false);
    let showPin = $state(true);
    
    // Create local variables for layer selection
    let currentBaseLayerId = $state($activeBaseLayerId);
    let currentOverlayLayerId = $state($activeOverlayLayerId);
    let currentSelectedLevel = $state('');
    
    // Note: physicalMode is derived from metadata and cannot be set directly
    
    $effect(() => {
        console.log('🔄 ControlPanel: Setting activeBaseLayerId to:', currentBaseLayerId);
        activeBaseLayerId.set(currentBaseLayerId);
    });
    
    $effect(() => {
        console.log('🔄 ControlPanel: Setting activeOverlayLayerId to:', currentOverlayLayerId);
        activeOverlayLayerId.set(currentOverlayLayerId);
    });
    
    // Sync store changes to local variables
    $effect(() => {
        console.log('📥 ControlPanel: Store activeBaseLayerId changed to:', $activeBaseLayerId);
        currentBaseLayerId = $activeBaseLayerId;
    });
    
    $effect(() => {
        console.log('📥 ControlPanel: Store activeOverlayLayerId changed to:', $activeOverlayLayerId);
        currentOverlayLayerId = $activeOverlayLayerId;
    });
    
    // Debug logging for available layers
    $effect(() => {
        console.log('📋 ControlPanel: Available base layers:', $availableBaseLayers.map(l => ({ id: l.id, name: l.name })));
        console.log('📋 ControlPanel: Available overlay layers:', $availableOverlayLayers.map(l => ({ id: l.id, name: l.name })));
        console.log('🎯 ControlPanel: Active base layer:', $activeBaseLayer ? { id: $activeBaseLayer.id, name: $activeBaseLayer.name } : null);
        console.log('🎯 ControlPanel: Active overlay layer:', $activeOverlayLayer ? { id: $activeOverlayLayer.id, name: $activeOverlayLayer.name } : null);
    });

    let {
        dataLayer = $bindable(),
        dataSource = $bindable(),
        menuVisible = $bindable(false)
    } = $props();

    let legendData = $state({
        colormap: [[48, 59, 107],[255, 255, 255],[128, 35, 21]] as [number, number, number][],
        min: -35,
        max: 50,
        unit: "°C"
    });

</script>

<div id="control-panel" class="control-panel">
    <Status />
    <Progress />

    <div id="probe"  class="invisible">
        <ProbeDisplay />
    </div>

    <div id="control-panel-handle">
        <button id="show-board" class="text-button" title="Toggle Menu" onclick={() => menuVisible = !menuVisible}>Earth</button>
    </div>

    <div id="control-panel-board"  class="control-panel-grid" class:invisible={!menuVisible}>
        <ControlRow label="Controls">
            <OptionToggles bind:grid={showGrid} bind:pin={showPin} />
            <ModeToggleGroup />
        </ControlRow>

        <ControlRow label="Data">
            <InfoDisplay text={dataLayer} />
        </ControlRow>

        <ControlRow label="Source">
            <InfoDisplay text={dataSource} />
        </ControlRow>

        <ControlRow label="Base">
            <select bind:value={currentBaseLayerId} onchange={(e) => {
                const target = e.target as HTMLSelectElement;
                console.log('🎯 ControlPanel: User selected base layer:', target.value);
                console.log('🎯 ControlPanel: currentBaseLayerId is now:', currentBaseLayerId);
            }}>
                {#each $availableBaseLayers as layer}
                    <option value={layer.id}>{layer.name}</option>
                {/each}
            </select>
        </ControlRow>

        <ControlRow label="Overlay">
            <select bind:value={currentOverlayLayerId}>
                <option value="">None</option>
                {#each $availableOverlayLayers as layer}
                    <option value={layer.id}>{layer.name}</option>
                {/each}
            </select>
        </ControlRow>

        {#if $activeBaseLayer?.levels && $activeBaseLayer.levels.length > 0}
            <ControlRow label={$physicalMode === 'atm' ? 'Pressure Level' : $physicalMode === 'ocn' ? 'Depth' : 'Level'}>
                <select bind:value={currentSelectedLevel}>
                    {#each $activeBaseLayer.levels as level}
                        <option value={level.value}>
                            {level.label}
                        </option>
                    {/each}
                </select>
            </ControlRow>
        {/if}

        <ControlRow label="Scale">
            <Legend
                    colormap={legendData.colormap}
                    min={legendData.min}
                    max={legendData.max}
                    unit={legendData.unit}
            />
        </ControlRow>

        <ControlRow label="Projection">
            <ProjectionToggle />
        </ControlRow>
    </div>
</div>

<style>
    .control-panel {
        position: absolute;
        bottom: 0;
        left: 0;
        margin: 1em;
        display: flex;
        flex-direction: column;
        z-index: 1000;
        pointer-events: all;
    }

    .control-panel-grid {
        margin: 0.5em 0;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--spacing-4, 1rem);
        align-items: center;
    }

    .control-panel-grid :global(> *) {
        display: contents;
    }

    .invisible {
        display: none;
    }

    .text-button {
        width: 100%;
        height: 100%;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-size: 1.2em;
        font-weight: bold;
        color: inherit;
        cursor: pointer;
        text-align: inherit;
    }

    .text-button:focus-visible {
        outline: 2px solid var(--color-focus-outline, #4F46E5);
        outline-offset: 2px;
    }

    .text-button:hover {
        color: var(--color-text-hover, #3B82F6);
    }

    #control-panel-handle {
        cursor: pointer;
        user-select: none;
        padding: 0.5em;
        background-color: var(--color-background-secondary, #0F172A);
        border-radius: 0.25rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
</style>
