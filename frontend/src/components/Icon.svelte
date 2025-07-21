<script lang="ts">
  let { size = '1em', children } = $props<{ size?: string; children?: any }>();
</script>

<span style:font-size={size} style="display: inline-flex; align-items: center; justify-content: center;">
	{@render children?.()}
</span>
