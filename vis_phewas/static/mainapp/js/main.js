import Graph from 'graphology';
import { Sigma } from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';

// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container);

    // Load initial data (categories only)
    fetchGraphData();

    function fetchGraphData(params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = '/api/graph-data/' + (query ? '?' + query : '');
        console.log('Fetching data from:', url);

        fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log('Data received:', data);
            if (params.type) {
                updateGraph(data.nodes, data.edges);
            } else {
                initializeGraph(data.nodes, data.edges);
            }
        })
        .catch(error => console.error('Error loading graph data:', error));
    }

    function initializeGraph(nodes, edges) {
        console.log('Initializing graph with nodes and edges');
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,  // Ensure the type is set
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    size: 10,
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

    function updateGraph(nodes, edges) {
        console.log('Updating graph with new nodes and edges');
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
                    node_type: node.node_type,  // Ensure the type is set
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

    function applyLayout() {
        const settings = {
            iterations: 100,
            settings: { gravity: 0.5, scalingRatio: 2.0 }
        };

        forceAtlas2.assign(graph, settings);
        sigmaInstance.refresh();
    }

    sigmaInstance.on('clickNode', ({node}) => {
        const nodeData = graph.getNodeAttributes(node);
        console.log('Node clicked:', nodeData); // Debugging log

        if (nodeData.node_type === 'category') {
            console.log('Fetching diseases for category:', nodeData.label);
            fetchGraphData({type: 'diseases', category_id: node});
        } else if (nodeData.node_type === 'disease') {
            console.log('Fetching alleles for disease:', nodeData.label);
            fetchGraphData({type: 'alleles', disease_id: node});
        }
    });
});
