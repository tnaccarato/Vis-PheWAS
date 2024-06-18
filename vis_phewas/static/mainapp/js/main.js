import Graph from 'graphology';
import {Sigma} from 'sigma';
import {getAddFilter, getApplyFilters, getClearFilters, getRemoveFilter, getUpdateFilterInput} from "./filter";
import {closeInfoContainer, getAdjustSigmaContainer, getExportData, getShowAlert} from "./utils";
import {calculateNodeColor, clickedNode, getApplyLayout, hoverOffNode, hoverOnNode} from "./graph";


// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container, {allowInvalidContainer: true});
    window.updateFilterInput = getUpdateFilterInput(adjustSigmaContainerHeight);
    window.addFilter = getAddFilter(adjustSigmaContainerHeight);
    window.removeFilter = getRemoveFilter(adjustSigmaContainerHeight)

    function adjustSigmaContainerHeight() {
        getAdjustSigmaContainer(container, sigmaInstance);
    }

    window.applyFilters = getApplyFilters(showAlert, fetchGraphData, sigmaInstance);
    window.clearFilters = getClearFilters(adjustSigmaContainerHeight, showAlert, fetchGraphData);



    fetchGraphData()

    function fetchGraphData(params = {}) {
        console.log('Params:', params); // Debugging log
        const query = new URLSearchParams(params).toString();
        const url = '/api/graph-data/' + (query ? '?' + query : '');

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (params.type) {
                    updateGraph(data.nodes, data.edges, data.visible, params.clicked);
                } else {
                    initializeGraph(data.nodes, data.edges, data.visible);
                }
            })
            .catch(error => console.error('Error loading graph data:', error));
    }

    function initializeGraph(nodes, edges, visible) {
        // Ensure the container is correctly referenced, assuming it has a valid ID or declared properly
        const container = document.getElementById('sigma-container'); // Adjust according to your actual container ID or variable

        // Calculate center and radius based on container dimensions
        const centerX = container.offsetWidth / 2;
        const centerY = container.offsetHeight / 2;
        const radius = Math.min(centerX, centerY) - 100; // Adjusting radius to ensure nodes don't touch the edges

        // Clear any existing graph data
        graph.clear();

        // Loop through nodes to position them in a circle starting at 12 o'clock
        nodes.forEach((node, nodeNumber) => {
            if (!node in visible) {
                return;
            }
            if (!graph.hasNode(node.id)) {
                // Calculate the angle with an offset to start at 12 o'clock
                const angle = (2 * Math.PI * nodeNumber / nodes.length) - Math.PI / 2;
                // Calculate x and y coordinates based on the angle
                const x = centerX + radius * Math.cos(angle);
                const y = centerY - radius * Math.sin(angle); // Inverted y-axis to start at 12 o'clock

                // Debugging log to check angles and positions
                console.log(`Node ${node.id}: angle ${angle} radians, x: ${x}, y: ${y}`);

                // Add node to the graph with calculated positions
                graph.addNode(node.id, {
                    label: node.label.replace('HLA_', ''), // Assuming label cleanup
                    full_label: node.label,
                    node_type: node.node_type,
                    x: x,
                    y: y,
                    size: 10,
                    hidden: false,
                    color: getNodeColor(node),
                });
            }
        });


        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target);
                graph.setEdgeAttribute(edge.source, edge.target, 'hidden', false);
                console.log('Edge:', edge); // Debugging log
            }
        });

        applyLayout();
    }

    function updateGraph(nodes, edges, visible, clicked) {
        console.log(visible)
        // Get all nodes and edges in the graph
        const graphNodes = graph.nodes();
        const graphEdges = graph.edges();

        if (!clicked) {
            // Hide all nodes and edges
            graphNodes.forEach(node => {
                    graph.setNodeAttribute(node, 'hidden', true);
                }
            );
            graphEdges.forEach(edge => {
                    graph.setEdgeAttribute(edge, 'hidden', true);
                }
            );

        sigmaInstance.refresh()
            }
        nodes.forEach(node => {
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label.replace('HLA_', ''),
                    full_label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    size: 8,
                    color: getNodeColor(node),
                });
            }
            graph.setNodeAttribute(node.id, 'hidden', visible.includes(node.id));
        });

        edges.forEach(edge => {
            if (!graph.hasEdge(edge.id)) {
                graph.addEdge(edge.source, edge.target, {'color': 'darkgrey'});
            }
        });

        applyLayout();
    }

    function getNodeColor(node) {
        return calculateNodeColor(node);
    }

    function applyLayout() {
        getApplyLayout(graph, sigmaInstance);
    }

    function getInfoTable(nodeData) {
        const infoContainer = document.getElementsByClassName('info-container')[0];
        console.log('Node data:', nodeData); // Debugging log
        const selectedNode = `${nodeData.node_type}-${nodeData.full_label}`
        console.log('Selected node:', selectedNode); // Debugging log
        // Get edges connected to the node
        const edges = graph.edges().filter(edge => {
            const source = graph.source(edge);
            const target = graph.target(edge);
            console.log(`Edge: ${edge}, Source: ${source}, Target: ${target}`);
            return source === selectedNode || target === selectedNode;
        });
        console.log('Edges:', edges); // Debugging log
        // Gets the disease node connected to the allele node
        const diseaseNode = edges.map(edge => {
                return graph.source(edge) === selectedNode ? graph.target(edge) : graph.source(edge);
            }
        )[0];
        console.log(diseaseNode)
        // Gets the edges connected to the disease node
        const diseaseEdges = graph.edges().filter(edge => {
                const source = graph.source(edge);
                const target = graph.target(edge);
                return source === diseaseNode || target === diseaseNode;
            }
        );
        console.log(diseaseEdges)
        // Clear the container
        infoContainer.innerHTML = '';
        const closeButton = document.createElement('button');
        closeButton.className = 'btn btn-danger';
        closeButton.textContent = 'X';
        closeButton.onclick = closeInfoContainer(adjustSigmaContainerHeight)
        infoContainer.appendChild(closeButton);
        const title = document.createElement('h3');
        // Gets title from nodeData
        title.textContent = nodeData.full_label + ' Information';
        // Aligns the title to the center
        title.style.textAlign = 'center';
        infoContainer.appendChild(title);
        // Add a close button to the info container

        // Fetch data from the API for the allele
        const allele = nodeData.full_label;
        const disease = graph.getNodeAttributes(diseaseNode).full_label;
        const encodedAllele = encodeURIComponent(allele);
        const encodedDisease = encodeURIComponent(disease);
        const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

        function getTopOddsTable(top_odds) {
            // Create a heading for the table
            const heading = document.createElement('h4');
            heading.textContent = 'Top Odds Ratios for Allele';
            // Append the heading to the info container
            const infoContainer = document.getElementsByClassName('info-container')[0];
            infoContainer.appendChild(heading);

            // Create the table element
            const table = document.createElement('table');
            table.className = 'top-odds-table table table-striped table-bordered table-hover table-sm';

            // Create the header row
            const headerRow = document.createElement('tr');
            const header1 = document.createElement('th');
            header1.textContent = 'Disease';
            headerRow.appendChild(header1);
            const header2 = document.createElement('th');
            header2.textContent = 'Odds Ratio';
            headerRow.appendChild(header2);
            table.appendChild(headerRow);

            // Unpack the top_odds object and add each key-value pair as a row in the table
            top_odds.forEach(odds => {
                // Create a row element
                const row = document.createElement('tr');
                const diseaseCell = document.createElement('td');
                // Get the disease name from the odds object
                diseaseCell.textContent = odds.phewas_string;
                row.appendChild(diseaseCell);
                // Get the odds ratio from the odds object
                const oddsCell = document.createElement('td');
                oddsCell.textContent = odds.odds_ratio.toString();
                row.appendChild(oddsCell);
                // Append the row to the table
                table.appendChild(row);
            });

            // Append the table to the info container
            infoContainer.appendChild(table);
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {
                    const table = document.createElement('table');
                    table.className = 'allele-info-table table table-striped table-bordered table-hover table-sm';
                    const headerRow = document.createElement('tr');
                    const header1 = document.createElement('th');
                    header1.textContent = 'Field';
                    headerRow.appendChild(header1);
                    const header2 = document.createElement('th');
                    header2.textContent = 'Value';
                    headerRow.appendChild(header2);
                    table.appendChild(headerRow);
                    // Separate top_odds object from the rest of the data
                    const {top_odds, ...otherData} = data;
                    // Loop through the otherData object and add each key-value pair as a row in the table
                    Object.entries(otherData).forEach(([key, value]) => {
                        const row = document.createElement('tr');
                        const cell1 = document.createElement('td');
                        cell1.textContent = key;
                        row.appendChild(cell1);
                        const cell2 = document.createElement('td');
                        cell2.textContent = value;
                        row.appendChild(cell2);
                        table.appendChild(row);
                    });
                    infoContainer.style.overflowY = 'auto';
                    infoContainer.appendChild(table);
                    getTopOddsTable(top_odds)
                }
            )
            .catch(error => console.error('Error loading allele info:', error));
    }

    sigmaInstance.on('clickNode', ({node}) => {
            clickedNode(graph, node, fetchGraphData, adjustSigmaContainerHeight, getInfoTable);
        }
    );

    // Event listener for when a node hover event is triggered
    sigmaInstance.on('enterNode', ({node}) => {
        hoverOnNode(node, graph, sigmaInstance);
    });

// Event listener for when a node hover ends
    sigmaInstance.on('leaveNode', ({node}) => {
        hoverOffNode(node, graph, getNodeColor, sigmaInstance);
    });

    // Exports the current query to a CSV file
    window.exportQuery = function () {
        getExportData(showAlert);
    };

    // Function to show an alert message
    function showAlert(message) {
        getShowAlert(message);
    }
});

