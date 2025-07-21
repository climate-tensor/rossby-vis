<script lang="ts">
    import type { SvelteComponent } from 'svelte';
    import Icon from './Icon.svelte';

    type Props = {
        icon: typeof SvelteComponent;
        active?: boolean;
        disabled?: boolean;
        label?: string;
        onclick?: () => void;
    };

    // Use $props for Svelte 5 syntax
    let { icon, active = false, disabled = false, label = 'Toggle Button', onclick }: Props = $props();
</script>

<button
        class="toggle-button"
        class:active
        class:disabled
        aria-label={label}
        aria-pressed={active}
        {disabled}
        onclick={onclick}
>
    <Icon size="1.5em">
        {@const Component = icon}
        <Component />
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

    .toggle-button:hover:not(:disabled) {
        background-color: rgba(255, 255, 255, 0.1);
    }

    /* Active state */
    .toggle-button.active {
        background-color: rgba(40, 40, 40, 0.85); /* Dim black background */
        color: #ffffff; /* White icon color */
    }

    /* Disabled state */
    .toggle-button:disabled,
    .toggle-button.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        color: #555555;
    }

    .toggle-button:disabled:hover,
    .toggle-button.disabled:hover {
        background-color: transparent;
    }
</style>
