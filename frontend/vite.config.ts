import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [
    enhancedImages(),
    svelte(),
    Icons({
      compiler: 'svelte'
    })
  ]
});

