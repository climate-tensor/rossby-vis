<script lang="ts">
  // This component now just acts as a simple wrapper for styling.
  let { size = '1em' } = $props<{ size?: string }>();
</script>

<span
        style:font-size={size}
        style="display: inline-flex; align-items: center; justify-content: center;"
>
	<slot />
</span>