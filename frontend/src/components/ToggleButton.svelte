<script lang="ts">
    import type { SvelteComponent } from 'svelte';
    import Icon from './Icon.svelte';

    type Props = {
        icon: typeof SvelteComponent;
        active?: boolean;
        label?: string;
    };

    // Use $props for Svelte 5 syntax
    let { icon, active = false, label = 'Toggle Button' }: Props = $props();
</script>

<button
        class="toggle-button"
        class:active
        aria-label={label}
        aria-pressed={active}
>
    <Icon size="1.5em">
        <svelte:component this={icon} />
    </Icon>
</button>

<style>
    .toggle-button {
        /* Default (inactive) state */
        background-color: transparent;
        color: #9e9e9e; /* Grey icon color */

        /* General styling */
        border: none;
        padding: 8px;
        margin: 2px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .toggle-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    /* Active state */
    .toggle-button.active {
        background-color: rgba(40, 40, 40, 0.85); /* Dim black background */
        color: #ffffff; /* White icon color */
    }
</style>