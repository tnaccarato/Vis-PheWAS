import Graph from 'graphology';
import {Sigma} from 'sigma';
import {getAddFilter, getApplyFilters, getClearFilters, getRemoveFilter, getUpdateFilterInput} from "./filter";
import {clamp, closeInfoContainer, getAdjustSigmaContainer, getExportData, getShowAlert, sizeScale} from "./utils";
import {calculateNodeColor, clickedNode, getApplyLayout, hoverOffNode, hoverOnNode} from "./graph";

// Declare a global variable to store the show_subtypes value
let show_subtypes = true;

// Ensure the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    const container = document.getElementById('sigma-container');
    const graph = new Graph({multi: true});
    const sigmaInstance = new Sigma(graph, container, {allowInvalidContainer: true, labelRenderedSizeThreshold: 500});
    window.updateFilterInput = getUpdateFilterInput(adjustSigmaContainerHeight);
    window.addFilter = getAddFilter(adjustSigmaContainerHeight);
    window.removeFilter = getRemoveFilter(adjustSigmaContainerHeight)

    function adjustSigmaContainerHeight() {
        getAdjustSigmaContainer(container, sigmaInstance);
    }

    window.applyFilters = getApplyFilters(showAlert, fetchGraphData, sigmaInstance);
    window.clearFilters = getClearFilters(adjustSigmaContainerHeight, showAlert, fetchGraphData);

    // Function to update global variable show_subtypes
    function updateShowSubtypes() {
        show_subtypes = !show_subtypes;
        // Toggle the button state
        const showSubtypesButton = document.getElementById('show-subtypes-button');
        console.log('Show subtypes:', show_subtypes); // Debugging log
        // Grey out the button if show_subtypes is false
        showSubtypesButton.classList.toggle('btn-secondary', !show_subtypes);
    }

    window.updateShowSubtypes = updateShowSubtypes;

    // Fetch the graph data on page load
    fetchGraphData()


    // Function to fetch graph data from the API
    function fetchGraphData(params = {}) {
        // Add the show_subtypes parameter to the params object
        params.show_subtypes = show_subtypes;
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

    // Function to initialize the graph
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
                    size: 8,
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


    }

    // Function to update the graph with new nodes and edges
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
            console.log('Node:', node); // Debugging log
            console.log('Node P:', node.p); // Debugging log
            console.log('Node Size:', sizeScale(clamp(node.p, sizeScale.domain))); // Debugging log
            if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, {
                    label: node.label.replace('HLA_', ''),
                    full_label: node.label,
                    node_type: node.node_type,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
                    // Clamp the node size to avoid outlying values
                    size: node.node_type === 'allele' ? sizeScale(clamp(node.p, sizeScale.domain())) : 6,
                    // If there is an odds_ratio attribute in the node data, add it here
                    odds_ratio: node.node_type === 'allele' ? node.odds_ratio : null,
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

    // Function to calculate the color of a node based on its node type
    function getNodeColor(node) {
        return calculateNodeColor(node);
    }

    // Function to apply the layout to the graph
    function applyLayout() {
        getApplyLayout(graph, sigmaInstance);
    }

    // Function to get the allele information table for a selected node
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

        // Fetch data from the API for the allele
        const allele = nodeData.full_label;
        const disease = graph.getNodeAttributes(diseaseNode).full_label;
        const encodedAllele = encodeURIComponent(allele);
        const encodedDisease = encodeURIComponent(disease);
        const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

        function getOddsTable(top_odds) {
            // Append the heading to the info container
            const infoContainer = document.getElementsByClassName('info-container')[0];

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
            const header3 = document.createElement('th');
            header3.textContent = 'P-Value';
            headerRow.appendChild(header3);
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
                // Get the p-value from the odds object
                const pValueCell = document.createElement('td');
                pValueCell.textContent = odds.p.toString();
                row.appendChild(pValueCell);
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
                    const {top_odds, lowest_odds, ...otherData} = data;
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
                    const top_affective_head = document.createElement('h4');
                    top_affective_head.textContent = 'Most Affected Diseases';
                    top_affective_head.style.textAlign = 'center';
                    infoContainer.appendChild(top_affective_head);
                    getOddsTable(top_odds)
                    const top_protective_head = document.createElement('h4');
                    top_protective_head.textContent = 'Most Protective Diseases';
                    top_protective_head.style.textAlign = 'center';
                    infoContainer.appendChild(top_protective_head);
                    getOddsTable(lowest_odds)
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



