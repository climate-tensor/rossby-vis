<script lang="ts">
  import './app.css';
  import Globe from './components/Globe.svelte';
  import ControlPanel from "./components/ControlPanel.svelte";
  import Status from './components/Status.svelte';
  import InfoDisplay from './components/InfoDisplay.svelte';
  import Progress from './components/Progress.svelte';

  // Application state
  let dataLayer = $state('GFS');
  let dataSource = $state('NCEP/National Weather Service/NOAA');
  let menuVisible = $state(false);
</script>

<main id="app">
  <div class="fill-screen" id="display">
    <Globe />
  </div>
  <Progress />
  <Status />
  <InfoDisplay />
  <ControlPanel bind:menuVisible bind:dataLayer bind:dataSource />
</main>
