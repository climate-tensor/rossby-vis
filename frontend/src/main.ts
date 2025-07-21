// frontend/src/main.ts
import 'modern-normalize/modern-normalize.css';
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte'; // 👈 1. Import the 'mount' function
import { metadataService } from './lib/metadata-service';

let app;

// We still keep this wrapper to prevent the race condition
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize metadata service
    try {
        console.log('Initializing metadata service...');
        await metadataService.loadMetadata();
        console.log('Metadata service initialized successfully');
    } catch (error) {
        console.error('Failed to initialize metadata service:', error);
        // Continue with app startup even if metadata fails
    }

    // 👇 2. Use the new mount() function
    app = mount(App, {
        target: document.getElementById('app')!,
    });
});

export default app;
