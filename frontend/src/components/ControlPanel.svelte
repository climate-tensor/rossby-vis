<script>
    import ProbeDisplay from './ProbeDisplay.svelte';
    import Status from "./Status.svelte";
    import Progress from "./Progress.svelte";
    import ProbeToggle from "./ProbeToggle.svelte";
    import GridToggle from "./GridToggle.svelte";
</script>

<div id="details">
    <Status />
    <ProbeDisplay />

    <p id="earth">
        <span id="show-menu" class="text-button" title="menu">earth</span>
        <Progress />
    </p>

    <div id="menu" class="invisible">
        <div style="text-align: right;">
            <div id="modes">
                <span class="text-button" id="wind-mode-enable" title="Wind mode"><img src="/icons/wind.svg"/></span>
                <span class="text-button" id="ocean-mode-enable" title="Ocean mode"><img src="/icons/ripple.svg"/></span>
                <span class="text-button" id="normal-mode-enable" title="Normal mode"><img src="/icons/pentagon-number-1.svg"/></span>
            </div>
            <div id="tools">
                <ProbeToggle />
                <GridToggle />
            </div>
        </div>
        <table>
            <tr>
                <td style="text-align: right; margin-right: 3em;">Data</td><td style="text-align: center;"><span id="data-layer"></span></td>
            </tr>
            <tr>
                <td style="text-align: right; margin-right: 3em;">Source</td><td style="text-align: center;"><span id="data-center"></span></td>
            </tr>
            <tr>
                <td style="text-align: right; margin-right: 3em;">Control</td><td style="text-align: center;">
                <span class="text-button" id="nav-backward-more"><img src="/icons/chevron-left-pipe.svg" /></span>
                <span class="text-button" id="nav-backward"><img src="/icons/chevron-left.svg" /></span>
                <span id="data-time"></span>
                <span class="text-button" id="nav-forward"><img src="/icons/chevron-right.svg" /></span>
                <span class="text-button" id="nav-forward-more"><img src="/icons/chevron-right-pipe.svg" /></span>
            </td>
            </tr>
            <tr>
                <td style="text-align: right"><span id="scale-label">Scale</span></td><td style="text-align: center;"><canvas id="scale"></canvas></td>
            </tr>
            <tr id="height-selection" class="invisible">
                <td style="text-align: right; margin-right: 3em;">Height</td>
                <td style="text-align: center;">
                    <span class="surface text-button" id="surface-level" title="Surface"></span>
                </td>
            </tr>
            <tr class="wind-mode">
                <td style="text-align: right; margin-right: 3em;">Overlay</td>
                <td id="wind-mode-overlay-variables" style="text-align: center;">
                    <span class="text-button" id="overlay-off"></span>
                </td>
            </tr>
            <tr class="ocean-mode invisible">
                <td style="text-align: right; margin-right: 3em;">Overlay</td>
                <td  id="ocean-mode-overlay-variables" style="text-align: center;"></td>
            </tr>
            <tr>
                <td style="text-align: right; margin-right: 3em;">Projection</td><td style="text-align: center;">
                <span class="proj text-button" id="atlantis" title="Atlantis">a</span>
                <span class="proj text-button" id="azimuthal_equidistant" title="Azimuthal Equidistant">ae</span>
                <span class="proj text-button" id="conic_equidistant" title="Conic Equidistant">ce</span>
                <span class="proj text-button" id="equirectangular" title="Equirectangular">e</span>
                <span class="proj text-button" id="orthographic" title="Orthographic">o</span>
                <span class="proj text-button" id="stereographic" title="Stereographic">s</span>
                <span class="proj text-button" id="waterman" title="Waterman Butterfly">wb</span>
                <span class="proj text-button" id="winkel3" title="Winkel Tripel">w3</span>
            </td>
            </tr>
            <tr>
                <td style="text-align: right; margin-right: 3em;">Language</td><td id="lang" style="text-align: center;"><a href="/jp" class="internal-link">日本語</a></td>
            </tr>
        </table>
    </div>
</div>
