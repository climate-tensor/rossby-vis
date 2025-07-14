<script lang="ts">
  let { size = '1em' } = $props<{ size?: string }>();
</script>

<span style:font-size={size} style="display: inline-flex; align-items: center; justify-content: center;">
	<slot />
</span>