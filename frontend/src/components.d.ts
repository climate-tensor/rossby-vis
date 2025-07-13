declare module '~icons/*' {
    import { SvelteComponent } from 'svelte';
    const component: typeof SvelteComponent;
    export default component;
}