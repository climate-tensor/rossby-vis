<script>
    import ControlRow from './ControlRow.svelte';
    import ProbeDisplay from './ProbeDisplay.svelte';
    import Status from "./Status.svelte";
    import Progress from "./Progress.svelte";
    import InfoDisplay from './InfoDisplay.svelte';
    import ProbeToggle from "./ProbeToggle.svelte";
    import GridToggle from "./GridToggle.svelte";
    import ModeToggle from "./ModeToggle.svelte";
    import ProjectionToggle from './ProjectionToggle.svelte';
    import Legend from './Legend.svelte';

    let mode = $state('atm');

    let {
        dataLayer = 'Temperature at 500hPa',
        dataSource = 'ERA5 Reanalysis'
    } = $props();

    let legendData = $state({
        colormap: [[48, 59, 107],[255, 255, 255],[128, 35, 21]],
        min: -35,
        max: 50,
        unit: "°C"
    });

</script>

<div id="details">
    <Status />
    <ProbeDisplay />

    <p id="earth">
        <span id="show-menu" class="text-button" title="menu">earth</span>
        <Progress />
    </p>

    <div id="menu"  class="control-panel-grid invisible">
        <ControlRow label="Controls">
            <ProbeToggle />
            <GridToggle />
            <ModeToggle bind:value={mode} />
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
    .control-panel-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--spacing-4, 1rem);
        align-items: center;
    }

    .control-panel-grid :global(> *) {
        display: contents;
    }
</style>
