<script lang="ts">
    // Define all projection options in a single, easy-to-edit array.
    const projections = [
        { value: 'atlantis', label: 'Atlantis', display: 'a' },
        { value: 'azimuthal_equidistant', label: 'Azimuthal Equidistant', display: 'ae' },
        { value: 'conic_equidistant', label: 'Conic Equidistant', display: 'ce' },
        { value: 'equirectangular', label: 'Equirectangular', display: 'e' },
        { value: 'orthographic', label: 'Orthographic', display: 'o' },
        { value: 'stereographic', label: 'Stereographic', display: 's' },
        { value: 'waterman', label: 'Waterman Butterfly', display: 'wb' },
        { value: 'winkel3', label: 'Winkel Tripel', display: 'w3' }
    ];

    // The currently selected projection. 'orthographic' is a good default.
    let { value = $bindable('orthographic') } = $props();
</script>

<div class="projection-toggle-group" role="radiogroup" aria-label="Map Projection">
    {#each projections as proj (proj.value)}
        <button
                class="toggle-button"
                class:active={value === proj.value}
                title={proj.label}
                aria-label={proj.label}
                aria-checked={value === proj.value}
                role="radio"
                onclick={() => (value = proj.value)}
        >
            {proj.display}
        </button>
    {/each}
</div>

<style>
    .projection-toggle-group {
        display: inline-flex;
        flex-wrap: wrap; /* Allow buttons to wrap to the next line on small screens */
        gap: var(--spacing-1, 4px);
    }

    .toggle-button {
        /* Reset button styles */
        background-color: var(--color-surface-1, #1e293b);
        border: 1px solid transparent;
        color: var(--color-text-secondary, #94a3b8);

        font-family: var(--font-family-mono, monospace);
        font-size: 0.8em;

        padding: var(--spacing-1, 4px) var(--spacing-2, 8px);
        border-radius: 4px;
        cursor: pointer;

        transition: all 150ms ease-out;
    }

    .toggle-button:hover {
        color: var(--color-text-primary, #e2e8f0);
        border-color: var(--color-accent, #38bdf8);
    }

    /* The active state */
    .toggle-button.active {
        background-color: var(--color-accent, #38bdf8);
        color: var(--color-background, #0f172a);
        font-weight: bold;
    }

    .toggle-button:focus-visible {
        outline: 2px solid var(--color-accent, #38bdf8);
        outline-offset: 2px;
    }
</style>