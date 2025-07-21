import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { enhancedImages } from '@sveltejs/enhanced-img';
import Icons from 'unplugin-icons/vite';
import * as path from 'path';

export default defineConfig({
  plugins: [
    enhancedImages(),
    svelte(),
    Icons({
      compiler: 'svelte'
    })
  ],
  // 👇 2. 添加 resolve.alias 配置
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib')
    }
  },
  // 👇 3. 添加 proxy 配置，将 /proxy/* 请求代理到 Rust 服务器
  server: {
    proxy: {
      '/proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
