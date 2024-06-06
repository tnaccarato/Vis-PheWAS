import Graph from 'graphology';
import {Sigma} from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';

// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Initialize the Sigma instance
    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container);

    // Load initial data (categories only)
    fetchGraphData();

    // Fetch graph data from the server
    function fetchGraphData(params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = '/api/graph-data/' + (query ? '?' + query : '');
        console.log('Fetching data from:', url);

        fetch(url)
            .then(response => {
                // Check for errors
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            // Parse the JSON response
            .then(data => {
                console.log('Data received:', data);
                if (params.type) {
                    updateGraph(data.nodes, data.edges);
                } else {
                    initializeGraph(data.nodes, data.edges);
                }
            })
            // Catch any errors and log them
            .catch(error => console.error('Error loading graph data:', error));
    }

    // Initialize the graph with nodes and edges
    function initializeGraph(nodes, edges) {
        // Debugging log
        console.log('Initializing graph with nodes and edges');
        // For each node in the data, add it to the graph
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100, // Random x position
                    y: Math.random() * 100, // Random y position
                    size: 10, // Default size
                    color: getNodeColor(node) // Get color based on node type
                });
            }
        });

        // For each edge in the data, add it to the graph
        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target);
            }
        });

        // Apply the layout to the graph
        applyLayout();
    }

    // Update the graph with new nodes and edges
    function updateGraph(nodes, edges) {
        console.log('Updating graph with new nodes and edges');
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    size: 8,
                    color: getNodeColor(node)
                });
            }
        });

        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target);
            }
        });

        applyLayout();
    }

    // Get the color based on the node type
    function getNodeColor(node) {
        switch (node.node_type) {
            case 'category':
                return '#FF5733';
            case 'disease':
                return '#33C1FF';
            case 'allele':
                return '#FFFF33';
            default:
                return '#000000';
        }
    }

    // Apply the ForceAtlas2 layout to the graph
    function applyLayout() {
        const settings = {
            iterations: 100,
            settings: {gravity: 0.5, scalingRatio: 2.0} // Gravity and scaling ratio for the layout
        };

        // Apply the layout to the graph
        forceAtlas2.assign(graph, settings);
        // Refresh the Sigma instance to display the updated graph
        sigmaInstance.refresh();
    }

    // Handle node click events
    sigmaInstance.on('clickNode', ({node}) => {
        const nodeData = graph.getNodeAttributes(node);
        console.log('Node clicked:', nodeData); // Debugging log

        // Fetch data based on the node type
        if (nodeData.node_type === 'category') {
            console.log('Fetching diseases for category:', nodeData.label);
            fetchGraphData({type: 'diseases', category_id: node});
        } else if (nodeData.node_type === 'disease') {
            console.log('Fetching alleles for disease:', nodeData.label);
            const encodedNode = encodeURIComponent(node);
            console.log('Encoded node ID:', encodedNode); // Debugging log
            fetchGraphData({type: 'alleles', disease_id: encodedNode});
        }
    });

    // Define the filter logic functions
    window.updateFilterInput = function (select) {
        const filterInputContainer = select.parentNode.querySelector('#filter-input-container');
        const selectedField = select.value;

        // Clear the input container
        filterInputContainer.innerHTML = '';

        // Add the appropriate input element based on the selected field
        if (selectedField === 'size') {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '1';
            slider.max = '20';
            slider.value = '10';
            filterInputContainer.appendChild(slider);
        } else if (selectedField === 'color') {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter color (e.g., #FF5733)';
            filterInputContainer.appendChild(input);
        } else if (selectedField === 'node_type') {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter node type (e.g., category)';
            filterInputContainer.appendChild(input);

            adjustSigmaContainerHeight();
        }
    };

    window.addFilter = function () {
        const filterGroup = document.createElement('div');
        filterGroup.className = 'filter-group';

        const label = document.createElement('label');
        label.textContent = 'Field:';
        filterGroup.appendChild(label);

        const select = document.createElement('select');
        select.onchange = function () {
            updateFilterInput(select);
        };
        select.innerHTML = `
        <option value="size">Size</option>
        <option value="color">Color</option>
        <option value="node_type">Node Type</option>
    `;
        filterGroup.appendChild(select);

        const filterInputContainer = document.createElement('div');
        filterInputContainer.id = 'filter-input-container';
        filterGroup.appendChild(filterInputContainer);

        const plusButton = document.createElement('button');
        plusButton.textContent = '+';
        plusButton.onclick = addFilter;
        filterGroup.appendChild(plusButton);

        const minusButton = document.createElement('button');
        minusButton.textContent = '-';
        minusButton.onclick = function () {
            removeFilter(minusButton);
        };
        filterGroup.appendChild(minusButton);

        document.getElementById('filters-container').appendChild(filterGroup);

        // Adjust the width of the Sigma container
        adjustSigmaContainerHeight();
    };

    // Function to remove a filter
    window.removeFilter = function (button) {
        const filterGroup = button.parentNode;
        filterGroup.remove();

        adjustSigmaContainerHeight();
    }


// Function to adjust the width of the Sigma container
    function adjustSigmaContainerHeight() {
        const filtersContainer = document.getElementById('filters-container');
        const filtersHeight = filtersContainer.offsetHeight;

        container.style.height = `calc(100% - ${filtersHeight}px)`;
        sigmaInstance.refresh();
    }


    window.applyFilters = function () {
        const filterGroups = document.querySelectorAll('.filter-group');

        let filters = [];
        filterGroups.forEach(group => {
            const select = group.querySelector('select');
            const input = group.querySelector('input');
            if (select && input) {
                filters.push({
                    field: select.value,
                    value: input.type === 'range' ? input.value : input.value.toLowerCase()
                });
            }
        });

        console.log('Applying filters:', filters);

        // Apply filters to the graph nodes
        graph.forEachNode((node, attributes) => {
            let visible = true;

            filters.forEach(filter => {
                if (filter.field === 'size') {
                    visible = visible && (attributes.size == filter.value);
                } else if (filter.field === 'color') {
                    visible = visible && (attributes.color === filter.value);
                } else if (filter.field === 'node_type') {
                    visible = visible && (attributes.node_type.toLowerCase() === filter.value);
                }
            });

            graph.setNodeAttribute(node, 'hidden', !visible);
        });

        sigmaInstance.refresh();
    };
});