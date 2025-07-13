<script lang="ts">
    // 我们期望从父组件接收一个字符串作为要显示的数据
    let { text = '' } = $props();
</script>

<span class="info-text">
  {text || '...'}
</span>

<style>
    .info-text {
        color: var(--color-text-secondary, #94a3b8);
        font-family: var(--font-family-mono, monospace);
        font-size: 0.9em;
        /* 让文本不会过长而破坏布局 */
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px; /* 可以根据需要设置一个最大宽度 */
        display: inline-block; /* 让 max-width 生效 */
        vertical-align: middle; /* 垂直居中对齐 */
    }
</style>