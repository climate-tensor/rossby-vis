export function createGlobeRenderer(canvas: HTMLCanvasElement) {
    // Initialize WebGL context
    const gl = canvas.getContext('webgl');
    if (!gl) {
        throw new Error('WebGL not supported');
    }

    // Set up the globe rendering logic here
    // This is a placeholder for the actual rendering logic
    function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // Add rendering code here
    }

    // Resize handler
    function resize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
        render();
    }

    window.addEventListener('resize', resize);
    resize();

    return {
        render,
        dispose() {
            window.removeEventListener('resize', resize);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
    };
}