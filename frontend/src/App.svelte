<script lang="ts">
  import './app.css';
  import Earth from './components/Earth.svelte';
  import ControlPanel from "./components/ControlPanel.svelte";
  import Status from './components/Status.svelte';
  import InfoDisplay from './components/InfoDisplay.svelte';
  import Progress from './components/Progress.svelte';
  import { onMount, onDestroy } from 'svelte';
  
  // Import stores and URL synchronization
  import { activeBaseLayer, activeOverlayLayer, initializeUrlSync } from './lib/stores.js';

  // Application state - now derived from the stores
  let dataLayer: string;
  let dataSource: string;
  let menuVisible = false;
  let urlSyncCleanup: (() => void) | null = null;

  // Reactive statements instead of $derived runes
  $: dataLayer = $activeOverlayLayer?.name || $activeBaseLayer?.name || 'No layer selected';
  $: dataSource = $activeOverlayLayer?.source || $activeBaseLayer?.source || 'No source available';

  // Initialize URL synchronization on component mount (Phase 1.1)
  onMount(() => {
    urlSyncCleanup = initializeUrlSync();
  });

  // Cleanup URL synchronization on component destroy
  onDestroy(() => {
    if (urlSyncCleanup) {
      urlSyncCleanup();
    }
  });
</script>

<main id="app">
  <div class="fill-screen" id="display">
    <Earth />
  </div>
  <Progress />
  <Status />
  <InfoDisplay />
  <ControlPanel bind:menuVisible bind:dataLayer bind:dataSource />
</main>
