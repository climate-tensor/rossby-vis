<script lang="ts">
    export let label: string;
</script>

<span class="label">{label}</span>
<div class="control">
    <slot /> </div>

<style>
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