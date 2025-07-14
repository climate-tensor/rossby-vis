<script>
    import ControlRow from './ControlRow.svelte';
    import ProbeDisplay from './ProbeDisplay.svelte';
    import Status from "./Status.svelte";
    import Progress from "./Progress.svelte";
    import InfoDisplay from './InfoDisplay.svelte';
    import OptionToggles from "./OptionToggles.svelte";
    import ModeToggleGroup from "./ModeToggleGroup.svelte";
    import ProjectionToggle from './ProjectionToggle.svelte';
    import Legend from './Legend.svelte';

    let mode = $state('atm');
    let showGrid = $state(false);
    let showPin = $state(true);

    let {
        dataLayer,
        dataSource
    } = $props();

    let legendData = $state({
        colormap: [[48, 59, 107],[255, 255, 255],[128, 35, 21]],
        min: -35,
        max: 50,
        unit: "°C"
    });

    let boardVisible = $state(false);

    function toggle_board() {
        boardVisible = !boardVisible;
    }

</script>

<div id="control-panel" class="control-panel">
    <Status />
    <Progress />

    <div id="probe"  class="invisible">
        <ProbeDisplay />
    </div>

    <div id="control-panel-handle">
        <button id="show-board" class="text-button" title="title" onclick={toggle_board}>Earth</button>
    </div>

    <div id="control-panel-board"  class="control-panel-grid" class:invisible={!boardVisible}>
        <ControlRow label="Controls">
            <OptionToggles bind:grid={showGrid} bind:pin={showPin} />
            <ModeToggleGroup bind:value={mode} />
        </ControlRow>

        <ControlRow label="Data">
            <InfoDisplay text={dataLayer} />
        </ControlRow>

        <ControlRow label="Source">
            <InfoDisplay text={dataSource} />
        </ControlRow>

        <ControlRow label="Base">
            <select>
                <option>Temperature</option>
            </select>
            <select>
                <option>20</option>
                <option>50</option>
                <option>250</option>
                <option>500</option>
                <option>700</option>
                <option>1000</option>
            </select>
        </ControlRow>

        <ControlRow label="Overlay">
            <select>
                <option>Wind</option>
            </select>
            <select>
                <option>20</option>
                <option>50</option>
                <option>250</option>
                <option>500</option>
                <option>700</option>
                <option>1000</option>
            </select>
        </ControlRow>

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
