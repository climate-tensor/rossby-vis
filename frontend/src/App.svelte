<script lang="ts">
  import './app.css';
  import Globe from './components/Globe.svelte';
  import ControlPanel from "./components/ControlPanel.svelte";
  import Status from './components/Status.svelte';
  import InfoDisplay from './components/InfoDisplay.svelte';
  import Progress from './components/Progress.svelte';
  
  // Import stores
  import { activeBaseLayer, activeOverlayLayer } from './lib/stores.js';

  // Application state - now derived from the stores
  let dataLayer: string;
  let dataSource: string;
  let menuVisible = false;

  // Reactive statements instead of $derived runes
  $: dataLayer = $activeOverlayLayer?.name || $activeBaseLayer?.name || 'No layer selected';
  $: dataSource = $activeOverlayLayer?.source || $activeBaseLayer?.source || 'No source available';
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
