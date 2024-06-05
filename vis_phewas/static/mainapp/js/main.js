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

    function fetchGraphData(query = {}) {
        fetch('/api/graph-data/?' + new URLSearchParams(query))
        .then(response => response.json())
        .then(data => {
            if (query.type) {
                updateGraph(data.nodes, data.edges);
            } else {
                initializeGraph(data.nodes, data.edges);
            }
        })
        .catch(error => console.error('Error loading graph data:', error));
    }

    function initializeGraph(nodes, edges) {
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
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
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label,
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
        switch (node.type) {
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

        if (nodeData.type === 'category') {
            fetchGraphData({type: 'diseases', category_id: node});
        } else if (nodeData.type === 'disease') {
            fetchGraphData({type: 'alleles', disease_id: node});
        }
    });
});
