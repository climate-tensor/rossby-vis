<script lang="ts">
    export let label: string;
</script>

<div class="row">
    <span class="label">{label}</span>
    <div class="control"><slot /></div>
</div>

<style>
    .row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 0.5em;
        padding: 0.5em 0;
    }

    .label {
        justify-self: end;
        font-size: 0.9em;
        color: var(--color-text-secondary, #94a3b8);
    }

    .control {
        justify-self: start;
        width: 100%;
    }
</style>