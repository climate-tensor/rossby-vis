<script lang="ts">
    import Icon from './Icon.svelte';
    import IconGrid from '~icons/mdi/grid';
</script>

<button class="text-button" id="option-show-grid" aria-label="Toggle grid display">
    <Icon size="1.5em">
        <svelte:component this={IconGrid} />
    </Icon>
</button>