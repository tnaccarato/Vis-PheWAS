import Sigma from 'sigma';

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('sigma-container');

    // Create a new Sigma instance with a container and optional settings
    const sigmaInstance = new Sigma(container, {
        // Settings such as node color, edge properties, etc.
        defaultNodeColor: '#ec5148',
        // Additional settings can be specified as needed
    });

    // Your graph data setup and manipulation here
});
