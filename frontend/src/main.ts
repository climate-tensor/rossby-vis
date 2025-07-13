// frontend/src/main.ts
import 'modern-normalize/modern-normalize.css';
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte'; // 👈 1. Import the 'mount' function

let app;

// We still keep this wrapper to prevent the race condition
window.addEventListener('DOMContentLoaded', () => {
    // 👇 2. Use the new mount() function
    app = mount(App, {
        target: document.getElementById('app')!,
    });
});

export default app;