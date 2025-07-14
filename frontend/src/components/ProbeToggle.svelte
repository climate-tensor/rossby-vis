<script lang="ts">
    import Icon from "./Icon.svelte";
    import IconPin from '~icons/mdi/pin';
</script>

<button class="text-button" id="option-show-pin" aria-label="Toggle probe display">
    <Icon size="1.5em">
        <svelte:component this={IconPin} />
    </Icon>
</button>